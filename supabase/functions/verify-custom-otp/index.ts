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

    // Check if user exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === otpRecord.email.toLowerCase()
    );

    if (existingUser) {
      // Generate magic link for existing user
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: otpRecord.email,
      });

      if (linkError) {
        console.error("Failed to generate magic link:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract the token from the link
      const urlParams = new URL(linkData.properties.action_link).searchParams;
      const tokenHash = urlParams.get("token") || new URL(linkData.properties.action_link).hash.split("=")[1];

      return new Response(
        JSON.stringify({ 
          success: true, 
          action_link: linkData.properties.action_link,
          email: otpRecord.email,
          isNewUser: false
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Create new user with auto-confirm
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: otpRecord.email,
        email_confirm: true,
      });

      if (createError) {
        console.error("Failed to create user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate magic link for new user
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: otpRecord.email,
      });

      if (linkError) {
        console.error("Failed to generate magic link for new user:", linkError);
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action_link: linkData.properties.action_link,
          email: otpRecord.email,
          isNewUser: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in verify-custom-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
