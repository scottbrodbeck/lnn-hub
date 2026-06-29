import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { originalUrl, originalSize } = await req.json();

    if (!originalUrl) {
      return new Response(JSON.stringify({ error: 'originalUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Optimizing video: ${originalUrl}, original size: ${originalSize} bytes`);

    // Use Cloudinary video fetch with f_mp4, w_600, br_300k transformations
    const cloudinaryUrl = `https://res.cloudinary.com/dyugtcysh/video/fetch/f_mp4,w_600,br_300k/${encodeURIComponent(originalUrl)}`;
    
    console.log('Fetching optimized video from Cloudinary...');
    const response = await fetch(cloudinaryUrl);
    
    if (!response.ok) {
      console.error(`Cloudinary video optimization failed: ${response.status}`);
      throw new Error(`Cloudinary optimization failed: ${response.status}`);
    }

    const blob = await response.blob();
    const optimizedSize = blob.size;
    console.log(`Optimized video size: ${optimizedSize} bytes`);

    // Return the optimized URL and size
    return new Response(JSON.stringify({
      url: cloudinaryUrl,
      fileSize: optimizedSize,
      wasOptimized: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Video optimization error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({
      url: null,
      fileSize: 0,
      wasOptimized: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
