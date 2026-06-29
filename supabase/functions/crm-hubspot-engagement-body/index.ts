// Lazy-fetch the body of a single HubSpot engagement and cache it locally.
// Called from the activity timeline UI when a user expands an item.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsFetch, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BODY_PROPS: Record<string, string[]> = {
  note: ["hs_note_body"],
  email: ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_email_headers"],
  call: ["hs_call_title", "hs_call_body", "hs_call_recording_url", "hs_call_duration"],
  meeting: ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time", "hs_meeting_end_time"],
  task: ["hs_task_subject", "hs_task_body", "hs_task_status"],
};
const HS_OBJECT: Record<string, string> = {
  note: "notes", email: "emails", call: "calls", meeting: "meetings", task: "tasks",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // CRM access check
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin") && !roleSet.has("sales")) {
      return json({ error: "Forbidden" }, 403);
    }

    const { activity_id, force } = await req.json();
    if (!activity_id) return json({ error: "activity_id required" }, 400);

    const { data: activity, error: aErr } = await admin
      .from("crm_activities")
      .select("id,hubspot_id,engagement_type,body_html,body_text,body_fetched_at,hs_updated_at,metadata")
      .eq("id", activity_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!activity) return json({ error: "Activity not found" }, 404);
    if (!activity.hubspot_id || !activity.engagement_type) {
      return json({ error: "Not a HubSpot engagement" }, 400);
    }

    // Cache hit: serve from DB unless forced or out of date
    const stale = activity.hs_updated_at &&
      activity.body_fetched_at &&
      new Date(activity.hs_updated_at) > new Date(activity.body_fetched_at);
    if (!force && activity.body_fetched_at && !stale) {
      return json({
        cached: true,
        body_html: activity.body_html,
        body_text: activity.body_text,
        metadata: activity.metadata,
      });
    }

    const hsObject = HS_OBJECT[activity.engagement_type];
    const props = BODY_PROPS[activity.engagement_type];
    if (!hsObject || !props) return json({ error: "Unsupported engagement type" }, 400);

    const data = await hsFetch<any>(
      `/crm/v3/objects/${hsObject}/${activity.hubspot_id}?properties=${props.join(",")}`,
    );
    const p = data.properties || {};
    const body_html = p.hs_email_html || p.hs_note_body || null;
    const body_text = p.hs_email_text || p.hs_call_body || p.hs_meeting_body || p.hs_task_body || null;

    const newMetadata = { ...(activity.metadata || {}) };
    for (const k of props) {
      if (p[k] != null) newMetadata[k] = p[k];
    }

    await admin
      .from("crm_activities")
      .update({
        body_html,
        body_text,
        body_fetched_at: new Date().toISOString(),
        metadata: newMetadata,
      })
      .eq("id", activity_id);

    return json({ cached: false, body_html, body_text, metadata: newMetadata });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
