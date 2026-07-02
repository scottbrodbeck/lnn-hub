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

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function buildAssignmentRows(rows: any[], siteMap: Map<string, string>): string {
  return rows
    .map((a) => {
      const siteLabel = a.site_id ? (siteMap.get(a.site_id) || "—") : "—";
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${a.assignment_name || "(untitled)"}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${a.post_type || "—"}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${a.content_category || "—"}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${siteLabel}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${fmtDate(a.created_at)}</td>
      </tr>`;
    })
    .join("");
}

function buildTableHtml(rows: string): string {
  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="background: #f5f5f5;">
        <th style="padding: 8px 12px; text-align: left;">Assignment</th>
        <th style="padding: 8px 12px; text-align: left;">Type</th>
        <th style="padding: 8px 12px; text-align: left;">Category</th>
        <th style="padding: 8px 12px; text-align: left;">Site</th>
        <th style="padding: 8px 12px; text-align: left;">Created</th>
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

    console.log("Checking unscheduled assignments for:", today);

    // Optional: { force: true } skips the once-per-day dedup guard (used by manual "Send Now")
    let force = false;
    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        force = body?.force === true;
      }
    } catch (_e) {
      // ignore
    }

    // Dedup: don't send twice in one day (unless forced)
    if (!force) {
      const { data: existingLogs } = await supabase
        .from("email_notification_logs")
        .select("id")
        .eq("notification_type", "unscheduled_assignments")
        .gte("sent_at", today + "T00:00:00Z")
        .lt("sent_at", today + "T23:59:59Z")
        .limit(1);

      if (existingLogs && existingLogs.length > 0) {
        console.log("Already sent unscheduled-assignments report today, skipping");
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch unscheduled one-time assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from("post_assignments")
      .select("id, assignment_name, post_type, content_category, organization_id, site_id, created_at, recurrence_type, due_date, is_completed, is_skipped")
      .eq("recurrence_type", "one_time")
      .is("due_date", null)
      .eq("is_completed", false);

    if (assignmentsError) throw assignmentsError;

    const qualifying = (assignments || []).filter((a: any) => !a.is_skipped);

    if (qualifying.length === 0) {
      console.log("No unscheduled assignments");
      return new Response(JSON.stringify({ success: true, qualifying: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${qualifying.length} unscheduled assignments`);

    // Resolve org names
    const orgIds = [...new Set(qualifying.map((a: any) => a.organization_id).filter(Boolean))];
    const { data: orgs } = orgIds.length
      ? await supabase.from("organizations").select("id, name").in("id", orgIds)
      : { data: [] };
    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

    // Resolve site labels (best-effort)
    const siteIds = [...new Set(qualifying.map((a: any) => a.site_id).filter(Boolean))];
    const { data: sites } = siteIds.length
      ? await supabase.from("sites").select("id, name").in("id", siteIds)
      : { data: [] };
    const siteMap = new Map((sites || []).map((s: any) => [s.id, s.name]));

    // Group by org
    const grouped = new Map<string, typeof qualifying>();
    for (const a of qualifying) {
      const key = a.organization_id || "__none__";
      if (!grouped.has(key)) grouped.set(key, [] as any);
      grouped.get(key)!.push(a);
    }

    // Sort groups by org name
    const sortedGroups = [...grouped.entries()].sort((a, b) => {
      const an = (orgMap.get(a[0]) || "zzz").toLowerCase();
      const bn = (orgMap.get(b[0]) || "zzz").toLowerCase();
      return an.localeCompare(bn);
    });

    // Build consolidated email
    let allRows = "";
    for (const [orgId, orgAssignments] of sortedGroups) {
      const orgName = orgMap.get(orgId) || "(No organization)";
      allRows += `<tr><td colspan="5" style="padding: 12px 12px 4px; font-weight: bold; background: #f9f9f9;">${orgName} (${orgAssignments.length})</td></tr>`;
      const sorted = [...orgAssignments].sort((x: any, y: any) =>
        (x.created_at || "").localeCompare(y.created_at || "")
      );
      allRows += buildAssignmentRows(sorted, siteMap);
    }

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #333;">Monthly Report: Unscheduled Assignments</h2>
        <p>The following one-time assignments currently have <strong>no publication date</strong> set:</p>
        ${buildTableHtml(allRows)}
        <p><a href="${BASE_URL}/admin/assignments" style="color: #2563eb;">View Assignments →</a></p>
      </div>
    `;

    const subject = "Monthly Report: Unscheduled Assignments";

    // Determine recipients: optional admin override, otherwise all admins
    const { data: recipientSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "unscheduled_assignments_recipients")
      .maybeSingle();

    type Recipient = { id: string | null; email: string };
    let recipients: Recipient[] = [];

    const rawOverride = recipientSetting?.value as any;
    const overrideEmails: string[] = Array.isArray(rawOverride)
      ? rawOverride.filter((e: any) => typeof e === "string" && e.trim().length > 0)
      : [];

    if (overrideEmails.length > 0) {
      // Try to resolve each override email to a profile id (for logging), but send regardless
      const { data: matched } = await supabase
        .from("profiles")
        .select("id, email")
        .in("email", overrideEmails);
      const matchMap = new Map((matched || []).map((p: any) => [p.email.toLowerCase(), p.id]));
      recipients = overrideEmails.map((email) => ({
        id: matchMap.get(email.toLowerCase()) || null,
        email,
      }));
    } else {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const adminIds = [...new Set((adminRoles || []).map((r: any) => r.user_id))];
      if (adminIds.length === 0) {
        console.log("No admins to notify");
        return new Response(JSON.stringify({ success: true, qualifying: qualifying.length, emailsSent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", adminIds);
      recipients = (adminProfiles || [])
        .filter((p: any) => !!p.email)
        .map((p: any) => ({ id: p.id, email: p.email }));
    }

    let emailsSent = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      const result = await sendEmail(r.email, subject, adminHtml);
      await supabase.from("email_notification_logs").insert({
        notification_type: "unscheduled_assignments",
        user_id: r.id || "00000000-0000-0000-0000-000000000000",
        user_email: r.email,
        subject,
        status: result.ok ? "sent" : "failed",
        error_message: result.error || null,
        notification_data: {
          target: "admin",
          assignment_count: qualifying.length,
          source: overrideEmails.length > 0 ? "override" : "all_admins",
        },
      });
      if (result.ok) emailsSent++;
      console.log(`Email to ${r.email}: ${result.ok ? "sent" : "failed"}`);
    }

    return new Response(
      JSON.stringify({ success: true, qualifying: qualifying.length, emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in check-unscheduled-assignments:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
