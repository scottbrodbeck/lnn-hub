import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .rpc("has_role", { _user_id: user.id, _role: "admin" });

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { to } = await req.json();
    if (!to || typeof to !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing 'to' email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
    if (!sendgridApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "SENDGRID_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: "content@lnn.co", name: "LNN Content Portal" },
        subject: "Test Email - SendGrid Configuration Check",
        content: [
          {
            type: "text/plain",
            value: "This is a test email from the LNN Content Portal admin settings. If you received this, SendGrid is configured correctly.",
          },
          {
            type: "text/html",
            value: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>✅ SendGrid Test Successful</h2>
              <p>This is a test email sent from the LNN Content Portal admin settings.</p>
              <p>If you received this, your SendGrid configuration is working correctly.</p>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">Sent at: ${new Date().toISOString()}</p>
            </div>`,
          },
        ],
      }),
    });

    const responseBody = await sgResponse.text();

    if (sgResponse.status === 202) {
      return new Response(
        JSON.stringify({ success: true, status: 202, message: "Test email sent successfully" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        status: sgResponse.status,
        error: responseBody || `SendGrid returned status ${sgResponse.status}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("test-email error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
