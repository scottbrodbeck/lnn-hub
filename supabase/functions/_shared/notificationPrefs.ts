// Shared helper to read admin-controlled email exclusion flags for a user.
// Both flags default to false (i.e. user receives emails normally) when the
// preferences row doesn't exist yet.

export interface EmailExclusions {
  creative: boolean;
  stat: boolean;
}

export async function getEmailExclusions(
  supabase: any,
  userId: string,
): Promise<EmailExclusions> {
  if (!userId) return { creative: false, stat: false };
  try {
    const { data } = await supabase
      .from("user_notification_preferences")
      .select("exclude_from_creative_emails, exclude_from_stat_emails")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      creative: !!data?.exclude_from_creative_emails,
      stat: !!data?.exclude_from_stat_emails,
    };
  } catch (err) {
    console.error("getEmailExclusions failed", err);
    return { creative: false, stat: false };
  }
}
