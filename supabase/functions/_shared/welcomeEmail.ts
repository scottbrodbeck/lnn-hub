// Shared welcome-email logic for new portal users. Used by both `create-user`
// (sends by default on creation) and `resend-welcome-email`. Crucially this
// ALWAYS writes one email_notification_logs row and returns a structured
// result, so a non-send (disabled / missing key / SendGrid error) is never
// silent — the caller can surface the reason to the admin.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

export type WelcomeEmailStatus = 'sent' | 'error' | 'skipped';

export interface WelcomeEmailResult {
  status: WelcomeEmailStatus;
  reason?: string;
}

export interface SendWelcomeEmailOptions {
  userId: string;
  email: string;
  fullName: string;
  setupLink: string;
  portalUrl: string;
}

export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a 7-day one-click setup link via the OTP token mechanism. Uses a long
 * random `code` so it can never be consumed through the 6-digit login path.
 * Returns '' (non-fatal) if the token insert fails — the caller falls back to
 * the plain portal URL.
 */
export async function generateSetupLink(
  supabaseAdmin: SupabaseClient,
  email: string,
  portalUrl: string,
): Promise<string> {
  try {
    const token = generateToken();
    const onboardingCode = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { error } = await supabaseAdmin.from('otp_codes').insert({
      email: email.toLowerCase(),
      code: onboardingCode,
      token,
      expires_at: expiresAt.toISOString(),
    });
    if (error) {
      console.error('Onboarding token insert failed (non-fatal):', error);
      return '';
    }
    return `${portalUrl}/auth?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
  } catch (err) {
    console.error('Onboarding token generation failed (non-fatal):', err);
    return '';
  }
}

// Default welcome email body used when no custom body is configured. The guide
// line is only included when the Getting Started guide is enabled, so the email
// never links to a page that's turned off.
function defaultWelcomeBody(guideEnabled: boolean): string {
  const guideLine = guideEnabled
    ? `\nNew here? Read the Getting Started guide: {{portal_url}}/client/guide\n`
    : '';
  return `Hi {{full_name}},

Welcome to the LNN Client Portal! Your account ({{email}}) is ready.

Click below to sign in instantly — no password needed — and finish setting up your account:

{{setup_link}}

Once you're in, we recommend adding your author name, bio, and photo in Settings, and reviewing your email notification preferences.
${guideLine}
This setup link works for 7 days. After that, you can sign in any time at {{portal_url}} with a one-time email code.

Questions? Just use the Help button in the portal.

— The LNN Team`;
}

const WELCOME_SUBJECT = 'Welcome to the LNN Client Portal';

async function logWelcomeEmail(
  supabaseAdmin: SupabaseClient,
  opts: SendWelcomeEmailOptions,
  status: WelcomeEmailStatus,
  errorMessage: string | null,
  setupLinkSent: boolean,
): Promise<void> {
  try {
    await supabaseAdmin.from('email_notification_logs').insert({
      notification_type: 'welcome_email',
      user_id: opts.userId,
      user_email: opts.email,
      subject: WELCOME_SUBJECT,
      status,
      error_message: errorMessage,
      notification_data: { full_name: opts.fullName, setup_link_sent: setupLinkSent },
    });
  } catch (logErr) {
    // Logging must never break the caller.
    console.error('Failed to write email_notification_logs row (non-fatal):', logErr);
  }
}

/**
 * Builds and sends the welcome email, ALWAYS recording the outcome in
 * email_notification_logs and returning a structured result. Never throws.
 */
export async function sendWelcomeEmail(
  supabaseAdmin: SupabaseClient,
  opts: SendWelcomeEmailOptions,
): Promise<WelcomeEmailResult> {
  try {
    const { email, fullName, setupLink, portalUrl } = opts;

    // Read settings (service role bypasses RLS). Welcome is ON by default; only
    // an explicit `false` disables it.
    const { data: settingsData } = await supabaseAdmin
      .from('admin_settings')
      .select('key, value')
      .in('key', ['welcome_email_enabled', 'welcome_email_body', 'onboarding_guide_enabled']);

    let welcomeEnabled = true;
    let welcomeBody = '';
    let guideEnabled = false;
    if (settingsData) {
      for (const row of settingsData) {
        if (row.key === 'welcome_email_enabled') welcomeEnabled = !(row.value === false || row.value === 'false');
        if (row.key === 'welcome_email_body') welcomeBody = typeof row.value === 'string' ? row.value : '';
        if (row.key === 'onboarding_guide_enabled') guideEnabled = row.value === true || row.value === 'true';
      }
    }

    if (!welcomeEnabled) {
      const reason = 'Welcome emails are turned off in Settings';
      await logWelcomeEmail(supabaseAdmin, opts, 'skipped', reason, !!setupLink);
      return { status: 'skipped', reason };
    }

    const baseBody = welcomeBody.trim() ? welcomeBody : defaultWelcomeBody(guideEnabled);
    const effectiveSetupLink = setupLink || portalUrl;

    const interpolate = (s: string) =>
      s
        .replace(/\{\{full_name\}\}/g, fullName)
        .replace(/\{\{email\}\}/g, email)
        .replace(/\{\{portal_url\}\}/g, portalUrl);

    const hadSetupToken = /\{\{setup_link\}\}/.test(baseBody);

    // Plain-text part
    const textInterpolated = interpolate(baseBody);
    const textBody = hadSetupToken
      ? textInterpolated.replace(/\{\{setup_link\}\}/g, effectiveSetupLink)
      : `${textInterpolated}\n\n${effectiveSetupLink}`;

    // HTML part: render the button for {{setup_link}}; append it if absent
    const setupButtonHtml = `<div style="text-align:center;margin:25px 0;"><a href="${effectiveSetupLink}" style="display:inline-block;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:6px;font-weight:600;">Set up your account</a></div>`;
    const htmlLines = interpolate(baseBody)
      .split('\n')
      .map((line: string) => {
        if (line.trim() === '{{setup_link}}') return setupButtonHtml;
        if (line.trim() === '') return '<br/>';
        const withLink = line.replace(/\{\{setup_link\}\}/g, `<a href="${effectiveSetupLink}">set up your account</a>`);
        return `<p style="margin: 0 0 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; color: #333;">${withLink}</p>`;
      });
    let htmlInner = htmlLines.join('');
    if (!hadSetupToken) htmlInner += setupButtonHtml;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">LNN Client Portal</h1>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
          ${htmlInner}
        </div>
      </body>
      </html>`;

    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    if (!sendgridApiKey) {
      const reason = 'SENDGRID_API_KEY not configured';
      console.warn('SENDGRID_API_KEY not configured, skipping welcome email');
      await logWelcomeEmail(supabaseAdmin, opts, 'error', reason, !!setupLink);
      return { status: 'error', reason };
    }

    const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'content@lnn.co', name: 'LNN Content Portal' },
        subject: WELCOME_SUBJECT,
        content: [
          { type: 'text/plain', value: textBody },
          { type: 'text/html', value: htmlBody },
        ],
      }),
    });

    if (sgResponse.status === 202) {
      console.log(`Welcome email sent for ${email}`);
      await logWelcomeEmail(supabaseAdmin, opts, 'sent', null, !!setupLink);
      return { status: 'sent' };
    }

    const errorMsg = await sgResponse.text();
    console.error(`Welcome email error for ${email} (${sgResponse.status}):`, errorMsg);
    await logWelcomeEmail(supabaseAdmin, opts, 'error', errorMsg, !!setupLink);
    return { status: 'error', reason: `Email provider rejected the message (${sgResponse.status})` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error sending welcome email';
    console.error('Error sending welcome email (non-fatal):', err);
    await logWelcomeEmail(supabaseAdmin, opts, 'error', reason, !!opts.setupLink);
    return { status: 'error', reason };
  }
}
