import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { sendWelcomeEmail, generateSetupLink } from '../_shared/welcomeEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ── Authorize: caller must be an admin/super_admin ───────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!caller) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .single();
    const callerIsAdmin = callerRole?.role === 'admin' || callerRole?.role === 'super_admin';
    if (!callerIsAdmin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up the target user's email + name.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.email) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const portalUrl = Deno.env.get('SITE_URL') || 'https://client.lnn.co';
    const setupLink = await generateSetupLink(supabaseAdmin, profile.email, portalUrl);

    const welcomeEmail = await sendWelcomeEmail(supabaseAdmin, {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name || profile.email,
      setupLink,
      portalUrl,
    });

    return new Response(
      JSON.stringify({ success: welcomeEmail.status === 'sent', welcomeEmail }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error in resend-welcome-email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
