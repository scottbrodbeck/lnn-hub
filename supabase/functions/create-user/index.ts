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
    const callerIsSuperAdmin = callerRole?.role === 'super_admin';
    const callerIsAdmin = callerIsSuperAdmin || callerRole?.role === 'admin';
    if (!callerIsAdmin) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, password, fullName, role, organizationIds, primaryOrganizationId } = await req.json();

    console.log('Creating user:', { email, role, organizationIds, primaryOrganizationId });

    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only super_admins may create elevated roles (mirrors UserManagementDialog).
    if ((role === 'admin' || role === 'super_admin') && !callerIsSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Only super admins can create admin or super admin users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (userError) {
      console.error('Error creating user:', userError);
      return new Response(
        JSON.stringify({ error: userError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User created successfully:', userData.user.id);

    const primaryOrgId = primaryOrganizationId || (organizationIds?.length > 0 ? organizationIds[0] : null);

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userData.user.id,
        email: email,
        full_name: fullName,
        organization_id: primaryOrgId,
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userData.user.id,
        role: role,
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      return new Response(
        JSON.stringify({ error: 'User created but role assignment failed: ' + roleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User role assigned successfully');

    if (organizationIds && organizationIds.length > 0) {
      const orgInserts = organizationIds.map((orgId: string) => ({
        user_id: userData.user.id,
        organization_id: orgId,
        is_primary: orgId === primaryOrgId,
      }));

      const { error: orgError } = await supabaseAdmin
        .from('user_organizations')
        .insert(orgInserts);

      if (orgError) {
        console.error('Error assigning organizations:', orgError);
      } else {
        console.log('User organizations assigned successfully');
      }
    }

    const portalUrl = Deno.env.get('SITE_URL') || 'https://client.lnn.co';

    // One-click 7-day onboarding setup link (reuses the OTP token mechanism).
    const setupLink = await generateSetupLink(supabaseAdmin, email, portalUrl);

    // Welcome email — sends by default, always logs its outcome, and never
    // throws. The result is returned so the caller can surface it to the admin.
    const welcomeEmail = await sendWelcomeEmail(supabaseAdmin, {
      userId: userData.user.id,
      email,
      fullName,
      setupLink,
      portalUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userData.user.id,
          email: userData.user.email,
        },
        welcomeEmail,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
