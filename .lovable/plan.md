## Goal

Before scheduling a WordPress post from the Daily Checklist (per-row chips and the Checklist Detail dialog), warn the admin if another post on the **same WordPress site** is already scheduled to publish at the **same date and time**. Let them override and proceed, or cancel.

## UX

1. Admin clicks a time chip (e.g. `10:45 AM`) on a row.
2. If no conflict → schedule immediately (current behavior, unchanged).
3. If conflict detected → show a confirmation dialog:
   - Title: "Another post is already scheduled at this time"
   - Body: lists the conflicting post(s): headline + scheduled time + site name (when available).
   - Buttons: **Cancel** (default) and **Schedule anyway** (destructive style).
4. On "Schedule anyway" → proceed with the existing `wordpress-post-scheduler` invoke. On "Cancel" → no-op, chip returns to idle.

The chip's loading spinner only starts after the user confirms (or immediately if no conflict).

## Scope

- Conflict source: in-memory `wpInfoByPostId` already maintained by `DailyChecklistContent`, joined with each item's `postDetails.wordpress_site_id` and `headline`. No new network calls, no DB or edge-function changes.
- Conflict rule: another post whose `wpStatus === 'future'` AND `wpScheduledAtGmt` equals the chosen instant to the minute AND shares the same `wordpress_site_id` as the post being scheduled. Posts missing a `wordpress_site_id` on either side are not matched (avoid false positives across unrelated sites).
- Applies to both entry points that render `WordPressScheduleControl`: the inline row chips in `DailyChecklistContent` and the chips inside `ChecklistDetailDialog`.

Out of scope: checking WordPress directly for posts not present in today's checklist, cross-day conflicts, conflicts for non-`future` statuses, and changes to the edge function.

## Technical Details

Files touched:

1. **`src/components/admin/WordPressScheduleControl.tsx`**
   - Add optional prop `findConflict?: (instant: Date) => Array<{ postId: string; headline: string; siteName?: string; instant: Date }>`.
   - Add an AlertDialog (shadcn) with state `pendingSchedule: { instant: Date; index: number; conflicts: ConflictInfo[] } | null`.
   - In the chip `onClick`: call `findConflict(instant)`. If non-empty, open the dialog; else call `handleSchedule` directly. Dialog "Schedule anyway" calls `handleSchedule(instant, index)`.

2. **`src/components/admin/DailyChecklistContent.tsx`**
   - Build a memoized index from `items` + `wpInfoByPostId`: for each item with `postDetails.wordpress_site_id` and `wpInfoByPostId[postId].wpStatus === 'future'`, key by `${siteId}|${minuteFlooredIsoInstant}` → list of `{ postId, headline, siteName }`.
   - Pass a `findConflict` callback to each `WordPressScheduleControl` that looks up the key for the target post's site + chosen instant and excludes the current `postId`.

3. **`src/components/admin/ChecklistDetailDialog.tsx`**
   - Accept and forward the same `findConflict` prop down to its `WordPressScheduleControl`. `DailyChecklistContent` already owns the dialog, so it passes the same callback.

Instant equality uses `Math.floor(instant.getTime() / 60000)` to ignore seconds/ms drift. Site name comes from existing `item.site?.name` (already loaded on the assignment join); fall back to omitting it.

## Verification

- Local typecheck/build is clean.
- Manual: with two checklist rows on the same WP site, schedule one for `10:45 AM`, then try to schedule the other at `10:45 AM` → confirmation dialog appears listing the first post; "Cancel" aborts, "Schedule anyway" proceeds and the second chip becomes `Scheduled 10:45 AM ET`.
- Manual: two rows on different sites at the same time → no warning.
