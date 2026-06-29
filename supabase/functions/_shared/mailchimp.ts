// Shared Mailchimp Marketing API v3 helpers for edge functions.

export interface MailchimpConfig {
  api_key?: string;
  audience_id?: string;
  saved_segment_id?: number;
  from_name?: string;
  reply_to?: string;
  template_id?: number;
  banner_image_url?: string;
}

export function isMailchimpConfigured(config: MailchimpConfig | null | undefined): boolean {
  return !!(config?.api_key && config?.audience_id);
}

// The datacenter is encoded as the API key's suffix (e.g. "...-us21" → us21.api.mailchimp.com)
export function getDc(apiKey: string): string {
  const dc = apiKey.split('-').pop() ?? '';
  if (!/^[a-z]{2,4}\d+$/.test(dc)) {
    throw new Error(
      'Invalid Mailchimp API key: expected a key ending in a datacenter suffix like "-us21"'
    );
  }
  return dc;
}

export class MailchimpApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function mcFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<any> {
  const dc = getDc(apiKey);
  const response = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    ...init,
    headers: {
      'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let result: any = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }

  if (!response.ok) {
    const detail = result?.detail || result?.title || text || 'Unknown error';
    const fieldErrors = Array.isArray(result?.errors)
      ? result.errors.map((e: any) => `${e.field}: ${e.message}`).join('; ')
      : '';
    throw new MailchimpApiError(
      `Mailchimp API error (${response.status}): ${detail}${fieldErrors ? ` [${fieldErrors}]` : ''}`,
      response.status
    );
  }

  return result;
}

const FONT_STACK = "Helvetica, Arial, sans-serif";

// Classic template with mc:edit regions so API-created campaigns open in
// Mailchimp's editor with click-to-edit sections (raw-HTML campaigns would
// only be editable as a code block). Section names here must match the keys
// sent in PUT /campaigns/{id}/content `template.sections`. The compliance
// footer lives outside the editable regions; campaigns set auto_footer: false
// so Mailchimp doesn't append a second one.
export const BLAST_TEMPLATE_SECTION_NAMES = [
  'banner_image',
  'main_image',
  'headline',
  'body',
  'cta_button',
  'secondary_image',
  'disclaimer',
] as const;

export const BLAST_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>*|MC:SUBJECT|*</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4;">
<center>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
  <tr>
    <td align="center" style="padding:20px 10px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; max-width:600px; width:100%;">
        <tr>
          <td mc:edit="banner_image" align="center" style="padding:0;"></td>
        </tr>
        <tr>
          <td mc:edit="main_image" align="center" style="padding:0;"></td>
        </tr>
        <tr>
          <td mc:edit="headline" align="center" style="font-family:${FONT_STACK}; color:#222222; padding:24px 30px 0;"></td>
        </tr>
        <tr>
          <td mc:edit="body" style="font-family:${FONT_STACK}; font-size:16px; line-height:1.6; color:#333333; padding:16px 30px;"></td>
        </tr>
        <tr>
          <td mc:edit="cta_button" align="center" style="padding:8px 30px 24px;"></td>
        </tr>
        <tr>
          <td mc:edit="secondary_image" align="center" style="padding:0;"></td>
        </tr>
        <tr>
          <td style="padding:16px 30px 0;"><hr style="border:none; border-top:1px solid #dddddd; margin:0;"></td>
        </tr>
        <tr>
          <td mc:edit="disclaimer" style="font-family:${FONT_STACK}; font-size:12px; line-height:1.5; color:#888888; padding:12px 30px 24px;"></td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
        <tr>
          <td align="center" style="font-family:${FONT_STACK}; font-size:11px; line-height:1.5; color:#999999; padding:20px 30px;">
            *|HTML:LIST_ADDRESS_HTML|*<br>
            <a href="*|UNSUB|*" style="color:#999999;">Unsubscribe</a>&nbsp;|&nbsp;<a href="*|UPDATE_PROFILE|*" style="color:#999999;">Update email preferences</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</center>
</body>
</html>`;
