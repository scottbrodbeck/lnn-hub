import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://client.lnn.co";

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: "content@lnn.co", name: "LNN Local Hub" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: errText };
  }
  await res.text();
  return { ok: true };
}

function buildCampaignRows(campaigns: any[]): string {
  return campaigns
    .map((c) => {
      const startFormatted = new Date(c.start_date + "T00:00:00Z").toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });
      const endFormatted = c.end_date
        ? new Date(c.end_date + "T00:00:00Z").toLocaleDateString("en-US", {
            year: "numeric", month: "long", day: "numeric",
          })
        : "No end date";
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${c.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${c.ad_type}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${startFormatted}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${endFormatted}</td>
      </tr>`;
    })
    .join("");
}

function buildTableHtml(rows: string): string {
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="background: #f5f5f5;">
        <th style="padding: 8px 12px; text-align: left;">Campaign</th>
        <th style="padding: 8px 12px; text-align: left;">Ad Type</th>
        <th style="padding: 8px 12px; text-align: left;">Start Date</th>
        <th style="padding: 8px 12px; text-align: left;">End Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split("T")[0];

    console.log("Checking active campaigns without active ads for:", today);

    // 1. Read notification target preference
    const { data: settingData } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "no_active_ads_notification_target")
      .single();

    const target = (settingData?.value as string)?.replace(/^"|"$/g, "") || "admins";
    console.log("Notification target:", target);

    // 2. Deduplication check
    const { data: existingLogs } = await supabase
      .from("email_notification_logs")
      .select("id")
      .eq("notification_type", "no_active_ads")
      .gte("sent_at", today + "T00:00:00Z")
      .lt("sent_at", today + "T23:59:59Z")
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      console.log("Already sent no-active-ads report today, skipping");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get all active campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from("display_ad_campaigns")
      .select("id, name, ad_type, start_date, end_date, organization_id")
      .eq("is_active", true)
      .lte("start_date", today)
      .or(`end_date.gte.${today},end_date.is.null`);

    if (campaignsError) throw campaignsError;
    if (!campaigns || campaigns.length === 0) {
      console.log("No active campaigns found");
      return new Response(JSON.stringify({ success: true, qualifying: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. For each campaign, check if it has active placements
    const qualifying: typeof campaigns = [];
    for (const campaign of campaigns) {
      const { count } = await supabase
        .from("display_ad_placements")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("is_active", true);

      if (count === 0) {
        qualifying.push(campaign);
      }
    }

    if (qualifying.length === 0) {
      console.log("All active campaigns have active placements");
      return new Response(JSON.stringify({ success: true, qualifying: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${qualifying.length} campaigns without active ads`);

    // 5. Get org names
    const orgIds = [...new Set(qualifying.map((c) => c.organization_id))];
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

    // 6. Group by org
    const grouped = new Map<string, typeof qualifying>();
    for (const campaign of qualifying) {
      const key = campaign.organization_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(campaign);
    }

    let emailsSent = 0;

    // 7. Admin emails
    if (target === "admins" || target === "both") {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        const adminIds = adminRoles.map((r: any) => r.user_id);
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", adminIds);

        // Build consolidated email for admins
        let allRows = "";
        for (const [orgId, orgCampaigns] of grouped) {
          const orgName = orgMap.get(orgId) || "Unknown Organization";
          allRows += `<tr><td colspan="4" style="padding: 12px 12px 4px; font-weight: bold; background: #f9f9f9;">${orgName}</td></tr>`;
          allRows += buildCampaignRows(orgCampaigns);
        }

        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Weekly Report: Active Campaigns Without Ads</h2>
            <p>The following active campaigns currently have <strong>no active ad placements</strong>:</p>
            ${buildTableHtml(allRows)}
            <p><a href="${BASE_URL}/admin/display-ads" style="color: #2563eb;">View Display Ads →</a></p>
          </div>
        `;

        const subject = "Weekly Report: Active Campaigns Without Ads";

        for (const admin of adminProfiles || []) {
          const result = await sendEmail(admin.email, subject, adminHtml);
          await supabase.from("email_notification_logs").insert({
            notification_type: "no_active_ads",
            user_id: admin.id,
            user_email: admin.email,
            subject,
            status: result.ok ? "sent" : "failed",
            error_message: result.error || null,
            notification_data: { target: "admin", campaign_count: qualifying.length },
          });
          if (result.ok) emailsSent++;
          console.log(`Admin email to ${admin.email}: ${result.ok ? "sent" : "failed"}`);
        }
      }
    }

    // 8. Client emails
    if (target === "clients" || target === "both") {
      for (const [orgId, orgCampaigns] of grouped) {
        const orgName = orgMap.get(orgId) || "Unknown Organization";

        // Get all users in this org
        const { data: orgUsers } = await supabase
          .from("user_organizations")
          .select("user_id")
          .eq("organization_id", orgId);

        if (!orgUsers || orgUsers.length === 0) continue;

        const userIds = orgUsers.map((u: any) => u.user_id);
        const { data: userProfiles } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);

        const rows = buildCampaignRows(orgCampaigns);
        const clientHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Action Needed: Your Display Ad Campaign Has No Active Ads</h2>
            <p>The following campaign${orgCampaigns.length > 1 ? "s" : ""} for <strong>${orgName}</strong> ${orgCampaigns.length > 1 ? "have" : "has"} no active ad placements:</p>
            ${buildTableHtml(rows)}
            <p>Please upload ad creatives to ensure your campaigns are running.</p>
            <p><a href="${BASE_URL}/client/display-ads" style="color: #2563eb;">View Your Display Ads →</a></p>
          </div>
        `;

        const subject = "Action Needed: Your Display Ad Campaign Has No Active Ads";

        for (const user of userProfiles || []) {
          // Admin-controlled creative-email suppression
          const { data: prefs } = await supabase
            .from("user_notification_preferences")
            .select("exclude_from_creative_emails")
            .eq("user_id", user.id)
            .maybeSingle();
          if (prefs?.exclude_from_creative_emails) {
            console.log(`Skipping no-active-ads email to ${user.email}: creative_excluded by admin`);
            continue;
          }

          const result = await sendEmail(user.email, subject, clientHtml);
          await supabase.from("email_notification_logs").insert({
            notification_type: "no_active_ads",
            user_id: user.id,
            user_email: user.email,
            subject,
            status: result.ok ? "sent" : "failed",
            error_message: result.error || null,
            notification_data: { target: "client", org_id: orgId, campaign_ids: orgCampaigns.map((c) => c.id) },
          });
          if (result.ok) emailsSent++;
          console.log(`Client email to ${user.email} for org ${orgName}: ${result.ok ? "sent" : "failed"}`);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, qualifying: qualifying.length, emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in check-no-active-ads:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
