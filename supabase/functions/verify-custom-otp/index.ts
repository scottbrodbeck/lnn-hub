import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, code, token } = await req.json();

    // Either code+email or token is required
    if (!token && (!email || !code)) {
      return new Response(
        JSON.stringify({ error: "Email and code, or token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let otpRecord;

    if (token) {
      // Verify by magic link token
      const { data, error } = await supabaseAdmin
        .from("otp_codes")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        console.error("Token verification failed:", error);
        return new Response(
          JSON.stringify({ error: "Invalid or expired link" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      otpRecord = data;
    } else {
      // Verify by code
      const { data, error } = await supabaseAdmin
        .from("otp_codes")
        .select("*")
        .eq("email", email.toLowerCase())
        .eq("code", code)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        console.error("Code verification failed:", error);
        return new Response(
          JSON.stringify({ error: "Invalid or expired code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      otpRecord = data;
    }

    // Mark OTP as used
    await supabaseAdmin
      .from("otp_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    // Generate a magic link. generateLink returns a link for an existing user and
    // (with signups enabled) creates the user if they don't exist — so no separate
    // existence check is needed. The previous listUsers()+find approach only saw the
    // first page (default 50 users), so it failed to find most migrated users and then
    // tried to re-create them, which errored on the duplicate email ("Failed to create
    // account"). This broke OTP login for every user past page 1.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: otpRecord.email,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Failed to generate magic link:", linkError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Best-effort new-vs-existing signal (only drives the client's toast copy):
    // a user row created within the last 10s is treated as a fresh signup.
    const createdMs = new Date(linkData.user?.created_at ?? 0).getTime();
    const isNewUser = Number.isFinite(createdMs) && Date.now() - createdMs < 10000;

    return new Response(
      JSON.stringify({
        success: true,
        action_link: linkData.properties.action_link,
        email: otpRecord.email,
        isNewUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-custom-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
