import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CLOUDINARY_CLOUD_NAME = 'dyugtcysh';

interface UploadRequest {
  imageData: string; // base64 data URL
  filename: string;
  width: number;  // target width
  height: number; // target height
  actualWidth?: number;  // actual image width
  actualHeight?: number; // actual image height
  fileSize?: number;     // file size in bytes
}

// Determine the appropriate Cloudinary transformation based on dimensions
function buildTransformation(
  targetWidth: number,
  targetHeight: number,
  actualWidth: number,
  actualHeight: number,
  fileSize: number
): { transformation: string; skipProcessing: boolean } {
  const targetAspect = targetWidth / targetHeight;
  const actualAspect = actualWidth / actualHeight;
  const aspectTolerance = 0.02; // 2% tolerance for aspect ratio matching
  
  const isExactDimensions = actualWidth === targetWidth && actualHeight === targetHeight;
  const isSameAspectRatio = Math.abs(targetAspect - actualAspect) / targetAspect < aspectTolerance;
  const isSmallFile = fileSize < 60 * 1024; // 60KB threshold
  
  console.log(`Dimension analysis: target=${targetWidth}x${targetHeight}, actual=${actualWidth}x${actualHeight}`);
  console.log(`Aspect ratios: target=${targetAspect.toFixed(3)}, actual=${actualAspect.toFixed(3)}, same=${isSameAspectRatio}`);
  console.log(`File size: ${(fileSize / 1024).toFixed(1)}KB, small=${isSmallFile}, exactDimensions=${isExactDimensions}`);
  
  // Case 1: Exact dimensions and small file - skip processing entirely
  if (isExactDimensions && isSmallFile) {
    console.log('Processing mode: SKIP (exact dimensions + small file)');
    return { transformation: '', skipProcessing: true };
  }
  
  // Case 2: Exact dimensions but large file - optimize only (no resize)
  if (isExactDimensions) {
    console.log('Processing mode: OPTIMIZE ONLY (exact dimensions + large file)');
    return { transformation: 'q_auto:good,f_jpg', skipProcessing: false };
  }
  
  // Case 3: Same aspect ratio - scale proportionally
  if (isSameAspectRatio) {
    console.log('Processing mode: SCALE (same aspect ratio)');
    return { 
      transformation: `c_scale,w_${targetWidth},h_${targetHeight},q_auto:good,f_jpg`, 
      skipProcessing: false 
    };
  }
  
  // Case 4: Different aspect ratio - pad with white background
  console.log('Processing mode: PAD (different aspect ratio)');
  return { 
    transformation: `c_pad,w_${targetWidth},h_${targetHeight},b_white,g_center,q_auto:good,f_jpg`, 
    skipProcessing: false 
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header to pass through for RLS
    const authHeader = req.headers.get('Authorization');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {}
        }
      }
    );

    const { 
      imageData, 
      filename, 
      width, 
      height,
      actualWidth,
      actualHeight,
      fileSize 
    }: UploadRequest = await req.json();

    if (!imageData || !filename) {
      throw new Error('Missing required fields: imageData or filename');
    }

    console.log(`Processing display ad image: ${filename} (target: ${width}x${height})`);

    // Parse the base64 data URL
    const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      throw new Error('Invalid image data URL format');
    }

    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];
    
    // Convert base64 to binary
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Calculate actual file size from base64 if not provided
    const actualFileSize = fileSize || binaryData.length;
    
    // Use provided dimensions or fall back to target dimensions
    const imgActualWidth = actualWidth || width;
    const imgActualHeight = actualHeight || height;
    
    // Determine processing mode
    const { transformation, skipProcessing } = buildTransformation(
      width,
      height,
      imgActualWidth,
      imgActualHeight,
      actualFileSize
    );

    // Upload original to Supabase Storage
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const originalFilePath = `display-ads/original-${timestamp}-${sanitizedFilename}`;
    
    console.log(`Uploading original to Supabase Storage: ${originalFilePath}`);
    
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('editor-images')
      .upload(originalFilePath, binaryData, {
        contentType: mimeType,
        cacheControl: '3600', // 1 hour for originals (will be deleted after processing)
        upsert: false
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    console.log('Original image uploaded:', uploadData.path);

    // Get public URL for the original image
    const { data: { publicUrl: originalPublicUrl } } = supabaseClient
      .storage
      .from('editor-images')
      .getPublicUrl(uploadData.path);

    console.log('Original image URL:', originalPublicUrl);

    let finalUrl: string;
    let finalStoragePath: string;
    let processingMode: string;
    
    if (skipProcessing) {
      // No processing needed - keep original, use it directly
      finalUrl = originalPublicUrl;
      finalStoragePath = uploadData.path;
      processingMode = 'skipped';
      console.log('Using original URL (no processing needed)');
      
      // Record in image_uploads table for garbage collection tracking
      const { error: dbError } = await supabaseClient
        .from('image_uploads')
        .insert({
          storage_path: finalStoragePath,
          public_url: finalUrl,
          original_filename: filename,
          file_size: binaryData.length,
          is_in_use: true // Mark as in use since it's for an ad
        });

      if (dbError) {
        console.warn('Failed to record image in database:', dbError);
      } else {
        console.log('Image recorded in database for tracking');
      }
    } else {
      // Build Cloudinary Fetch URL and download processed image
      const cloudinaryUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformation}/${encodeURIComponent(originalPublicUrl)}`;
      console.log(`Fetching processed image from Cloudinary: ${transformation}`);
      
      const cloudinaryResponse = await fetch(cloudinaryUrl);
      
      if (!cloudinaryResponse.ok) {
        console.error('Cloudinary response not ok:', cloudinaryResponse.status, cloudinaryResponse.statusText);
        throw new Error(`Cloudinary processing failed: ${cloudinaryResponse.statusText}`);
      }

      const processedImageBlob = await cloudinaryResponse.arrayBuffer();
      console.log('Processed image size:', processedImageBlob.byteLength);

      // Upload processed image back to Supabase Storage
      const processedFilename = `display-ads/processed-${timestamp}-${sanitizedFilename.replace(/\.[^/.]+$/, '')}.jpg`;
      
      const { data: processedUploadData, error: processedUploadError } = await supabaseClient
        .storage
        .from('editor-images')
        .upload(processedFilename, processedImageBlob, {
          contentType: 'image/jpeg',
          cacheControl: '31536000', // 1 year for processed images
          upsert: false
        });

      if (processedUploadError) {
        console.error('Processed upload error:', processedUploadError);
        throw new Error(`Failed to upload processed image: ${processedUploadError.message}`);
      }

      console.log('Processed image uploaded:', processedUploadData.path);

      // Delete original image (no longer needed)
      const { error: deleteError } = await supabaseClient
        .storage
        .from('editor-images')
        .remove([uploadData.path]);

      if (deleteError) {
        console.warn('Failed to delete original image:', deleteError);
        // Non-fatal, continue
      } else {
        console.log('Original image deleted:', uploadData.path);
      }

      // Get public URL for processed image
      const { data: { publicUrl: processedPublicUrl } } = supabaseClient
        .storage
        .from('editor-images')
        .getPublicUrl(processedUploadData.path);

      finalUrl = processedPublicUrl;
      finalStoragePath = processedUploadData.path;
      processingMode = transformation;

      console.log('Final processed URL:', finalUrl);

      // Record in image_uploads table for garbage collection tracking
      const { error: dbError } = await supabaseClient
        .from('image_uploads')
        .insert({
          storage_path: finalStoragePath,
          public_url: finalUrl,
          original_filename: filename,
          file_size: processedImageBlob.byteLength,
          original_size: binaryData.length,
          optimized_size: processedImageBlob.byteLength,
          is_optimized: true,
          is_in_use: true // Mark as in use since it's for an ad
        });

      if (dbError) {
        console.warn('Failed to record image in database:', dbError);
      } else {
        console.log('Processed image recorded in database for tracking');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: finalUrl,
        storagePath: finalStoragePath,
        processingMode: processingMode,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Error uploading display ad image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
