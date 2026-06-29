import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type MediaType = 'media' | 'logo';

type MediaRecord = {
  id: string;
  public_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  uploaded_at: string;
  storage_path: string;
  original_filename: string;
  organization_id: string | null;
};

type RequestBody = {
  action: 'list' | 'update_caption' | 'delete' | 'lookup_by_urls';
  type?: MediaType;
  organizationId?: string | null;
  page?: number;
  pageSize?: number;
  recordId?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  urls?: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json()) as RequestBody;

    const { data: roles, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      throw roleError;
    }

    const isAdmin = (roles ?? []).some((entry) => entry.role === 'admin' || entry.role === 'super_admin');

    const ensureOrganizationAccess = async (organizationId?: string | null) => {
      if (isAdmin) return;
      if (!organizationId) {
        throw new Error('Active organization is required');
      }

      const { data: membership, error: membershipError } = await adminClient
        .from('user_organizations')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      if (!membership) {
        throw new Error('You do not have access to this organization');
      }
    };

    const getTargetRecord = async (recordId?: string | null, imageUrl?: string | null) => {
      let query = adminClient
        .from('image_uploads')
        .select('id, public_url, thumbnail_url, caption, uploaded_at, storage_path, original_filename, organization_id')
        .limit(1);

      if (recordId) {
        query = query.eq('id', recordId);
      } else if (imageUrl) {
        query = query.eq('public_url', imageUrl);
      } else {
        throw new Error('A media identifier is required');
      }

      const { data, error } = await query.maybeSingle<MediaRecord>();
      if (error) throw error;
      if (!data) throw new Error('Media item not found');
      return data;
    };

    const ensureRecordAccess = async (record: MediaRecord, organizationId?: string | null) => {
      if (isAdmin) return;
      await ensureOrganizationAccess(organizationId);
      if (!record.organization_id || record.organization_id !== organizationId) {
        throw new Error('Media item is outside the active organization');
      }
    };

    if (body.action === 'list') {
      await ensureOrganizationAccess(body.organizationId ?? null);

      const page = Math.max(0, body.page ?? 0);
      const pageSize = Math.min(Math.max(1, body.pageSize ?? 48), 100);
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = adminClient
        .from('image_uploads')
        .select('id, public_url, thumbnail_url, caption, uploaded_at, storage_path, original_filename, organization_id')
        .order('uploaded_at', { ascending: false });

      if (body.organizationId) {
        query = query.eq('organization_id', body.organizationId);
      } else if (!isAdmin) {
        throw new Error('Active organization is required');
      }

      if (body.type === 'logo') {
        query = query.or('original_filename.ilike.%logo%,storage_path.ilike.%logo%');
      }

      const { data, error } = await query.range(from, to);
      if (error) throw error;

      return json({ items: data ?? [] });
    }

    if (body.action === 'lookup_by_urls') {
      const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];
      await ensureOrganizationAccess(body.organizationId ?? null);

      if (urls.length === 0) {
        return json({ items: [] });
      }

      let query = adminClient
        .from('image_uploads')
        .select('id, public_url, thumbnail_url, caption, uploaded_at, storage_path, original_filename, organization_id')
        .in('public_url', urls);

      if (body.organizationId) {
        query = query.eq('organization_id', body.organizationId);
      } else if (!isAdmin) {
        throw new Error('Active organization is required');
      }

      const { data, error } = await query;
      if (error) throw error;

      return json({ items: data ?? [] });
    }

    if (body.action === 'update_caption') {
      const record = await getTargetRecord(body.recordId ?? null, body.imageUrl ?? null);
      await ensureRecordAccess(record, body.organizationId ?? null);

      const { error } = await adminClient
        .from('image_uploads')
        .update({ caption: body.caption ?? null, updated_at: new Date().toISOString() })
        .eq('id', record.id);

      if (error) throw error;

      return json({ success: true });
    }

    if (body.action === 'delete') {
      const record = await getTargetRecord(body.recordId ?? null, body.imageUrl ?? null);
      await ensureRecordAccess(record, body.organizationId ?? null);

      if (record.storage_path) {
        const { error: storageError } = await adminClient.storage
          .from('editor-images')
          .remove([record.storage_path]);

        if (storageError) {
          throw storageError;
        }
      }

      const { error: mappingError } = await adminClient
        .from('wordpress_media_mappings')
        .delete()
        .eq('supabase_image_url', record.public_url);

      if (mappingError) {
        throw mappingError;
      }

      const { error: deleteError } = await adminClient
        .from('image_uploads')
        .delete()
        .eq('id', record.id);

      if (deleteError) {
        throw deleteError;
      }

      return json({ success: true });
    }

    return json({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.error('media-library error:', error);
    return json({ error: getErrorMessage(error) }, 500);
  }
});
