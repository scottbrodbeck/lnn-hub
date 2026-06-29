import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const GRACE_PERIOD_DAYS = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const summary = {
    referencedUrls: 0,
    totalImageRecords: 0,
    markedInUse: 0,
    markedNotInUse: 0,
    deletedRecords: 0,
    deletedStorageFiles: 0,
    orphanedStorageFiles: 0,
    errors: [] as string[],
  };

  try {
    console.log('=== Image Garbage Collection Started ===');

    // -------------------------------------------------------
    // STEP 1: Collect all referenced image URLs from content tables
    // -------------------------------------------------------
    const referencedUrls = new Set<string>();

    const addUrl = (url: string | null | undefined) => {
      if (url && typeof url === 'string' && url.includes('editor-images')) {
        referencedUrls.add(url);
        // Also add the _optimized variant so GC matches either form
        if (url.includes('_optimized')) {
          referencedUrls.add(url.replace('_optimized', ''));
        } else {
          const optimizedUrl = url.replace(/(\.[^.]+)$/, '_optimized$1');
          referencedUrls.add(optimizedUrl);
        }
      }
    };

    const extractUrlsFromJson = (json: unknown) => {
      if (!json) return;
      if (typeof json === 'string') {
        addUrl(json);
        return;
      }
      if (Array.isArray(json)) {
        for (const item of json) {
          if (typeof item === 'string') {
            addUrl(item);
          } else if (typeof item === 'object' && item !== null) {
            // Handle object-based image metadata (e.g., { url, processedUrl, originalUrl })
            const obj = item as Record<string, unknown>;
            if (typeof obj.url === 'string') addUrl(obj.url);
            if (typeof obj.processedUrl === 'string') addUrl(obj.processedUrl);
            if (typeof obj.originalUrl === 'string') addUrl(obj.originalUrl);
            if (typeof obj.src === 'string') addUrl(obj.src);
          }
        }
        return;
      }
      if (typeof json === 'object' && json !== null) {
        const obj = json as Record<string, unknown>;
        if (typeof obj.url === 'string') addUrl(obj.url);
        if (typeof obj.processedUrl === 'string') addUrl(obj.processedUrl);
        if (typeof obj.originalUrl === 'string') addUrl(obj.originalUrl);
        if (typeof obj.src === 'string') addUrl(obj.src);
        // Recurse into arrays within the object
        for (const val of Object.values(obj)) {
          if (Array.isArray(val)) extractUrlsFromJson(val);
        }
      }
    };

    const extractUrlsFromHtml = (html: string | null | undefined) => {
      if (!html || typeof html !== 'string') return;
      // Match img src attributes containing editor-images
      const imgRegex = /(?:src|href)=["']([^"']*editor-images[^"']*?)["']/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        addUrl(match[1]);
      }
    };

    // --- Posts ---
    console.log('Scanning posts...');
    let postsOffset = 0;
    const POST_PAGE_SIZE = 500;
    while (true) {
      const { data: posts, error } = await supabase
        .from('posts')
        .select('featured_image_url, logo_url, author_photo_url, gallery_images, animated_featured_image, content')
        .range(postsOffset, postsOffset + POST_PAGE_SIZE - 1);

      if (error) {
        console.error('Error scanning posts:', error.message);
        summary.errors.push(`Posts scan: ${error.message}`);
        break;
      }

      if (!posts || posts.length === 0) break;

      for (const post of posts) {
        addUrl(post.featured_image_url);
        addUrl(post.logo_url);
        addUrl(post.author_photo_url);
        extractUrlsFromJson(post.gallery_images);
        extractUrlsFromJson(post.animated_featured_image);
        extractUrlsFromHtml(post.content);
      }

      if (posts.length < POST_PAGE_SIZE) break;
      postsOffset += POST_PAGE_SIZE;
    }

    // --- Column Templates ---
    console.log('Scanning column_templates...');
    const { data: templates, error: tplErr } = await supabase
      .from('column_templates')
      .select('featured_image_url, logo_url, banner_image_url');

    if (tplErr) {
      summary.errors.push(`Templates scan: ${tplErr.message}`);
    } else if (templates) {
      for (const t of templates) {
        addUrl(t.featured_image_url);
        addUrl(t.logo_url);
        addUrl(t.banner_image_url);
      }
    }

    // --- Email Blasts ---
    console.log('Scanning email_blasts...');
    const { data: blasts, error: blastErr } = await supabase
      .from('email_blasts')
      .select('main_image_url, secondary_image_url');

    if (blastErr) {
      summary.errors.push(`Blasts scan: ${blastErr.message}`);
    } else if (blasts) {
      for (const b of blasts) {
        addUrl(b.main_image_url);
        addUrl(b.secondary_image_url);
      }
    }

    // --- Email Sponsorships ---
    console.log('Scanning email_sponsorships...');
    const { data: sponsorships, error: sponsErr } = await supabase
      .from('email_sponsorships')
      .select('banner_image_url');

    if (sponsErr) {
      summary.errors.push(`Sponsorships scan: ${sponsErr.message}`);
    } else if (sponsorships) {
      for (const s of sponsorships) {
        addUrl(s.banner_image_url);
      }
    }

    // --- Display Ad Placements ---
    console.log('Scanning display_ad_placements...');
    const { data: placements, error: placErr } = await supabase
      .from('display_ad_placements')
      .select('ad_image_url');

    if (placErr) {
      summary.errors.push(`Placements scan: ${placErr.message}`);
    } else if (placements) {
      for (const p of placements) {
        addUrl(p.ad_image_url);
      }
    }

    // --- Support Requests (active design requests) ---
    console.log('Scanning active support_requests for design images...');
    const { data: activeRequests, error: reqErr } = await supabase
      .from('support_requests')
      .select('screenshot_urls')
      .neq('status', 'resolved');

    if (reqErr) {
      summary.errors.push(`Support requests scan: ${reqErr.message}`);
    } else if (activeRequests) {
      for (const req of activeRequests) {
        extractUrlsFromJson(req.screenshot_urls);
      }
    }

    // --- Profiles ---
    console.log('Scanning profiles...');
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('default_logo_url, default_author_photo_url');

    if (profErr) {
      summary.errors.push(`Profiles scan: ${profErr.message}`);
    } else if (profiles) {
      for (const p of profiles) {
        addUrl(p.default_logo_url);
        addUrl(p.default_author_photo_url);
      }
    }

    summary.referencedUrls = referencedUrls.size;
    console.log(`Step 1 complete: ${referencedUrls.size} unique referenced URLs found`);

    // -------------------------------------------------------
    // STEP 2: Update is_in_use flags on all image_uploads
    // -------------------------------------------------------
    console.log('Updating is_in_use flags...');

    // Fetch all image_uploads in pages
    let allRecords: { id: string; public_url: string; storage_path: string; created_at: string }[] = [];
    let recordsOffset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('image_uploads')
        .select('id, public_url, storage_path, created_at')
        .range(recordsOffset, recordsOffset + 999);

      if (error) {
        summary.errors.push(`Fetch image_uploads: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      allRecords = allRecords.concat(data);
      if (data.length < 1000) break;
      recordsOffset += 1000;
    }

    summary.totalImageRecords = allRecords.length;

    const inUseIds: string[] = [];
    const notInUseIds: string[] = [];

    for (const record of allRecords) {
      if (referencedUrls.has(record.public_url)) {
        inUseIds.push(record.id);
      } else {
        notInUseIds.push(record.id);
      }
    }

    // Batch update in-use records
    for (let i = 0; i < inUseIds.length; i += BATCH_SIZE) {
      const batch = inUseIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('image_uploads')
        .update({ is_in_use: true, last_checked_at: new Date().toISOString() })
        .in('id', batch);
      if (error) summary.errors.push(`Update in-use batch ${i}: ${error.message}`);
    }

    // Batch update not-in-use records
    for (let i = 0; i < notInUseIds.length; i += BATCH_SIZE) {
      const batch = notInUseIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('image_uploads')
        .update({ is_in_use: false, last_checked_at: new Date().toISOString() })
        .in('id', batch);
      if (error) summary.errors.push(`Update not-in-use batch ${i}: ${error.message}`);
    }

    summary.markedInUse = inUseIds.length;
    summary.markedNotInUse = notInUseIds.length;
    console.log(`Step 2 complete: ${inUseIds.length} in-use, ${notInUseIds.length} not-in-use`);

    // -------------------------------------------------------
    // STEP 3: Delete orphaned images older than grace period
    // -------------------------------------------------------
    console.log(`Deleting orphans older than ${GRACE_PERIOD_DAYS} days...`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - GRACE_PERIOD_DAYS);

    const orphanRecords = allRecords.filter(r => {
      return notInUseIds.includes(r.id) && new Date(r.created_at) < cutoffDate;
    });

    console.log(`Found ${orphanRecords.length} orphaned images eligible for deletion`);

    for (const orphan of orphanRecords) {
      console.log(`Deleting orphan: ${orphan.storage_path} (uploaded ${orphan.created_at})`);

      // Delete from storage
      const { error: storageErr } = await supabase.storage
        .from('editor-images')
        .remove([orphan.storage_path]);

      if (storageErr) {
        console.error(`Storage delete failed for ${orphan.storage_path}:`, storageErr.message);
        summary.errors.push(`Storage delete ${orphan.storage_path}: ${storageErr.message}`);
      } else {
        summary.deletedStorageFiles++;
      }

      // Delete DB record
      const { error: dbErr } = await supabase
        .from('image_uploads')
        .delete()
        .eq('id', orphan.id);

      if (dbErr) {
        console.error(`DB delete failed for ${orphan.id}:`, dbErr.message);
        summary.errors.push(`DB delete ${orphan.id}: ${dbErr.message}`);
      } else {
        summary.deletedRecords++;
      }
    }

    console.log(`Step 3 complete: ${summary.deletedRecords} records deleted, ${summary.deletedStorageFiles} storage files removed`);

    // -------------------------------------------------------
    // STEP 4: Storage bucket sweep — find files with no DB record
    // -------------------------------------------------------
    console.log('Sweeping storage bucket for orphaned files...');

    // Build set of all known storage paths from remaining records
    const { data: remainingRecords, error: remainErr } = await supabase
      .from('image_uploads')
      .select('storage_path');

    const knownPaths = new Set<string>();
    if (!remainErr && remainingRecords) {
      for (const r of remainingRecords) {
        knownPaths.add(r.storage_path);
      }
    }

    // List all files in the uploads/ folder of editor-images bucket
    const { data: storageFiles, error: listErr } = await supabase.storage
      .from('editor-images')
      .list('uploads', { limit: 10000 });

    if (listErr) {
      console.error('Storage list error:', listErr.message);
      summary.errors.push(`Storage list: ${listErr.message}`);
    } else if (storageFiles) {
      const orphanedFiles = storageFiles.filter(f => {
        const fullPath = `uploads/${f.name}`;
        return !knownPaths.has(fullPath);
      });

      console.log(`Found ${orphanedFiles.length} storage files with no DB record`);

      if (orphanedFiles.length > 0) {
        const pathsToDelete = orphanedFiles.map(f => `uploads/${f.name}`);

        // Delete in batches of 100
        for (let i = 0; i < pathsToDelete.length; i += 100) {
          const batch = pathsToDelete.slice(i, i + 100);
          console.log(`Deleting orphaned storage batch: ${batch.join(', ')}`);
          const { error: delErr } = await supabase.storage
            .from('editor-images')
            .remove(batch);

          if (delErr) {
            summary.errors.push(`Orphan storage delete batch ${i}: ${delErr.message}`);
          } else {
            summary.orphanedStorageFiles += batch.length;
          }
        }
      }
    }

    console.log(`Step 4 complete: ${summary.orphanedStorageFiles} orphaned storage files removed`);
    console.log('=== Image Garbage Collection Complete ===');
    console.log('Summary:', JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify({ success: true, summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error in cleanup-orphaned-images:', error);
    summary.errors.push(error instanceof Error ? error.message : 'Unknown fatal error');

    return new Response(
      JSON.stringify({ success: false, summary, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
