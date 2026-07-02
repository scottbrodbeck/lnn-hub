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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify the caller is an admin
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

    // Check caller is admin
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .single();

    if (!callerRole || (callerRole.role !== 'admin' && callerRole.role !== 'super_admin')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if target is a super_admin — only super_admins can delete other super_admins
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (targetRole?.role === 'super_admin' && callerRole.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can delete super admin accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((targetRole?.role === 'admin' || targetRole?.role === 'super_admin') && callerRole.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can delete admin accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Deleting user ${userId} by admin ${caller.id}`);

    // Nullify / delete references BEFORE removing the auth user. Previously each of
    // these ignored its error, so a failure here would still fall through to the auth
    // delete and leave orphaned or half-deleted data. Now we check every step and
    // abort (before the irreversible auth delete) if any fails.
    const cleanupSteps = [
      { label: 'posts', error: (await supabaseAdmin.from('posts').update({ client_id: null }).eq('client_id', userId)).error },
      { label: 'post_assignments', error: (await supabaseAdmin.from('post_assignments').update({ assigned_to: null }).eq('assigned_to', userId)).error },
      { label: 'email_blasts', error: (await supabaseAdmin.from('email_blasts').update({ client_id: null }).eq('client_id', userId)).error },
      { label: 'email_sponsorships', error: (await supabaseAdmin.from('email_sponsorships').update({ client_id: null }).eq('client_id', userId)).error },
      { label: 'user_organizations', error: (await supabaseAdmin.from('user_organizations').delete().eq('user_id', userId)).error },
      { label: 'user_roles', error: (await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)).error },
      { label: 'user_notification_preferences', error: (await supabaseAdmin.from('user_notification_preferences').delete().eq('user_id', userId)).error },
      { label: 'profiles', error: (await supabaseAdmin.from('profiles').delete().eq('id', userId)).error },
    ];

    const failedStep = cleanupSteps.find((s) => s.error);
    if (failedStep) {
      console.error(`delete-user: cleanup failed at ${failedStep.label} for ${userId}:`, failedStep.error);
      return new Response(
        JSON.stringify({ error: `Could not fully remove the user (failed at ${failedStep.label}). No account was deleted — please retry.` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Error deleting auth user:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete auth user: ' + authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${userId} deleted successfully`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
