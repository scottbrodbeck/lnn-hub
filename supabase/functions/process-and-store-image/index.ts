import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    );

    const { imageData, filename: rawFilename, caption, organizationId } = await req.json();

    if (!imageData || !rawFilename) {
      throw new Error('Missing imageData or filename');
    }

    const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError) {
      console.error('Failed to fetch authenticated user:', userError);
      throw userError;
    }

    console.log('Processing image:', filename);

    const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      throw new Error('Invalid data URL format');
    }
    const originalMimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const normalizedCaption = typeof caption === 'string' ? caption.trim() : '';

    console.log('Original MIME type:', originalMimeType);

    const timestamp = Date.now();
    const uniqueFilename = `original-${timestamp}-${filename}`;
    const processedFilename = `processed-${timestamp}-${filename.replace(/\.[^/.]+$/, '')}.jpg`;

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('editor-images')
      .upload(uniqueFilename, binaryData, {
        contentType: originalMimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const {
      data: { publicUrl },
    } = supabaseClient.storage.from('editor-images').getPublicUrl(uploadData.path);

    const cloudinaryUrl = `https://res.cloudinary.com/dyugtcysh/image/fetch/e_trim/if_w_gte_150/w_1200,c_scale/if_end/f_jpg,q_70,b_white/${encodeURIComponent(publicUrl)}`;

    console.log('Fetching processed image from Cloudinary...');

    const cloudinaryResponse = await fetch(cloudinaryUrl);

    if (!cloudinaryResponse.ok) {
      console.error('Cloudinary response not ok:', cloudinaryResponse.status, cloudinaryResponse.statusText);
      throw new Error(`Cloudinary processing failed: ${cloudinaryResponse.statusText}`);
    }

    const processedImageBlob = await cloudinaryResponse.arrayBuffer();
    console.log('Processed image size:', processedImageBlob.byteLength);

    const { data: processedUploadData, error: processedUploadError } = await supabaseClient.storage
      .from('editor-images')
      .upload(processedFilename, processedImageBlob, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      });

    if (processedUploadError) {
      console.error('Processed upload error:', processedUploadError);
      throw processedUploadError;
    }

    const { error: deleteError } = await supabaseClient.storage.from('editor-images').remove([uploadData.path]);

    if (deleteError) {
      console.warn('Failed to delete original image:', deleteError);
    }

    const {
      data: { publicUrl: processedPublicUrl },
    } = supabaseClient.storage.from('editor-images').getPublicUrl(processedUploadData.path);

    const processedThumbnailUrl = `https://res.cloudinary.com/dyugtcysh/image/fetch/w_300,h_300,c_fill,q_auto,f_auto/${encodeURIComponent(processedPublicUrl)}`;

    console.log('Final image URL:', processedPublicUrl);

    const { data: imageUpload, error: dbError } = await supabaseClient
      .from('image_uploads')
      .insert({
        storage_path: processedUploadData.path,
        public_url: processedPublicUrl,
        thumbnail_url: processedThumbnailUrl,
        original_filename: filename,
        file_size: processedImageBlob.byteLength,
        caption: normalizedCaption || null,
        is_in_use: false,
        status: 'ready',
        is_optimized: true,
        original_size: binaryData.byteLength,
        optimized_size: processedImageBlob.byteLength,
        processing_error: null,
        organization_id: organizationId ?? null,
        uploaded_by: user?.id ?? null,
      })
      .select('id')
      .single();

    if (dbError || !imageUpload) {
      console.error('Failed to record image in database:', dbError);
      const { error: cleanupError } = await supabaseClient.storage
        .from('editor-images')
        .remove([processedUploadData.path]);

      if (cleanupError) {
        console.warn('Failed to clean up processed image after DB error:', cleanupError);
      }

      throw dbError ?? new Error('Failed to record image in database');
    }

    console.log('Image recorded in database successfully');

    return new Response(
      JSON.stringify({ url: processedPublicUrl, recordId: imageUpload.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in process-and-store-image function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
