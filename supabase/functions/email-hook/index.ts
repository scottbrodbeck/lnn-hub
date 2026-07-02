import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");

interface EmailHookPayload {
  user: {
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

function tryCreateWebhook(secret: string): Webhook | null {
  try {
    return new Webhook(secret);
  } catch {
    return null;
  }
}

function verifyPayload(secret: string, payload: string, headers: Record<string, string>): EmailHookPayload | null {
  // Try the secret as-is first
  const wh1 = tryCreateWebhook(secret);
  if (wh1) {
    try {
      return wh1.verify(payload, headers) as EmailHookPayload;
    } catch {
      console.warn("Verification failed with raw secret, trying alternatives...");
    }
  }

  // Try with whsec_ prefix + base64-encoded value
  if (!secret.startsWith("whsec_")) {
    const encoded = base64Encode(new TextEncoder().encode(secret));
    const prefixed = `whsec_${encoded}`;
    const wh2 = tryCreateWebhook(prefixed);
    if (wh2) {
      try {
        return wh2.verify(payload, headers) as EmailHookPayload;
      } catch {
        console.warn("Verification failed with whsec_ + base64 encoded secret");
      }
    }

    // Try just adding whsec_ prefix without encoding
    const wh3 = tryCreateWebhook(`whsec_${secret}`);
    if (wh3) {
      try {
        return wh3.verify(payload, headers) as EmailHookPayload;
      } catch {
        console.warn("Verification failed with whsec_ prefix");
      }
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);

    console.log("Received email hook request");

    // Verify webhook signature
    if (!hookSecret) {
      console.error("SEND_EMAIL_HOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: { message: "Hook secret not configured" } }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log secret format info (not the value)
    console.log(`Secret format: length=${hookSecret.length}, starts_with_whsec=${hookSecret.startsWith("whsec_")}, first_char_code=${hookSecret.charCodeAt(0)}`);

    const verified = verifyPayload(hookSecret, payload, headers);
    if (!verified) {
      // Previously this fell through and sent the email anyway ("to unblock users"),
      // which let anyone who could reach this URL send auth/reset emails from our
      // trusted sender with an attacker-controlled redirect_to. Reject instead.
      // NOTE: SEND_EMAIL_HOOK_SECRET must match the Supabase Auth "Send Email" hook
      // secret — verify native auth emails (e.g. password reset) on staging before merge.
      console.error("Webhook signature verification failed — rejecting request.");
      return new Response(
        JSON.stringify({ error: { http_code: 401, message: "Invalid webhook signature" } }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    const data: EmailHookPayload = verified;

    const { user, email_data } = data;
    const { token, token_hash, redirect_to, email_action_type, site_url } = email_data;

    console.log("Processing email for:", user.email, "Action type:", email_action_type);

    // Map auth action types to notification log types
    const notificationTypeMap: Record<string, string> = {
      recovery: 'password_reset',
      signup: 'email_confirmation',
      email_confirmation: 'email_confirmation',
      magiclink: 'magic_link',
    };
    const notificationType = notificationTypeMap[email_action_type] || 'magic_link';

    // Create Supabase client for logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Build the magic link URL (SUPABASE_URL is always injected in edge functions)
    const magicLink = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}`;

    // Determine email content based on action type
    let subject = "Your Login Code";
    let heading = "Login to LNN Local Hub";
    let actionText = "log in";

    if (email_action_type === "recovery") {
      subject = "Reset Your Password";
      heading = "Password Reset";
      actionText = "reset your password";
    } else if (email_action_type === "signup" || email_action_type === "email_confirmation") {
      subject = "Confirm Your Email";
      heading = "Welcome to LNN Local Hub";
      actionText = "confirm your email";
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 10px;">${heading}</h1>
          </div>
          
          <p style="font-size: 16px;">Hi there,</p>
          
          <p style="font-size: 16px;">Use this one-time code to ${actionText}:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; font-size: 36px; font-weight: bold; padding: 20px 40px; background: #f5f5f5; border-radius: 8px; letter-spacing: 8px; font-family: monospace;">
              ${token}
            </div>
          </div>
          
          <p style="font-size: 16px; text-align: center; color: #666;">Or click the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" 
               style="display: inline-block; padding: 14px 32px; background: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              ${subject.includes("Reset") ? "Reset Password" : subject.includes("Confirm") ? "Confirm Email" : "Log In"}
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            This code expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            LNN Local Hub
          </p>
        </body>
      </html>
    `;

    // Send email via SendGrid
    const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: user.email }] }],
        from: { email: "content@lnn.co", name: "LNN Local Hub" },
        subject: subject,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (!sendGridResponse.ok) {
      const errorData = await sendGridResponse.text();
      console.error("Failed to send email:", errorData);

      // Log the failure
      await supabaseAdmin.from('email_notification_logs').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        user_email: user.email,
        notification_type: notificationType,
        subject: subject,
        status: 'error',
        error_message: `SendGrid ${sendGridResponse.status}: ${errorData}`,
      }).then(({ error: logErr }) => { if (logErr) console.error("Failed to log email error:", logErr); });

      return new Response(
        JSON.stringify({ error: { http_code: 500, message: "Failed to send email" } }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully to:", user.email);

    // Log the success
    await supabaseAdmin.from('email_notification_logs').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      user_email: user.email,
      notification_type: notificationType,
      subject: subject,
      status: 'success',
    }).then(({ error: logErr }) => { if (logErr) console.error("Failed to log email success:", logErr); });

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in email-hook:", error);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: error.message } }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
