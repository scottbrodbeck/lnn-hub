import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManageSponsorRequest {
  action: 'update' | 'delete';
  sponsor_id: string;
  updates?: {
    name?: string;
    logo_url?: string;
    link_url?: string | null;
  };
}

// Upload a remote image URL to WordPress media library
async function uploadImageToWordPress(
  imageUrl: string,
  wpApiUrl: string,
  authHeader: string,
  filename: string,
  title?: string
): Promise<{ id: number; url: string } | null> {
  try {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return null;

    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const bodyBytes = new Uint8Array(await imgResp.arrayBuffer());

    const extMap: Record<string, string> = {
      'image/webp': '.webp', 'image/png': '.png',
      'image/gif': '.gif', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    };
    const correctExt = extMap[contentType] || '.jpg';
    const fixedFilename = filename.replace(/\.[^.]+$/, correctExt);

    const uploadResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Disposition': `attachment; filename="${fixedFilename}"`,
        'Content-Type': contentType,
      },
      body: bodyBytes,
    });

    const uploadJson = await uploadResp.json();
    if (!uploadResp.ok) return null;

    if (title) {
      const metaResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/media/${uploadJson.id}`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, alt_text: title }),
      });
      await metaResp.text();
    }

    return { id: uploadJson.id, url: uploadJson.source_url };
  } catch (err) {
    console.error(`Error uploading image ${filename}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, sponsor_id, updates }: ManageSponsorRequest = await req.json();
    console.log(`manage-sponsor: action=${action}, sponsor_id=${sponsor_id}`);

    // Get sponsor record
    const { data: sponsor, error: sponsorError } = await supabase
      .from('sponsors')
      .select('*')
      .eq('id', sponsor_id)
      .single();

    if (sponsorError || !sponsor) {
      throw new Error('Sponsor not found');
    }

    // Get all WordPress mappings for this sponsor
    const { data: mappings } = await supabase
      .from('wordpress_sponsor_mappings')
      .select('id, site_id, wordpress_sponsor_id')
      .eq('sponsor_id', sponsor_id);

    if (action === 'update' && updates) {
      // Update sponsor record in DB
      const { error: updateError } = await supabase
        .from('sponsors')
        .update({
          name: updates.name ?? sponsor.name,
          logo_url: updates.logo_url ?? sponsor.logo_url,
          link_url: updates.link_url !== undefined ? updates.link_url : sponsor.link_url,
        })
        .eq('id', sponsor_id);

      if (updateError) throw updateError;

      // Propagate to all WordPress sites
      const results: any[] = [];
      const effectiveName = updates.name ?? sponsor.name;
      const effectiveLogoUrl = updates.logo_url ?? sponsor.logo_url;
      const effectiveLinkUrl = updates.link_url !== undefined ? updates.link_url : sponsor.link_url;

      for (const mapping of mappings || []) {
        try {
          // Get site credentials
          const { data: site } = await supabase
            .from('sites')
            .select('url, wordpress_username, wordpress_app_password')
            .eq('id', mapping.site_id)
            .single();

          if (!site?.wordpress_username || !site?.wordpress_app_password) {
            console.warn(`Site ${mapping.site_id} missing WP credentials, skipping`);
            continue;
          }

          const authHeader = `Basic ${btoa(`${site.wordpress_username}:${site.wordpress_app_password}`)}`;
          const wpApiUrl = site.url.replace(/\/$/, '');

          // Upload new logo if changed
          let logoMediaId: number | null = null;
          if (updates.logo_url && updates.logo_url !== sponsor.logo_url) {
            // Check media cache first
            const { data: existingMapping } = await supabase
              .from('wordpress_media_mappings')
              .select('wordpress_media_id')
              .eq('site_id', mapping.site_id)
              .eq('supabase_image_url', effectiveLogoUrl)
              .maybeSingle();

            if (existingMapping) {
              logoMediaId = existingMapping.wordpress_media_id;
            } else {
              const logoResult = await uploadImageToWordPress(
                effectiveLogoUrl,
                wpApiUrl,
                authHeader,
                `sponsor-logo-${Date.now()}.jpg`,
                `${effectiveName} - Sponsor Logo`
              );
              if (logoResult) {
                logoMediaId = logoResult.id;
                await supabase.from('wordpress_media_mappings').insert({
                  site_id: mapping.site_id,
                  supabase_image_url: effectiveLogoUrl,
                  wordpress_media_id: logoResult.id,
                  wordpress_media_url: logoResult.url,
                });
              }
            }
          }

          // Update WP sponsor term
          const sponsorPayload: any = {
            name: effectiveName,
            acf: {
              sponsor_url: effectiveLinkUrl || '',
            },
          };
          if (logoMediaId) {
            sponsorPayload.acf.sponsor_logo = logoMediaId;
          }

          const updateResp = await fetch(
            `${wpApiUrl}/wp-json/wp/v2/sponsors/${mapping.wordpress_sponsor_id}`,
            {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
              body: JSON.stringify(sponsorPayload),
            }
          );

          if (updateResp.status === 404 || updateResp.status === 410) {
            // Self-healing: remove stale mapping
            console.warn(`WP sponsor ${mapping.wordpress_sponsor_id} not found on site ${mapping.site_id}, removing mapping`);
            await supabase
              .from('wordpress_sponsor_mappings')
              .delete()
              .eq('id', mapping.id);
            results.push({ site_id: mapping.site_id, status: 'stale_removed' });
          } else {
            const json = await updateResp.json();
            if (!updateResp.ok) {
              console.error(`WP sponsor update failed for site ${mapping.site_id}:`, json);
              results.push({ site_id: mapping.site_id, status: 'error', error: json.message });
            } else {
              results.push({ site_id: mapping.site_id, status: 'updated' });
            }
          }
        } catch (err) {
          console.error(`Error updating sponsor on site ${mapping.site_id}:`, err);
          results.push({ site_id: mapping.site_id, status: 'error', error: String(err) });
        }
      }

      return new Response(
        JSON.stringify({ success: true, action: 'update', results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete') {
      // Soft-delete sponsor
      const { error: deleteError } = await supabase
        .from('sponsors')
        .update({ is_active: false })
        .eq('id', sponsor_id);

      if (deleteError) throw deleteError;

      // Optionally clean up WP taxonomy entries
      const results: any[] = [];
      for (const mapping of mappings || []) {
        try {
          const { data: site } = await supabase
            .from('sites')
            .select('url, wordpress_username, wordpress_app_password')
            .eq('id', mapping.site_id)
            .single();

          if (!site?.wordpress_username || !site?.wordpress_app_password) continue;

          const authHeader = `Basic ${btoa(`${site.wordpress_username}:${site.wordpress_app_password}`)}`;
          const wpApiUrl = site.url.replace(/\/$/, '');

          const deleteResp = await fetch(
            `${wpApiUrl}/wp-json/wp/v2/sponsors/${mapping.wordpress_sponsor_id}?force=true`,
            {
              method: 'DELETE',
              headers: { 'Authorization': authHeader },
            }
          );
          await deleteResp.text(); // consume body

          // Remove mapping
          await supabase
            .from('wordpress_sponsor_mappings')
            .delete()
            .eq('id', mapping.id);

          results.push({ site_id: mapping.site_id, status: 'deleted' });
        } catch (err) {
          console.error(`Error deleting sponsor from site ${mapping.site_id}:`, err);
          results.push({ site_id: mapping.site_id, status: 'error', error: String(err) });
        }
      }

      return new Response(
        JSON.stringify({ success: true, action: 'delete', results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error('Error in manage-sponsor:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
