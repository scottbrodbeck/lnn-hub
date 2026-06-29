import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Admin-only: reads live WordPress status for submitted posts and schedules
// draft/pending posts for a future publish time. Intentionally NOT in
// config.toml so verify_jwt stays on (default), plus an explicit role check
// below since the schedule action mutates live client sites.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type WpStatus =
  | 'draft'
  | 'pending'
  | 'future'
  | 'publish'
  | 'private'
  | 'not_found'
  | 'error'
  | 'no_wp_post';

interface WpPostInfo {
  wpStatus: WpStatus;
  wpScheduledAtGmt: string | null;
  error?: string;
}

interface SchedulerRequest {
  action: 'status' | 'schedule';
  post_ids?: string[];
  post_id?: string;
  scheduled_at?: string; // ISO-8601 UTC instant
}

const MAX_STATUS_BATCH = 50;
const WP_FETCH_CONCURRENCY = 5;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function wpAuthHeader(username: string, appPassword: string): string {
  return `Basic ${btoa(`${username}:${appPassword}`)}`;
}

function wpPostEndpoint(siteUrl: string, wpPostId: number): string {
  return `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts/${wpPostId}`;
}

// WP returns date_gmt without a timezone suffix, and "0000-00-00T00:00:00"
// for floating-date drafts. Normalize to a real ISO instant or null so the
// frontend never parses a suffix-less string as local time.
function normalizeDateGmt(dateGmt: unknown): string | null {
  if (typeof dateGmt !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateGmt)) return null;
  if (dateGmt.startsWith('0000-')) return null;
  return `${dateGmt}Z`;
}

async function fetchWpPost(
  siteUrl: string,
  username: string,
  appPassword: string,
  wpPostId: number
): Promise<WpPostInfo> {
  try {
    const response = await fetch(`${wpPostEndpoint(siteUrl, wpPostId)}?context=edit`, {
      headers: { 'Authorization': wpAuthHeader(username, appPassword) },
    });

    if (response.status === 404) {
      return { wpStatus: 'not_found', wpScheduledAtGmt: null };
    }
    if (response.status === 401 || response.status === 403) {
      return { wpStatus: 'error', wpScheduledAtGmt: null, error: 'auth_failed' };
    }

    const json = await response.json();

    if (!response.ok) {
      if (json?.code === 'rest_post_invalid_id') {
        return { wpStatus: 'not_found', wpScheduledAtGmt: null };
      }
      return { wpStatus: 'error', wpScheduledAtGmt: null, error: json?.message || `HTTP ${response.status}` };
    }

    const status = typeof json?.status === 'string' ? json.status : 'error';
    return {
      wpStatus: status as WpStatus,
      wpScheduledAtGmt: normalizeDateGmt(json?.date_gmt),
    };
  } catch (error) {
    console.error(`WP fetch failed for post ${wpPostId} on ${siteUrl}:`, error);
    return { wpStatus: 'error', wpScheduledAtGmt: null, error: 'fetch_failed' };
  }
}

async function handleStatus(supabase: any, postIds: string[]): Promise<Response> {
  const ids = postIds.slice(0, MAX_STATUS_BATCH);
  const results: Record<string, WpPostInfo> = {};

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, wordpress_post_id, wordpress_site_id')
    .in('id', ids);

  if (postsError) {
    throw new Error(`Failed to load posts: ${postsError.message}`);
  }

  const siteIds = [...new Set(
    (posts || []).map((p: any) => p.wordpress_site_id).filter(Boolean)
  )];

  const sitesById = new Map<string, any>();
  if (siteIds.length > 0) {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, url, wordpress_username, wordpress_app_password')
      .in('id', siteIds);
    (sites || []).forEach((s: any) => sitesById.set(s.id, s));
  }

  // Posts requested but not found in the DB
  for (const id of ids) {
    results[id] = { wpStatus: 'no_wp_post', wpScheduledAtGmt: null };
  }

  const fetchable: Array<{ postId: string; site: any; wpPostId: number }> = [];
  for (const post of posts || []) {
    if (!post.wordpress_post_id || !post.wordpress_site_id) {
      results[post.id] = { wpStatus: 'no_wp_post', wpScheduledAtGmt: null };
      continue;
    }
    const site = sitesById.get(post.wordpress_site_id);
    if (!site?.url || !site?.wordpress_username || !site?.wordpress_app_password) {
      results[post.id] = { wpStatus: 'error', wpScheduledAtGmt: null, error: 'missing_credentials' };
      continue;
    }
    fetchable.push({ postId: post.id, site, wpPostId: post.wordpress_post_id });
  }

  // Fetch WP statuses in small concurrent batches
  for (let i = 0; i < fetchable.length; i += WP_FETCH_CONCURRENCY) {
    const batch = fetchable.slice(i, i + WP_FETCH_CONCURRENCY);
    await Promise.all(batch.map(async ({ postId, site, wpPostId }) => {
      results[postId] = await fetchWpPost(
        site.url,
        site.wordpress_username,
        site.wordpress_app_password,
        wpPostId
      );
    }));
  }

  return jsonResponse({ results });
}

async function handleSchedule(
  supabase: any,
  postId: string,
  scheduledAt: string
): Promise<Response> {
  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) {
    return jsonResponse({ error: 'invalid_scheduled_at' }, 400);
  }
  // WordPress publishes immediately when status 'future' has a past date —
  // reject anything that isn't comfortably in the future.
  if (when.getTime() <= Date.now() + 60_000) {
    return jsonResponse({ error: 'scheduled_time_in_past' }, 400);
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, headline, wordpress_post_id, wordpress_site_id')
    .eq('id', postId)
    .single();

  if (postError || !post) {
    return jsonResponse({ error: 'post_not_found' }, 404);
  }
  if (!post.wordpress_post_id || !post.wordpress_site_id) {
    return jsonResponse({ error: 'post_has_no_wordpress_post' }, 400);
  }

  const { data: site } = await supabase
    .from('sites')
    .select('id, url, wordpress_username, wordpress_app_password')
    .eq('id', post.wordpress_site_id)
    .single();

  if (!site?.url || !site?.wordpress_username || !site?.wordpress_app_password) {
    return jsonResponse({ error: 'missing_credentials' }, 400);
  }

  // Pre-check: only draft/pending posts are schedulable
  const current = await fetchWpPost(
    site.url,
    site.wordpress_username,
    site.wordpress_app_password,
    post.wordpress_post_id
  );
  if (current.wpStatus === 'not_found') {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  if (current.wpStatus === 'error') {
    return jsonResponse({ error: current.error || 'status_check_failed' }, 502);
  }
  if (current.wpStatus !== 'draft' && current.wpStatus !== 'pending') {
    return jsonResponse(
      { error: 'not_schedulable', currentStatus: current.wpStatus, currentScheduledAtGmt: current.wpScheduledAtGmt },
      409
    );
  }

  const dateGmt = when.toISOString().slice(0, 19);
  const scheduleResponse = await fetch(wpPostEndpoint(site.url, post.wordpress_post_id), {
    method: 'POST',
    headers: {
      'Authorization': wpAuthHeader(site.wordpress_username, site.wordpress_app_password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'future', date_gmt: dateGmt }),
  });

  const scheduleJson = await scheduleResponse.json();

  if (!scheduleResponse.ok) {
    await logSchedule(supabase, post, site.id, scheduledAt, 'error', scheduleJson?.message || `HTTP ${scheduleResponse.status}`);
    return jsonResponse({ error: scheduleJson?.message || 'Failed to schedule post in WordPress' }, 502);
  }

  // If the date slipped past during the request WP may have published it —
  // report whatever WP actually did.
  const resultStatus = typeof scheduleJson?.status === 'string' ? scheduleJson.status : 'future';
  const resultDateGmt = normalizeDateGmt(scheduleJson?.date_gmt) || when.toISOString();

  await logSchedule(supabase, post, site.id, scheduledAt, 'success');

  return jsonResponse({
    success: true,
    wpStatus: resultStatus,
    wpScheduledAtGmt: resultDateGmt,
  });
}

async function logSchedule(
  supabase: any,
  post: any,
  siteId: string,
  scheduledAt: string,
  status: 'success' | 'error',
  errorMessage?: string
) {
  try {
    await supabase.from('api_logs').insert({
      log_type: 'wordpress_schedule',
      status,
      summary: status === 'success'
        ? `Scheduled "${post.headline}" for ${scheduledAt}`
        : `Failed to schedule "${post.headline}"`,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      request_data: {
        action: 'schedule',
        scheduled_at: scheduledAt,
        wordpress_post_id: post.wordpress_post_id,
      },
      post_id: post.id,
      site_id: siteId,
    });
  } catch (logError) {
    console.error('Failed to write api_log:', logError);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify the caller is an admin (this function mutates live client sites)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }
    const { data: { user: caller } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!caller) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }
    const { data: callerRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .single();
    if (!callerRole || (callerRole.role !== 'admin' && callerRole.role !== 'super_admin')) {
      return jsonResponse({ error: 'Unauthorized: admin access required' }, 403);
    }

    const request: SchedulerRequest = await req.json();

    if (request.action === 'status') {
      if (!Array.isArray(request.post_ids) || request.post_ids.length === 0) {
        return jsonResponse({ error: 'post_ids array is required' }, 400);
      }
      return await handleStatus(supabase, request.post_ids);
    }

    if (request.action === 'schedule') {
      if (!request.post_id || !request.scheduled_at) {
        return jsonResponse({ error: 'post_id and scheduled_at are required' }, 400);
      }
      return await handleSchedule(supabase, request.post_id, request.scheduled_at);
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error: any) {
    console.error('Error in wordpress-post-scheduler:', error);
    return jsonResponse({ error: error.message || 'Internal error' }, 500);
  }
});
