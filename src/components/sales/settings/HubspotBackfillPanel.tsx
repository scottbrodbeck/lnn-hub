import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Download, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import {
  useBackfillStatus, useBackfillStart, useBackfillReset, useCleanupBodies,
} from '@/hooks/useBackfill';

const OBJECT_LABELS: Record<string, string> = {
  owners: 'Owners',
  pipelines: 'Pipelines & stages',
  companies: 'Companies',
  contacts: 'Contacts',
  deals: 'Deals',
  engagements_notes: 'Notes',
  engagements_emails: 'Emails',
  engagements_calls: 'Calls',
  engagements_meetings: 'Meetings',
  engagements_tasks: 'Tasks',
};

interface Props {
  canEdit: boolean;
}

export function HubspotBackfillPanel({ canEdit }: Props) {
  const { data: status = {}, isLoading } = useBackfillStatus();
  const startMut = useBackfillStart();
  const resetMut = useBackfillReset();
  const cleanupMut = useCleanupBodies();

  const [autoRunning, setAutoRunning] = useState(false);
  const lastCountsRef = useRef<Record<string, number>>({});
  const stableTicksRef = useRef(0);

  // Auto-loop: keep calling 'start' until row counts stop growing for 2 successive ticks.
  useEffect(() => {
    if (!autoRunning) return;
    const tick = async () => {
      const before = Object.fromEntries(
        Object.entries(status).map(([k, v]) => [k, v.row_count])
      );
      // Use current row counts as a soft expected upper-bound; backfill is a pull
      // (no HubSpot writes), so this is just an admin acknowledgement of scale.
      const expected = Object.values(before).reduce((s: number, n: any) => s + (n ?? 0), 0);
      await startMut.mutateAsync({ expected_count: Math.max(expected, 1) });
      // Compare with previous run
      const grew = Object.entries(before).some(([k, v]) => (lastCountsRef.current[k] ?? -1) !== v);
      if (!grew) stableTicksRef.current += 1;
      else stableTicksRef.current = 0;
      lastCountsRef.current = before;
      if (stableTicksRef.current >= 2) {
        setAutoRunning(false);
        stableTicksRef.current = 0;
      }
    };
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [autoRunning, status, startMut]);

  const objects = Object.keys(OBJECT_LABELS);
  const totalRows = objects.reduce((sum, k) => sum + (status[k]?.row_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> Initial backfill
            </CardTitle>
            <CardDescription>
              Pull all historical HubSpot data into the local mirror. Safe to run multiple times — incremental syncs will resume from the latest watermark afterward.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setAutoRunning((v) => !v)}
              disabled={!canEdit}
            >
              {autoRunning ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Stop</>
              ) : (
                <><Download className="h-3.5 w-3.5 mr-1" /> Run backfill</>
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={!canEdit}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset watermarks
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all watermarks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The next sync run will pull every record from HubSpot from the beginning. This is safe (existing rows are upserted) but uses HubSpot API quota. Use this if data appears out of sync.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetMut.mutate(undefined)}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${totalRows.toLocaleString()} rows mirrored locally across ${objects.length} object types.`}
          </p>

          <div className="space-y-3">
            {objects.map((key) => {
              const s = status[key];
              const inProgress = autoRunning && s?.last_run_status !== 'error';
              return (
                <div key={key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{OBJECT_LABELS[key]}</span>
                      {s?.last_run_status === 'error' && (
                        <Badge variant="destructive" className="text-[10px]">Error</Badge>
                      )}
                      {inProgress && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Running
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm font-mono">
                      {(s?.row_count ?? 0).toLocaleString()} rows
                    </span>
                  </div>
                  <Progress
                    value={inProgress ? undefined : 100}
                    className={inProgress ? 'animate-pulse' : ''}
                  />
                  {s?.last_error && (
                    <p className="text-xs text-destructive mt-2 truncate" title={s.last_error}>
                      {s.last_error}
                    </p>
                  )}
                  {s?.watermark && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Watermark: {new Date(parseInt(s.watermark) || s.watermark).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {autoRunning && (
            <p className="text-xs text-muted-foreground italic">
              Backfill will keep pulling pages until row counts stabilize. You can stop anytime — incremental syncs continue automatically.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Engagement body cleanup
          </CardTitle>
          <CardDescription>
            Removes cached email/note bodies older than 90 days to keep the database lean. Bodies are re-fetched on demand if a user opens the item again. Runs automatically on the 1st of every month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanupMut.mutate()}
            disabled={!canEdit || cleanupMut.isPending}
          >
            {cleanupMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Cleaning…</>
            ) : (
              <><Trash2 className="h-3.5 w-3.5 mr-1" /> Run cleanup now</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
