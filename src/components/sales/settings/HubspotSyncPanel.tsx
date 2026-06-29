import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, AlertCircle, Cloud, ShieldAlert, PauseCircle } from 'lucide-react';
import {
  useCrmSyncState,
  useCrmOutboxStats,
  useCrmSyncLog,
  useTriggerSyncTick,
  useTriggerPush,
  useSyncPaused,
  useSetSyncPaused,
} from '@/hooks/useCrmSyncHealth';
import { useCrmOwners, useUpdateOwnerMapping } from '@/hooks/useCrmOwners';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';
import { HubspotBackfillPanel } from './HubspotBackfillPanel';

interface Props {
  canEdit: boolean;
}

function fmtAgo(iso: string | null) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

const OBJECT_LABELS: Record<string, string> = {
  owners: 'Owners',
  pipelines: 'Pipelines & stages',
  companies: 'Companies',
  contacts: 'Contacts',
  deals: 'Deals',
  engagements_emails: 'Emails',
  engagements_notes: 'Notes',
  engagements_calls: 'Calls',
  engagements_meetings: 'Meetings',
  engagements_tasks: 'Tasks',
};

export function HubspotSyncPanel({ canEdit }: Props) {
  const { data: states = [] } = useCrmSyncState();
  const { data: outbox } = useCrmOutboxStats();
  const { data: log = [] } = useCrmSyncLog(15);
  const { data: owners = [] } = useCrmOwners();
  const { data: users = [] } = useSalesEligibleUsers();
  const tickMut = useTriggerSyncTick();
  const pushMut = useTriggerPush();
  const updateMapping = useUpdateOwnerMapping();
  const { data: pauseState } = useSyncPaused();
  const setPaused = useSetSyncPaused();
  const isPaused = !!pauseState?.paused;

  const mapped = useMemo(() => owners.filter((o) => o.profile_id && !o.archived), [owners]);
  const unmapped = useMemo(() => owners.filter((o) => !o.profile_id && !o.archived), [owners]);

  const outboxBadgeVariant = (outbox?.failed ?? 0) > 0
    ? 'destructive'
    : (outbox?.error ?? 0) > 0
    ? 'secondary'
    : 'outline';

  return (
    <div className="space-y-6">
      {/* Pause banner — visible when sync is paused (manual or auto-tripped circuit breaker) */}
      {isPaused && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>HubSpot sync is paused</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">
              No changes are being pushed to or pulled from HubSpot. This may be a manual pause or
              an automatic safety stop (burst threshold exceeded). Review recent activity below
              before resuming.
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || setPaused.isPending}
              onClick={() => setPaused.mutate(false)}
            >
              Resume sync
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pause toggle — primary control */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PauseCircle className="h-4 w-4" /> Pause HubSpot sync
            </CardTitle>
            <CardDescription>
              Halts all pulls and pushes. Outbox keeps queuing locally; nothing is lost.
              Resume to drain the queue.
            </CardDescription>
          </div>
          <Switch
            checked={isPaused}
            disabled={!canEdit || setPaused.isPending}
            onCheckedChange={(v) => setPaused.mutate(v)}
            aria-label="Pause HubSpot sync"
          />
        </CardHeader>
      </Card>

      {/* Guardrails summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" /> Safety guardrails
          </CardTitle>
          <CardDescription>
            Built-in protections so the system can never delete HubSpot records or run away with
            bulk changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
            <li>System never deletes HubSpot records — archive in HubSpot directly.</li>
            <li>Push budget: 50 / tick · 200 / hour · 1,000 / day.</li>
            <li>Auto-pause if more than 100 pending writes appear in 5 minutes.</li>
            <li>Per-user rate limit: 30 enqueues / minute.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Sync health */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" /> Sync health
            </CardTitle>
            <CardDescription>HubSpot is the source of truth. Pulls run every 2 minutes.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pushMut.mutate()}
              disabled={!canEdit || pushMut.isPending || isPaused}
              title={isPaused ? 'Sync is paused — resume to push outbox' : undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${pushMut.isPending ? 'animate-spin' : ''}`} />
              Push outbox
            </Button>
            <Button
              size="sm"
              onClick={() => tickMut.mutate()}
              disabled={!canEdit || tickMut.isPending || isPaused}
              title={isPaused ? 'Sync is paused — resume to run a sync' : undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${tickMut.isPending ? 'animate-spin' : ''}`} />
              Force sync now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-semibold">{outbox?.pending ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">In flight</p>
              <p className="text-2xl font-semibold">{outbox?.in_flight ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Retrying</p>
              <p className="text-2xl font-semibold text-amber-500">{outbox?.error ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-semibold text-destructive">{outbox?.failed ?? 0}</p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Object</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {states.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No sync runs recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {states.map((s) => (
                <TableRow key={s.object_type}>
                  <TableCell>{OBJECT_LABELS[s.object_type] ?? s.object_type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtAgo(s.last_run_at)}</TableCell>
                  <TableCell>
                    {s.last_run_status === 'ok' ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-300">OK</Badge>
                    ) : s.last_run_status === 'error' ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> Error
                      </Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
                    {s.last_error && (
                      <p className="text-xs text-destructive mt-1 max-w-md truncate" title={s.last_error}>
                        {s.last_error}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{s.records_processed ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground mb-2">Recent activity</p>
            <div className="rounded-md border max-h-64 overflow-auto">
              {log.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No log entries yet.</p>
              ) : (
                <ul className="divide-y text-xs">
                  {log.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-[10px]">{l.direction}</Badge>
                        <span className="font-medium">{l.entity_type}</span>
                        <span className={`uppercase ${l.status === 'ok' ? 'text-emerald-600' : l.status === 'error' ? 'text-destructive' : 'text-amber-600'}`}>
                          {l.status}
                        </span>
                        {l.error && (
                          <span className="text-destructive truncate max-w-md" title={l.error}>{l.error}</span>
                        )}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {fmtAgo(l.created_at)} · {l.latency_ms}ms · {l.records_processed ?? 0} rec
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Owner mapping */}
      <Card>
        <CardHeader>
          <CardTitle>HubSpot owner mapping</CardTitle>
          <CardDescription>
            Owners are auto-matched to local users by email. Manual mappings here override the auto-match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {unmapped.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">
                Unmapped <Badge variant="secondary" className="ml-1">{unmapped.length}</Badge>
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HubSpot owner</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Map to user</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmapped.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.full_name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{o.email ?? '—'}</TableCell>
                      <TableCell>
                        <Select
                          disabled={!canEdit}
                          onValueChange={(v) => updateMapping.mutate({ ownerId: o.id, profileId: v })}
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue placeholder="Pick a user…" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name ?? u.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">
              Mapped <Badge variant="outline" className="ml-1">{mapped.length}</Badge>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HubSpot owner</TableHead>
                  <TableHead>Mapped to</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapped.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                      No owners mapped yet.
                    </TableCell>
                  </TableRow>
                )}
                {mapped.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{o.email}</div>
                    </TableCell>
                    <TableCell>{o.profile?.full_name ?? o.profile?.email ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {o.match_method === 'manual' ? 'Manual' : 'Auto (email)'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        disabled={!canEdit}
                        value={o.profile_id ?? ''}
                        onValueChange={(v) =>
                          updateMapping.mutate({ ownerId: o.id, profileId: v === '__clear__' ? null : v })
                        }
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__clear__">Clear mapping</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name ?? u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <HubspotBackfillPanel canEdit={canEdit} />
    </div>
  );
}
