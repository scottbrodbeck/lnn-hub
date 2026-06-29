import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cloudinary account for transformations
const CLOUDINARY_CLOUD = 'dyugtcysh';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { storagePath, recordId } = await req.json();
    
    if (!storagePath || !recordId) {
      throw new Error('Missing required parameters: storagePath and recordId');
    }

    console.log(`Processing image: ${storagePath} for record: ${recordId}`);

    // Get the original file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('editor-images')
      .download(storagePath);

    if (downloadError) {
      console.error('Failed to download original file:', downloadError);
      throw downloadError;
    }

    const originalSize = fileData.size;
    console.log(`Original file size: ${originalSize} bytes`);

    // Get the public URL for the original file (fallback)
    const { data: { publicUrl: originalPublicUrl } } = supabase.storage
      .from('editor-images')
      .getPublicUrl(storagePath);

    // Try Cloudinary optimization with timeout
    let optimizedUrl = originalPublicUrl;
    let thumbnailUrl = '';
    let isOptimized = false;
    let optimizedSize = originalSize;
    let processingError: string | null = null;

    try {
      // Cloudinary transformation URL - resize to max 2000px width, auto quality, WebP format
      const cloudinaryUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/w_2000,c_limit,q_auto,f_auto/${encodeURIComponent(originalPublicUrl)}`;

      console.log('Attempting Cloudinary optimization...');

      // Fetch optimized image with 15 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const cloudinaryResponse = await fetch(cloudinaryUrl, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!cloudinaryResponse.ok) {
        throw new Error(`Cloudinary returned ${cloudinaryResponse.status}`);
      }

      const optimizedBlob = await cloudinaryResponse.blob();
      optimizedSize = optimizedBlob.size;
      console.log(`Optimized file size: ${optimizedSize} bytes`);

      // Only use optimized version if it's actually smaller or similar
      if (optimizedSize <= originalSize * 1.1) {
        // Upload optimized version with new filename
        const optimizedPath = storagePath.replace(/(\.[^.]+)$/, '_optimized$1');
        const optimizedArrayBuffer = await optimizedBlob.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from('editor-images')
          .upload(optimizedPath, new Uint8Array(optimizedArrayBuffer), {
            contentType: optimizedBlob.type || 'image/webp',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload optimized image: ${uploadError.message}`);
        }

        // Get public URL for optimized image
        const { data: { publicUrl: newPublicUrl } } = supabase.storage
          .from('editor-images')
          .getPublicUrl(optimizedPath);

        optimizedUrl = newPublicUrl;
        isOptimized = true;

        // Keep original file — the GC will clean it up later.
        // Deleting it immediately caused a race condition where
        // callers that captured the original URL before optimization
        // finished would end up with a broken link.
        console.log('Optimization successful, original kept for GC');
      } else {
        console.log('Optimized version is larger, keeping original');
        isOptimized = false;
      }

      // Generate thumbnail URL using Cloudinary on-the-fly transformation
      // Use the optimized URL as source (or original if optimization failed)
      thumbnailUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/w_300,h_300,c_fill,q_auto,f_auto/${encodeURIComponent(optimizedUrl)}`;
      console.log('Generated thumbnail URL:', thumbnailUrl);

    } catch (optError) {
      // Graceful fallback - keep original image
      console.error('Optimization failed, using original:', optError);
      processingError = optError instanceof Error ? optError.message : 'Unknown optimization error';
      optimizedUrl = originalPublicUrl;
      isOptimized = false;
      optimizedSize = originalSize;
      
      // Still generate thumbnail even if optimization failed
      thumbnailUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/w_300,h_300,c_fill,q_auto,f_auto/${encodeURIComponent(originalPublicUrl)}`;
    }

    // Update the database record - always mark as ready
    // Also update storage_path when optimization replaced the original file
    const updateData: Record<string, unknown> = {
      status: 'ready',
      public_url: optimizedUrl,
      thumbnail_url: thumbnailUrl,
      is_optimized: isOptimized,
      original_size: originalSize,
      optimized_size: optimizedSize,
      processing_error: processingError,
      updated_at: new Date().toISOString()
    };

    // If we optimized and replaced the original, update storage_path to match
    if (isOptimized) {
      const optimizedPath = storagePath.replace(/(\.[^.]+)$/, '_optimized$1');
      updateData.storage_path = optimizedPath;
      console.log(`Updated storage_path to: ${optimizedPath}`);
    }

    const { error: updateError } = await supabase
      .from('image_uploads')
      .update(updateData)
      .eq('id', recordId);

    if (updateError) {
      console.error('Failed to update record:', updateError);
      throw updateError;
    }

    console.log(`Image processing complete. Optimized: ${isOptimized}, URL: ${optimizedUrl}, Thumbnail: ${thumbnailUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: optimizedUrl,
        thumbnailUrl,
        isOptimized,
        originalSize,
        optimizedSize
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-image-background:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
