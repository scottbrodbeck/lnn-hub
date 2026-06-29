import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for database access
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Generate OTP and token
    const code = generateOTP();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean up old SHORT-LIVED login codes for this email. Scoped by expiry so
    // long-lived (7-day) onboarding setup tokens from create-user survive.
    await supabaseAdmin
      .from("otp_codes")
      .delete()
      .eq("email", email.toLowerCase())
      .lt("expires_at", new Date(Date.now() + 11 * 60 * 1000).toISOString());

    // Store the new OTP
    const { error: insertError } = await supabaseAdmin
      .from("otp_codes")
      .insert({
        email: email.toLowerCase(),
        code,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Failed to store OTP:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build magic link URL
    const siteUrl = Deno.env.get("SITE_URL") || "https://nsqosbysixcjcwkdpajk.lovableproject.com";
    const magicLink = `${siteUrl}/auth?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;

    // Send email with SendGrid
    const emailResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: "content@lnn.co", name: "LNN Client Portal" },
        subject: "Your Login Code",
        content: [
          {
            type: "text/html",
            value: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px;">LNN Client Portal</h1>
                </div>
                
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                  <h2 style="color: #1a1a2e; margin-top: 0;">Your Login Code</h2>
                  
                  <p>Use this 6-digit code to sign in to your account:</p>
                  
                  <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e; font-family: monospace;">${code}</span>
                  </div>
                  
                  <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
                  
                  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
                  
                  <p>Or click the button below to sign in instantly:</p>
                  
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-weight: 600;">Sign In to LNN</a>
                  </div>
                  
                  <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this code, you can safely ignore this email.</p>
                </div>
              </body>
              </html>
            `,
          },
        ],
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Failed to send email:", emailResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`OTP sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: "Code sent to your email" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-custom-otp:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
