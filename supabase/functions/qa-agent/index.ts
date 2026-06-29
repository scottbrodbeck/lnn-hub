import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CheckResult {
  name: string;
  pass: boolean;
  expected: any;
  actual: any;
}

const BROADSTREET_BASE_URL = 'https://api.broadstreetads.com/api/1';
const BROADSTREET_FALLBACK_BASE_URL = 'https://api.broadstreetads.com/api/0';

interface BroadstreetCredentials {
  accessToken: string;
  networkId: string;
}

interface BroadstreetApiResult {
  ok: boolean;
  status: number;
  contentType: string;
  data: any;
  preview: string | null;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

function getBroadstreetCredentials(siteConfig: any): BroadstreetCredentials | null {
  const accessToken = siteConfig?.access_token?.trim() || Deno.env.get('BROADSTREET_ACCESS_TOKEN')?.trim();
  const networkId = siteConfig?.network_id?.trim() || Deno.env.get('BROADSTREET_NETWORK_ID')?.trim();

  if (!accessToken || !networkId) {
    return null;
  }

  return { accessToken, networkId };
}

function buildBroadstreetUrl(baseUrl: string, endpoint: string, accessToken: string): string {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${baseUrl}${endpoint}${separator}access_token=${encodeURIComponent(accessToken)}`;
}

function normalizeBroadstreetList(data: any, keys: string[]): any[] {
  if (Array.isArray(data)) {
    return data;
  }

  for (const key of keys) {
    if (Array.isArray(data?.[key])) {
      return data[key];
    }
  }

  return [];
}

function normalizeComparableUrl(value: string | null | undefined): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function decodeHtmlEntities(value: string | null | undefined): string {
  return (value || '')
    .replace(/&#8217;|&#8216;|&#039;|&apos;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&#8230;|&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeComparableText(value: string | null | undefined): string {
  return decodeHtmlEntities(value || '')
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Fold typographic punctuation to ASCII so WordPress wptexturize rewrites don't trigger false positives
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compareNormalizedText(expected: string | null | undefined, actual: string | null | undefined): boolean {
  return normalizeComparableText(expected) === normalizeComparableText(actual);
}

function containsNormalizedText(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const normalizedNeedle = normalizeComparableText(needle);
  if (!normalizedNeedle) return false;
  return normalizeComparableText(haystack).includes(normalizedNeedle);
}

function getBroadstreetDestination(ad: any): string {
  return ad?.destination || ad?.target_url || ad?.url || '';
}

function formatBroadstreetResult(result: BroadstreetApiResult): string {
  const preview = result.preview ? `: ${result.preview}` : '';
  return `${result.status} (${result.contentType || 'unknown'})${preview}`;
}

async function parseBroadstreetResponse(resp: Response): Promise<BroadstreetApiResult> {
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();
  const preview = text ? text.substring(0, 200) : null;

  if (text) {
    try {
      return {
        ok: resp.ok,
        status: resp.status,
        contentType,
        data: JSON.parse(text),
        preview,
      };
    } catch {
      if (resp.ok) {
        return {
          ok: true,
          status: resp.status,
          contentType,
          data: { success: true, rawResponse: text },
          preview,
        };
      }

      return {
        ok: false,
        status: resp.status,
        contentType,
        data: { message: preview || `Broadstreet request failed with status ${resp.status}` },
        preview,
      };
    }
  }

  return {
    ok: resp.ok,
    status: resp.status,
    contentType,
    data: resp.ok ? { success: true } : { message: `Broadstreet request failed with status ${resp.status}` },
    preview: null,
  };
}

async function safeBroadstreetRequest(endpoint: string, credentials: BroadstreetCredentials): Promise<BroadstreetApiResult> {
  const primaryResponse = await fetch(buildBroadstreetUrl(BROADSTREET_BASE_URL, endpoint, credentials.accessToken), {
    headers: { 'Content-Type': 'application/json' },
  });
  const primaryResult = await parseBroadstreetResponse(primaryResponse);

  if (primaryResult.contentType.includes('text/html')) {
    const fallbackResponse = await fetch(buildBroadstreetUrl(BROADSTREET_FALLBACK_BASE_URL, endpoint, credentials.accessToken), {
      headers: { 'Content-Type': 'application/json' },
    });
    return await parseBroadstreetResponse(fallbackResponse);
  }

  return primaryResult;
}

async function wpGet(siteUrl: string, authHeader: string, path: string): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const url = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/${path}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': authHeader },
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, data: { error: message } };
  }
}

async function resolveWordPressSiteId(supabase: any, post: any): Promise<{ siteId: string | null; source: string | null }> {
  if (post.wordpress_site_id) {
    return { siteId: post.wordpress_site_id, source: 'post.wordpress_site_id' };
  }

  if (post.assignment_ids?.length > 0) {
    const { data: assignment } = await supabase
      .from('post_assignments')
      .select('site_id')
      .eq('id', post.assignment_ids[0])
      .maybeSingle();

    if (assignment?.site_id) {
      return { siteId: assignment.site_id, source: 'post.assignment_ids[0]' };
    }
  }

  const { data: latestLog } = await supabase
    .from('api_logs')
    .select('site_id, created_at')
    .eq('post_id', post.id)
    .in('log_type', ['wordpress_publish', 'wordpress_update'])
    .eq('status', 'success')
    .not('site_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestLog?.site_id) {
    return { siteId: latestLog.site_id, source: 'api_logs.site_id' };
  }

  return { siteId: null, source: null };
}

async function checkWordPressPost(supabase: any, postId: string): Promise<{ checks: CheckResult[]; status: string; externalId: string | null; siteId: string | null }> {
  const checks: CheckResult[] = [];

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (postError || !post) {
    checks.push({ name: 'db_record_exists', pass: false, expected: 'post found', actual: postError?.message || 'not found' });
    return { checks, status: 'error', externalId: null, siteId: null };
  }

  checks.push({ name: 'db_record_exists', pass: true, expected: 'post found', actual: 'found' });

  if (!post.wordpress_post_id) {
    checks.push({ name: 'wordpress_id_set', pass: false, expected: 'wordpress_post_id present', actual: 'null' });
    return { checks, status: 'fail', externalId: null, siteId: null };
  }

  checks.push({ name: 'wordpress_id_set', pass: true, expected: 'present', actual: String(post.wordpress_post_id) });

  const resolvedSite = await resolveWordPressSiteId(supabase, post);
  const siteId = resolvedSite.siteId;

  if (!siteId) {
    checks.push({ name: 'site_context_resolved', pass: false, expected: 'site context found', actual: 'site context missing' });
    return { checks, status: 'error', externalId: String(post.wordpress_post_id), siteId: null };
  }

  checks.push({
    name: 'site_context_resolved',
    pass: true,
    expected: 'site context found',
    actual: resolvedSite.source,
  });

  const { data: site } = await supabase.from('sites').select('*').eq('id', siteId).single();
  if (!site?.wordpress_username || !site?.wordpress_app_password) {
    checks.push({ name: 'site_credentials', pass: false, expected: 'credentials present', actual: 'missing' });
    return { checks, status: 'error', externalId: String(post.wordpress_post_id), siteId };
  }

  const authHeader = 'Basic ' + btoa(`${site.wordpress_username}:${site.wordpress_app_password}`);

  const wpPost = await wpGet(site.url, authHeader, `posts/${post.wordpress_post_id}`);
  checks.push({ name: 'wp_post_exists', pass: wpPost.ok, expected: '200', actual: String(wpPost.status) });

  if (!wpPost.ok) {
    return { checks, status: 'fail', externalId: String(post.wordpress_post_id), siteId };
  }

  const wpTitle = decodeHtmlEntities(wpPost.data?.title?.rendered || '').replace(/<[^>]*>/g, '');
  const expectedTitle = post.headline || '';
  checks.push({
    name: 'title_match',
    pass: compareNormalizedText(expectedTitle, wpTitle),
    expected: expectedTitle,
    actual: wpTitle,
  });

  if (post.wordpress_media_ids && typeof post.wordpress_media_ids === 'object') {
    const mediaIds = post.wordpress_media_ids as Record<string, any>;
    const expectedFeaturedMedia = mediaIds.featured_image || null;
    if (expectedFeaturedMedia) {
      const wpFeatured = wpPost.data?.featured_media;
      checks.push({ name: 'featured_image_set', pass: wpFeatured === expectedFeaturedMedia, expected: expectedFeaturedMedia, actual: wpFeatured });
    }
  }

  const expectedComments = post.comments_enabled ? 'open' : 'closed';
  checks.push({ name: 'comment_status', pass: wpPost.data?.comment_status === expectedComments, expected: expectedComments, actual: wpPost.data?.comment_status });

  checks.push({ name: 'wp_status_observed', pass: true, expected: '(informational)', actual: wpPost.data?.status ?? '(unknown)' });

  if (post.author_name && post.client_id) {
    const { data: authorMapping } = await supabase
      .from('wordpress_author_mappings')
      .select('wordpress_author_id')
      .eq('user_id', post.client_id)
      .eq('site_id', siteId)
      .maybeSingle();

    if (authorMapping?.wordpress_author_id) {
      const wpAuthor = await wpGet(site.url, authHeader, `ppma_author/${authorMapping.wordpress_author_id}`);
      checks.push({ name: 'author_exists_in_wp', pass: wpAuthor.ok, expected: '200', actual: String(wpAuthor.status) });

      if (wpAuthor.ok) {
        const wpAuthorName = decodeHtmlEntities(wpAuthor.data?.name || '');
        checks.push({
          name: 'author_name_match',
          pass: compareNormalizedText(post.author_name, wpAuthorName),
          expected: post.author_name,
          actual: wpAuthorName,
        });
      }
    }
  }

  if (post.sponsor_id) {
    const { data: sponsorMapping } = await supabase
      .from('wordpress_sponsor_mappings')
      .select('wordpress_sponsor_id')
      .eq('sponsor_id', post.sponsor_id)
      .eq('site_id', siteId)
      .maybeSingle();

    if (sponsorMapping?.wordpress_sponsor_id) {
      const wpSponsor = await wpGet(site.url, authHeader, `sponsors/${sponsorMapping.wordpress_sponsor_id}`);
      checks.push({ name: 'sponsor_exists_in_wp', pass: wpSponsor.ok, expected: '200', actual: String(wpSponsor.status) });
    }
  }

  const allPassed = checks.every(c => c.pass);
  return { checks, status: allPassed ? 'pass' : 'fail', externalId: String(post.wordpress_post_id), siteId };
}

async function checkBeehiivBlast(supabase: any, blastId: string): Promise<{ checks: CheckResult[]; status: string; externalId: string | null; siteId: string | null }> {
  const checks: CheckResult[] = [];

  const { data: blast, error: blastError } = await supabase
    .from('email_blasts')
    .select('*')
    .eq('id', blastId)
    .single();

  if (blastError || !blast) {
    checks.push({ name: 'db_record_exists', pass: false, expected: 'blast found', actual: blastError?.message || 'not found' });
    return { checks, status: 'error', externalId: null, siteId: null };
  }

  checks.push({ name: 'db_record_exists', pass: true, expected: 'blast found', actual: 'found' });

  const siteId = blast.site_id || null;

  if (!blast.beehiiv_post_id) {
    checks.push({ name: 'beehiiv_post_id_set', pass: false, expected: 'beehiiv_post_id present', actual: 'null' });
    return { checks, status: 'fail', externalId: null, siteId };
  }

  checks.push({ name: 'beehiiv_post_id_set', pass: true, expected: 'present', actual: blast.beehiiv_post_id });

  const { data: site } = await supabase.from('sites').select('beehiiv_config, name').eq('id', siteId).single();
  const beehiivConfig = site?.beehiiv_config as { api_key?: string; publication_id?: string } | null;

  if (!beehiivConfig?.api_key || !beehiivConfig?.publication_id) {
    checks.push({ name: 'beehiiv_credentials', pass: false, expected: 'api_key and publication_id present', actual: 'missing' });
    return { checks, status: 'error', externalId: blast.beehiiv_post_id, siteId };
  }

  try {
    const resp = await fetch(
      `https://api.beehiiv.com/v2/publications/${beehiivConfig.publication_id}/posts/${blast.beehiiv_post_id}`,
      {
        headers: {
          'Authorization': `Bearer ${beehiivConfig.api_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      checks.push({ name: 'beehiiv_draft_exists', pass: false, expected: '200', actual: `${resp.status}: ${text.substring(0, 100)}` });
      return { checks, status: 'fail', externalId: blast.beehiiv_post_id, siteId };
    }

    const result = await resp.json();
    const beehiivPost = result.data || result;
    checks.push({ name: 'beehiiv_draft_exists', pass: true, expected: 'draft exists', actual: 'found' });

    const beehiivTitle = beehiivPost.title || '';
    const titleContainsBlast = containsNormalizedText(beehiivTitle, blast.title);
    checks.push({ name: 'title_contains_blast_name', pass: titleContainsBlast, expected: `contains "${blast.title}"`, actual: beehiivTitle });

    const beehiivSubject = beehiivPost.email_subject_line || beehiivPost.subtitle || '';
    const subjectMatch = compareNormalizedText(blast.subject_line, beehiivSubject);
    checks.push({ name: 'subject_line_match', pass: subjectMatch, expected: blast.subject_line, actual: beehiivSubject });

    const beehiivStatus = beehiivPost.status || '';
    checks.push({ name: 'beehiiv_status_observed', pass: true, expected: '(informational)', actual: beehiivStatus || '(unknown)' });

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    checks.push({ name: 'beehiiv_api_reachable', pass: false, expected: 'success', actual: message });
    return { checks, status: 'error', externalId: blast.beehiiv_post_id, siteId };
  }

  const allPassed = checks.every(c => c.pass);
  return { checks, status: allPassed ? 'pass' : 'fail', externalId: blast.beehiiv_post_id, siteId };
}

async function checkBroadstreetAd(supabase: any, placementId: string): Promise<{ checks: CheckResult[]; status: string; externalId: string | null; siteId: string | null }> {
  const checks: CheckResult[] = [];

  const { data: placement, error: placementError } = await supabase
    .from('display_ad_placements')
    .select('*, display_ad_campaigns(*, site_id)')
    .eq('id', placementId)
    .single();

  if (placementError || !placement) {
    checks.push({ name: 'db_record_exists', pass: false, expected: 'placement found', actual: placementError?.message || 'not found' });
    return { checks, status: 'error', externalId: null, siteId: null };
  }

  checks.push({ name: 'db_record_exists', pass: true, expected: 'placement found', actual: 'found' });

  const campaign = placement.display_ad_campaigns;
  const siteId = campaign?.site_id || null;

  if (!siteId) {
    checks.push({ name: 'site_resolved', pass: false, expected: 'site_id found', actual: 'could not resolve site' });
    return { checks, status: 'error', externalId: String(placement.broadstreet_advertisement_id), siteId: null };
  }

  const { data: site } = await supabase.from('sites').select('broadstreet_config').eq('id', siteId).single();
  const credentials = getBroadstreetCredentials(site?.broadstreet_config);

  if (!credentials) {
    checks.push({ name: 'broadstreet_credentials', pass: false, expected: 'access_token and network_id present', actual: 'missing' });
    return { checks, status: 'error', externalId: String(placement.broadstreet_advertisement_id), siteId };
  }

  return await verifyBroadstreetAd(checks, placement, campaign, siteId, credentials);
}

async function verifyBroadstreetAd(
  checks: CheckResult[],
  placement: any,
  campaign: any,
  siteId: string,
  credentials: BroadstreetCredentials
): Promise<{ checks: CheckResult[]; status: string; externalId: string | null; siteId: string | null }> {
  const adId = Number(placement.broadstreet_advertisement_id);
  const externalId = String(placement.broadstreet_advertisement_id);
  const campaignId = campaign?.broadstreet_campaign_id;
  const advertiserId = campaign?.broadstreet_advertiser_id;

  if (!campaignId) {
    checks.push({ name: 'campaign_id_set', pass: false, expected: 'broadstreet campaign id present', actual: 'missing' });
    return { checks, status: 'error', externalId, siteId };
  }

  if (!advertiserId) {
    checks.push({ name: 'advertiser_id_set', pass: false, expected: 'broadstreet advertiser id present', actual: 'missing' });
    return { checks, status: 'error', externalId, siteId };
  }

  try {
    const placementsResult = await safeBroadstreetRequest(`/placements?campaign_id=${campaignId}`, credentials);
    checks.push({
      name: 'placements_endpoint_reachable',
      pass: placementsResult.ok,
      expected: '2xx response from /placements',
      actual: formatBroadstreetResult(placementsResult),
    });

    if (!placementsResult.ok) {
      return { checks, status: 'error', externalId, siteId };
    }

    const broadstreetPlacements = normalizeBroadstreetList(placementsResult.data, ['placements', 'results', 'data']);
    const expectedPlacementIds = Array.isArray(placement.broadstreet_placement_ids)
      ? placement.broadstreet_placement_ids.map((value: number | string) => Number(value)).filter((value: number) => Number.isFinite(value))
      : [];
    const placementIds = new Set(
      broadstreetPlacements
        .map((item: any) => Number(item?.id))
        .filter((value: number) => Number.isFinite(value))
    );
    const matchingPlacements = broadstreetPlacements.filter((item: any) => {
      const itemId = Number(item?.id);
      const itemAdId = Number(item?.advertisement_id);
      return itemAdId === adId || (Number.isFinite(itemId) && expectedPlacementIds.includes(itemId));
    });

    if (expectedPlacementIds.length > 0) {
      const missingPlacementIds = expectedPlacementIds.filter((id: number) => !placementIds.has(id));
      checks.push({
        name: 'placement_ids_present',
        pass: missingPlacementIds.length === 0,
        expected: expectedPlacementIds.join(', '),
        actual: missingPlacementIds.length === 0 ? 'all present' : `missing ${missingPlacementIds.join(', ')}`,
      });
    }

    checks.push({
      name: 'placement_linked_to_ad',
      pass: matchingPlacements.length > 0,
      expected: `placement for ad ${externalId}`,
      actual: `${matchingPlacements.length} matching placement(s)`,
    });

    const adsResult = await safeBroadstreetRequest(
      `/advertisements?network_id=${credentials.networkId}&advertiser_id=${advertiserId}`,
      credentials
    );
    checks.push({
      name: 'advertisements_endpoint_reachable',
      pass: adsResult.ok,
      expected: '2xx response from /advertisements',
      actual: formatBroadstreetResult(adsResult),
    });

    if (!adsResult.ok) {
      return { checks, status: 'error', externalId, siteId };
    }

    const broadstreetAds = normalizeBroadstreetList(adsResult.data, ['advertisements', 'results', 'data']);
    const broadstreetAd = broadstreetAds.find((item: any) => Number(item?.id) === adId);

    checks.push({
      name: 'ad_exists_in_broadstreet',
      pass: !!broadstreetAd,
      expected: `advertisement ${externalId} present`,
      actual: broadstreetAd ? 'found' : `not found in ${broadstreetAds.length} advertisements`,
    });

    if (!broadstreetAd) {
      return { checks, status: 'fail', externalId, siteId };
    }

    const bsName = broadstreetAd.name || '';
    const dbName = placement.ad_name || '';
    checks.push({ name: 'ad_name_match', pass: bsName === dbName, expected: dbName, actual: bsName });

    if (placement.click_url) {
      const expectedClickUrl = normalizeComparableUrl(placement.click_url);
      const rawBroadstreetDestination = getBroadstreetDestination(broadstreetAd);
      const actualClickUrl = normalizeComparableUrl(rawBroadstreetDestination);

      checks.push({
        name: 'click_url_verification_mode',
        pass: true,
        expected: 'Broadstreet destination returned or omitted by API',
        actual: actualClickUrl || '(not returned by Broadstreet API)',
      });

      if (actualClickUrl) {
        checks.push({
          name: 'click_url_match',
          pass: actualClickUrl === expectedClickUrl,
          expected: expectedClickUrl,
          actual: actualClickUrl,
        });
      }
    }

    if (placement.is_active) {
      const broadstreetState = broadstreetAd.archived
        ? 'archived'
        : broadstreetAd.paused
          ? 'paused'
          : matchingPlacements.length > 0
            ? 'active'
            : 'unplaced';
      const isActive = !broadstreetAd.archived && !broadstreetAd.paused && matchingPlacements.length > 0;
      checks.push({
        name: 'ad_active_in_broadstreet',
        pass: isActive,
        expected: 'active',
        actual: broadstreetState,
      });
    }

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    checks.push({ name: 'broadstreet_api_reachable', pass: false, expected: 'success', actual: message });
    return { checks, status: 'error', externalId, siteId };
  }

  const allPassed = checks.every(c => c.pass);
  return { checks, status: allPassed ? 'pass' : 'fail', externalId, siteId };
}

async function alreadyChecked(supabase: any, entityType: string, entityId: string): Promise<boolean> {
  const { data } = await supabase
    .from('qa_checks')
    .select('status')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .in('status', ['pass', 'fail'])
    .maybeSingle();
  return !!data;
}


async function storeResult(supabase: any, entityType: string, entityId: string, result: { checks: CheckResult[]; status: string; externalId: string | null; siteId: string | null }) {
  // Preserve is_dismissed from existing record
  const { data: existing } = await supabase
    .from('qa_checks')
    .select('is_dismissed')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  const isDismissed = existing?.is_dismissed ?? false;

  // Delete previous check for same entity
  await supabase.from('qa_checks').delete().eq('entity_type', entityType).eq('entity_id', entityId);

  await supabase.from('qa_checks').insert({
    entity_type: entityType,
    entity_id: entityId,
    external_id: result.externalId,
    site_id: result.siteId,
    status: result.status,
    checks: result.checks,
    checked_at: new Date().toISOString(),
    is_dismissed: isDismissed,
  });
}

async function getSweepTimestamp(supabase: any, key: string): Promise<string | null> {
  const { data: sweepSetting } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  return (sweepSetting?.value as any)?.timestamp || null;
}

async function setSweepTimestamp(supabase: any, key: string, description: string) {
  const now = new Date().toISOString();

  await supabase
    .from('admin_settings')
    .upsert({
      key,
      value: { timestamp: now },
      description,
    }, { onConflict: 'key' });

  return now;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { action, entity_type, entity_id } = await req.json();

    // Check if QA agent is enabled
    const { data: setting } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'qa_agent_enabled')
      .maybeSingle();

    const isEnabled = setting?.value?.enabled !== false; // default to enabled
    const bypassDisableActions = new Set(['run_all_recent', 'run_broadstreet_sweep', 'run_beehiiv_sweep']);

    if (!isEnabled && !bypassDisableActions.has(action)) {
      return new Response(JSON.stringify({ skipped: true, reason: 'QA agent is disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'run_check' && entity_type && entity_id) {
      let result;
      if (entity_type === 'wordpress_post') {
        result = await checkWordPressPost(supabase, entity_id);
      } else if (entity_type === 'beehiiv_blast') {
        result = await checkBeehiivBlast(supabase, entity_id);
      } else if (entity_type === 'broadstreet_ad') {
        result = await checkBroadstreetAd(supabase, entity_id);
      } else {
        return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await storeResult(supabase, entity_type, entity_id, result);
      return new Response(JSON.stringify({ success: true, status: result.status, checks: result.checks }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'run_all_recent') {
      const results: any[] = [];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Recent published posts with WP IDs
      const { data: recentPosts } = await supabase
        .from('posts')
        .select('id')
        .not('wordpress_post_id', 'is', null)
        .gte('published_at', since)
        .limit(50);

      for (const post of (recentPosts || [])) {
        if (await alreadyChecked(supabase, 'wordpress_post', post.id)) continue;
        const result = await checkWordPressPost(supabase, post.id);
        await storeResult(supabase, 'wordpress_post', post.id, result);
        results.push({ entity_type: 'wordpress_post', entity_id: post.id, status: result.status });
      }

      // Recent Beehiiv blasts with post IDs
      const { data: recentBlasts } = await supabase
        .from('email_blasts')
        .select('id')
        .not('beehiiv_post_id', 'is', null)
        .gte('created_at', since)
        .limit(50);

      for (const blast of (recentBlasts || [])) {
        if (await alreadyChecked(supabase, 'beehiiv_blast', blast.id)) continue;
        const result = await checkBeehiivBlast(supabase, blast.id);
        await storeResult(supabase, 'beehiiv_blast', blast.id, result);
        results.push({ entity_type: 'beehiiv_blast', entity_id: blast.id, status: result.status });
      }

      return new Response(JSON.stringify({ success: true, checked: results.length, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'run_beehiiv_sweep') {
      const results: any[] = [];
      const lastSweptAt = await getSweepTimestamp(supabase, 'beehiiv_last_swept_at');
      const eligibilityCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('email_blasts')
        .select('id, created_at, updated_at, beehiiv_post_id')
        .not('beehiiv_post_id', 'is', null)
        .lte('created_at', eligibilityCutoff)
        .gte('created_at', twentyFourHoursAgo)
        .order('updated_at', { ascending: true })
        .limit(100);

      if (lastSweptAt) {
        query = query.gt('updated_at', lastSweptAt);
      }

      const { data: blasts } = await query;

      for (const blast of (blasts || [])) {
        if (await alreadyChecked(supabase, 'beehiiv_blast', blast.id)) continue;
        const result = await checkBeehiivBlast(supabase, blast.id);
        await storeResult(supabase, 'beehiiv_blast', blast.id, result);
        results.push({ entity_type: 'beehiiv_blast', entity_id: blast.id, status: result.status });
      }

      const sweptAt = await setSweepTimestamp(
        supabase,
        'beehiiv_last_swept_at',
        'Last time the Beehiiv QA sweep ran'
      );

      return new Response(JSON.stringify({ success: true, checked: results.length, swept_at: sweptAt, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'run_broadstreet_sweep') {
      const results: any[] = [];
      const lastSweptAt = await getSweepTimestamp(supabase, 'broadstreet_last_swept_at');

      const twentyFourHoursAgoBs = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Query placements that changed since last sweep (or all active if no prior sweep), created within 24h
      let query = supabase
        .from('display_ad_placements')
        .select('id, ad_name, click_url, broadstreet_advertisement_id, is_active, updated_at, created_at, display_ad_campaigns(site_id)')
        .eq('is_active', true)
        .gte('created_at', twentyFourHoursAgoBs)
        .limit(100);

      if (lastSweptAt) {
        query = query.gt('updated_at', lastSweptAt);
      }

      const { data: placements } = await query;

      for (const placement of (placements || [])) {
        if (await alreadyChecked(supabase, 'broadstreet_ad', placement.id)) continue;
        const result = await checkBroadstreetAd(supabase, placement.id);
        await storeResult(supabase, 'broadstreet_ad', placement.id, result);
        results.push({ entity_type: 'broadstreet_ad', entity_id: placement.id, status: result.status });
      }

      const sweptAt = await setSweepTimestamp(
        supabase,
        'broadstreet_last_swept_at',
        'Last time the Broadstreet QA sweep ran'
      );

      return new Response(JSON.stringify({ success: true, checked: results.length, swept_at: sweptAt, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('QA Agent error:', e);
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
