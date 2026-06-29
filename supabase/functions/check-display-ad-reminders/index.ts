import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getLeadDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const diffMonths = diffDays / 30.44; // average days per month

  if (diffMonths > 6) return 30;
  if (diffMonths >= 2) return 14;
  return 7;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split("T")[0];

    console.log("Checking display ad campaign reminders for:", today);

    // 1. Get reminder email
    const { data: settingData, error: settingError } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "display_ad_reminder_email")
      .single();

    if (settingError || !settingData) {
      console.log("No reminder email configured, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reminderEmail = (settingData.value as string).replace(/^"|"$/g, "");
    if (!reminderEmail || reminderEmail === "") {
      console.log("Reminder email is empty, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "empty_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Check deduplication
    const { data: existingLogs } = await supabase
      .from("email_notification_logs")
      .select("id")
      .eq("notification_type", "display_ad_ending")
      .gte("sent_at", today + "T00:00:00Z")
      .lt("sent_at", today + "T23:59:59Z")
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      console.log("Already sent display ad reminders today, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get active campaigns with end dates
    const { data: campaigns, error: campaignsError } = await supabase
      .from("display_ad_campaigns")
      .select("id, name, ad_type, start_date, end_date, organization_id")
      .eq("is_active", true)
      .not("end_date", "is", null);

    if (campaignsError) throw campaignsError;
    if (!campaigns || campaigns.length === 0) {
      console.log("No active campaigns with end dates");
      return new Response(JSON.stringify({ success: true, qualifying: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Filter campaigns whose reminder date is today
    const qualifying: typeof campaigns = [];
    for (const campaign of campaigns) {
      const leadDays = getLeadDays(campaign.start_date, campaign.end_date!);
      const endDate = new Date(campaign.end_date + "T00:00:00Z");
      const reminderDate = new Date(endDate);
      reminderDate.setUTCDate(reminderDate.getUTCDate() - leadDays);
      const reminderDateStr = reminderDate.toISOString().split("T")[0];

      if (reminderDateStr === today) {
        qualifying.push(campaign);
      }
    }

    if (qualifying.length === 0) {
      console.log("No campaigns qualifying for reminder today");
      return new Response(JSON.stringify({ success: true, qualifying: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Get organization names
    const orgIds = [...new Set(qualifying.map((c) => c.organization_id))];
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);

    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

    // 6. Group by organization
    const grouped = new Map<string, typeof qualifying>();
    for (const campaign of qualifying) {
      const key = campaign.organization_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(campaign);
    }

    // 7. Send one email per org group
    let emailsSent = 0;
    const BASE_URL = "https://client.lnn.co";

    for (const [orgId, orgCampaigns] of grouped) {
      const orgName = orgMap.get(orgId) || "Unknown Organization";

      const campaignRows = orgCampaigns
        .map((c) => {
          const endDate = new Date(c.end_date + "T00:00:00Z");
          const formatted = endDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return `<tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${c.name}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${c.ad_type}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${formatted}</td>
          </tr>`;
        })
        .join("");

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Display Ad Campaign Ending Soon</h2>
          <p>The following campaign${orgCampaigns.length > 1 ? "s" : ""} for <strong>${orgName}</strong> ${orgCampaigns.length > 1 ? "are" : "is"} ending soon:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px 12px; text-align: left;">Campaign</th>
                <th style="padding: 8px 12px; text-align: left;">Ad Type</th>
                <th style="padding: 8px 12px; text-align: left;">End Date</th>
              </tr>
            </thead>
            <tbody>
              ${campaignRows}
            </tbody>
          </table>
          <p><a href="${BASE_URL}/admin/display-ads" style="color: #2563eb;">View Display Ads →</a></p>
        </div>
      `;

      const subject = `Display Ad${orgCampaigns.length > 1 ? "s" : ""} Ending Soon: ${orgName}`;

      try {
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: reminderEmail }] }],
            from: { email: "content@lnn.co", name: "LNN Client Portal" },
            subject,
            content: [{ type: "text/html", value: html }],
          }),
        });

        if (!sgRes.ok) {
          const errText = await sgRes.text();
          console.error("SendGrid error:", errText);

          await supabase.from("email_notification_logs").insert({
            notification_type: "display_ad_ending",
            user_id: "00000000-0000-0000-0000-000000000000",
            user_email: reminderEmail,
            subject,
            status: "failed",
            error_message: errText,
            notification_data: { org_id: orgId, campaign_ids: orgCampaigns.map((c) => c.id) },
          });
        } else {
          await sgRes.text(); // consume body
          emailsSent++;

          await supabase.from("email_notification_logs").insert({
            notification_type: "display_ad_ending",
            user_id: "00000000-0000-0000-0000-000000000000",
            user_email: reminderEmail,
            subject,
            status: "sent",
            notification_data: { org_id: orgId, campaign_ids: orgCampaigns.map((c) => c.id) },
          });

          console.log("Sent reminder for org:", orgName, "campaigns:", orgCampaigns.length);
        }
      } catch (err) {
        console.error("Error sending email for org:", orgName, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, qualifying: qualifying.length, emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in check-display-ad-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
