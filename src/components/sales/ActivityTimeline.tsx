import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCrmActivities, type ActivitiesFilters } from '@/hooks/useCrmActivities';
import { ActivityRow } from './ActivityRow';
import { ActivityComposer } from './ActivityComposer';

interface Props {
  dealId?: string;
  organizationId?: string;
  contactId?: string;
}

const INITIAL_WINDOW_DAYS = 90;

export function ActivityTimeline({ dealId, organizationId, contactId }: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [windowDays, setWindowDays] = useState(INITIAL_WINDOW_DAYS);
  const filters: ActivitiesFilters = useMemo(
    () => ({ dealId, organizationId, contactId, scope: 'all' }),
    [dealId, organizationId, contactId]
  );
  const { data: activities = [], isLoading } = useCrmActivities(filters);

  const cutoff = useMemo(() => Date.now() - windowDays * 24 * 60 * 60 * 1000, [windowDays]);
  const within = useMemo(() => {
    return activities.filter((a) => {
      const ts = a.hs_timestamp ?? a.due_at ?? a.created_at;
      return new Date(ts).getTime() >= cutoff;
    });
  }, [activities, cutoff]);

  // Sort newest first by hs_timestamp/due_at/created_at
  const sorted = useMemo(() => {
    return [...within].sort((a, b) => {
      const at = new Date(a.hs_timestamp ?? a.due_at ?? a.created_at).getTime();
      const bt = new Date(b.hs_timestamp ?? b.due_at ?? b.created_at).getTime();
      return bt - at;
    });
  }, [within]);

  const open = sorted.filter((a) => !a.completed_at && !a.hubspot_id);
  const history = sorted.filter((a) => a.completed_at || a.hubspot_id);
  const olderCount = activities.length - within.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length} of {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
        </p>
        <Button size="sm" onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New activity
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      ) : (
        <>
          {open.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Open tasks</p>
              {open.map((a) => <ActivityRow key={a.id} activity={a} showRelated={false} />)}
            </div>
          )}
          {history.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Timeline</p>
              {history.map((a) => <ActivityRow key={a.id} activity={a} showRelated={false} />)}
            </div>
          )}
        </>
      )}

      {olderCount > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setWindowDays((d) => d + 90)}>
            Load older ({olderCount} more)
          </Button>
        </div>
      )}

      <ActivityComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        defaultDealId={dealId ?? null}
        defaultOrganizationId={organizationId ?? null}
        defaultContactId={contactId ?? null}
      />
    </div>
  );
}
