import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TIMEZONE } from '@/lib/editTimeUtils';
import { STANDARD_PUBLISH_TIMES, getTodayEtInstant, isPastEt, formatEtTime } from '@/lib/publishTimes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type WpStatus =
  | 'draft'
  | 'pending'
  | 'future'
  | 'publish'
  | 'private'
  | 'not_found'
  | 'error'
  | 'no_wp_post';

export interface WpPostInfo {
  wpStatus: WpStatus;
  wpScheduledAtGmt: string | null;
  error?: string;
}

export interface ScheduleConflict {
  postId: string;
  headline: string;
  siteName?: string;
  instant: Date;
}

interface WordPressScheduleControlProps {
  postId: string;
  info: WpPostInfo | undefined; // undefined = status still loading
  compact?: boolean;
  onWpInfoChanged: (postId: string, info: WpPostInfo) => void;
  /**
   * Returns any other posts already scheduled on the same site at the same minute
   * as the given instant. Used to warn the user before double-booking a timeslot.
   */
  findConflict?: (instant: Date) => ScheduleConflict[];
}

const SCHEDULABLE: WpStatus[] = ['draft', 'pending'];

function statusBadge(info: WpPostInfo) {
  switch (info.wpStatus) {
    case 'draft':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">WP Draft</Badge>;
    case 'pending':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">WP Pending</Badge>;
    case 'future':
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          {info.wpScheduledAtGmt
            ? `Scheduled ${formatInTimeZone(new Date(info.wpScheduledAtGmt), TIMEZONE, "MMM d, h:mm a 'ET'")}`
            : 'Scheduled'}
        </Badge>
      );
    case 'publish':
      return <Badge className="bg-green-600">Published</Badge>;
    case 'private':
      return <Badge variant="secondary">Private</Badge>;
    case 'not_found':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Not found in WP</Badge>;
    case 'error':
      return (
        <Badge variant="secondary" title={info.error}>
          WP status unavailable
        </Badge>
      );
    default:
      return null;
  }
}

export function WordPressScheduleControl({
  postId,
  info,
  compact = false,
  onWpInfoChanged,
  findConflict,
}: WordPressScheduleControlProps) {
  const [schedulingIndex, setSchedulingIndex] = useState<number | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    { instant: Date; index: number; conflicts: ScheduleConflict[] } | null
  >(null);

  if (info?.wpStatus === 'no_wp_post') return null;

  if (!info) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        WP status...
      </span>
    );
  }

  const timeOptions = STANDARD_PUBLISH_TIMES.map(t => getTodayEtInstant(t.hour, t.minute));
  const allPast = timeOptions.every(isPastEt);
  const showChips = SCHEDULABLE.includes(info.wpStatus);

  const handleSchedule = async (instant: Date, index: number) => {
    setSchedulingIndex(index);
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-post-scheduler', {
        body: {
          action: 'schedule',
          post_id: postId,
          scheduled_at: instant.toISOString(),
        },
      });

      if (error) {
        // FunctionsHttpError: pull the structured body for 409/400 self-correction
        let body: any = null;
        try {
          body = await (error as any).context?.json?.();
        } catch { /* ignore */ }

        if (body?.error === 'not_schedulable' && body.currentStatus) {
          onWpInfoChanged(postId, {
            wpStatus: body.currentStatus,
            wpScheduledAtGmt: body.currentScheduledAtGmt ?? null,
          });
          toast.error(`Post is already "${body.currentStatus}" on WordPress — status updated`);
          return;
        }
        if (body?.error === 'scheduled_time_in_past') {
          toast.error('That publishing time has already passed');
          return;
        }
        throw new Error(body?.error || error.message);
      }

      if (data?.success) {
        onWpInfoChanged(postId, {
          wpStatus: data.wpStatus,
          wpScheduledAtGmt: data.wpScheduledAtGmt ?? null,
        });
        if (data.wpStatus === 'future') {
          toast.success(
            `Scheduled for ${formatInTimeZone(new Date(data.wpScheduledAtGmt), TIMEZONE, "h:mm a 'ET'")}`
          );
        } else {
          toast.warning(`WordPress reports status "${data.wpStatus}"`);
        }
      } else {
        throw new Error(data?.error || 'Scheduling failed');
      }
    } catch (err: any) {
      console.error('Failed to schedule WP post:', err);
      toast.error('Failed to schedule: ' + (err.message || 'Unknown error'));
    } finally {
      setSchedulingIndex(null);
    }
  };

  return (
    <div className={compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2'}>
      <div>{statusBadge(info)}</div>
      {showChips && (
        <div className="flex items-center gap-1 flex-wrap">
          {timeOptions.map((instant, index) => {
            const past = isPastEt(instant);
            return (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={past || schedulingIndex !== null}
                title={past ? 'This time has passed' : `Schedule for ${formatEtTime(instant)} ET today`}
                onClick={(e) => {
                  e.stopPropagation();
                  const conflicts = findConflict ? findConflict(instant) : [];
                  if (conflicts.length > 0) {
                    setPendingConfirm({ instant, index, conflicts });
                  } else {
                    handleSchedule(instant, index);
                  }
                }}
              >
                {schedulingIndex === index ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  formatEtTime(instant)
                )}
              </Button>
            );
          })}
          {allPast && (
            <span className="text-xs text-muted-foreground">Today's standard times have passed</span>
          )}
        </div>
      )}

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Another post is already scheduled at this time</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {pendingConfirm
                    ? `The following ${pendingConfirm.conflicts.length === 1 ? 'post is' : 'posts are'} already scheduled for ${formatEtTime(pendingConfirm.instant)} ET on the same site:`
                    : ''}
                </p>
                <ul className="list-disc pl-5 text-sm">
                  {pendingConfirm?.conflicts.map((c) => (
                    <li key={c.postId}>
                      <span className="font-medium">{c.headline || 'Untitled post'}</span>
                      {c.siteName ? <span className="text-muted-foreground"> — {c.siteName}</span> : null}
                    </li>
                  ))}
                </ul>
                <p>Schedule anyway?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                if (pendingConfirm) {
                  const { instant, index } = pendingConfirm;
                  setPendingConfirm(null);
                  handleSchedule(instant, index);
                }
              }}
            >
              Schedule anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
