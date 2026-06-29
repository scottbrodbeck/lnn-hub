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

    console.log(`Optimizing image: ${originalUrl}, original size: ${originalSize} bytes`);

    // First attempt: w_600, f_webp, fl_animated, q_auto:low
    const cloudinaryUrl1 = `https://res.cloudinary.com/dyugtcysh/image/fetch/w_600,f_webp,fl_animated,q_auto:low/${encodeURIComponent(originalUrl)}`;
    
    console.log('Trying w_600 optimization...');
    const response1 = await fetch(cloudinaryUrl1);
    
    if (!response1.ok) {
      console.error(`Cloudinary w_600 failed: ${response1.status}`);
      throw new Error(`Cloudinary optimization failed: ${response1.status}`);
    }

    const blob1 = await response1.blob();
    const size1 = blob1.size;
    console.log(`w_600 result: ${size1} bytes`);

    // If under 500KB, use this version
    if (size1 > 0 && size1 < 500 * 1024) {
      console.log('Using w_600 optimization (under 500KB)');
      return new Response(JSON.stringify({
        url: cloudinaryUrl1,
        fileSize: size1,
        wasOptimized: true,
        optimizationLevel: 'w_600',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Second attempt: w_300, f_webp, fl_animated, q_auto:low
    const cloudinaryUrl2 = `https://res.cloudinary.com/dyugtcysh/image/fetch/w_300,f_webp,fl_animated,q_auto:low/${encodeURIComponent(originalUrl)}`;
    
    console.log('Trying w_300 optimization...');
    const response2 = await fetch(cloudinaryUrl2);
    
    if (!response2.ok) {
      console.error(`Cloudinary w_300 failed: ${response2.status}`);
      throw new Error(`Cloudinary optimization failed: ${response2.status}`);
    }

    const blob2 = await response2.blob();
    const size2 = blob2.size;
    console.log(`w_300 result: ${size2} bytes`);

    // If under 750KB, use this version
    if (size2 > 0 && size2 < 750 * 1024) {
      console.log('Using w_300 optimization (under 750KB)');
      return new Response(JSON.stringify({
        url: cloudinaryUrl2,
        fileSize: size2,
        wasOptimized: true,
        optimizationLevel: 'w_300',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Both optimizations didn't meet thresholds, keep original
    console.log('Both optimizations exceeded thresholds, keeping original');
    return new Response(JSON.stringify({
      url: originalUrl,
      fileSize: originalSize,
      wasOptimized: false,
      optimizationLevel: null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Optimization error:', error);
    
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
