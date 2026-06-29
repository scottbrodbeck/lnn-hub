import { useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChevronDown, Loader2, Search, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useHubspotReconcile,
  type ReconcileEntity,
  type ReconcileResult,
} from '@/hooks/useHubspotReconcile';

interface Props { canEdit: boolean; }

const SCOPE_OPTIONS: { key: ReconcileEntity; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'contact', label: 'Contacts' },
  { key: 'company', label: 'Organizations' },
];

export function HubspotReconcilePanel({ canEdit }: Props) {
  const reconcile = useHubspotReconcile();
  const [scope, setScope] = useState<ReconcileEntity>('both');
  const [preview, setPreview] = useState<ReconcileResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'deleting'>('idle');

  const totalMatches =
    (preview?.totals.matched_locally.contacts ?? 0) +
    (preview?.totals.matched_locally.organizations ?? 0);

  const onScan = async () => {
    setPhase('scanning');
    try {
      const r = await reconcile.mutateAsync({ action: 'scan', entity: scope });
      setPreview(r);
      const total =
        r.totals.matched_locally.contacts + r.totals.matched_locally.organizations;
      toast.success(`Scan complete — ${total} local rows matched archived HubSpot records.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Scan failed');
    } finally {
      setPhase('idle');
    }
  };

  const onReconcile = async () => {
    setPhase('deleting');
    try {
      const r = await reconcile.mutateAsync({ action: 'reconcile', entity: scope });
      setPreview(r);
      toast.success(
        `Deleted ${r.deleted?.contacts ?? 0} contacts, ${r.deleted?.organizations ?? 0} organizations.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Reconcile failed');
    } finally {
      setPhase('idle');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Reconcile Archived HubSpot Records
        </CardTitle>
        <CardDescription>
          Find contacts and organizations archived in HubSpot and hard-delete the
          matching local rows. HubSpot is never modified by this action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">Scope:</span>
          {SCOPE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              size="sm"
              variant={scope === opt.key ? 'default' : 'outline'}
              onClick={() => setScope(opt.key)}
              disabled={phase !== 'idle'}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onScan} disabled={!canEdit || phase !== 'idle'}>
            {phase === 'scanning'
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Search className="h-4 w-4 mr-2" />}
            Preview Archived Records
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={!canEdit || phase !== 'idle' || totalMatches === 0}
              >
                {phase === 'deleting'
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Trash2 className="h-4 w-4 mr-2" />}
                Delete {totalMatches} local record{totalMatches === 1 ? '' : 's'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hard-delete local records?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes {totalMatches} row
                  {totalMatches === 1 ? '' : 's'} from the local database
                  ({preview?.totals.matched_locally.contacts ?? 0} contact
                  {preview?.totals.matched_locally.contacts === 1 ? '' : 's'},{' '}
                  {preview?.totals.matched_locally.organizations ?? 0} organization
                  {preview?.totals.matched_locally.organizations === 1 ? '' : 's'}).
                  HubSpot is not modified. Linked deals and activities are kept
                  but will reference the deleted IDs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReconcile}>
                  Delete {totalMatches} record{totalMatches === 1 ? '' : 's'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {preview && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Archived in HubSpot</div>
                <div className="mt-1">
                  {preview.totals.archived_in_hubspot.contacts} contacts /{' '}
                  {preview.totals.archived_in_hubspot.organizations} orgs
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Matched locally</div>
                <div className="mt-1 font-medium">
                  {preview.totals.matched_locally.contacts} contacts /{' '}
                  {preview.totals.matched_locally.organizations} orgs
                </div>
              </div>
            </div>

            {(preview.totals.linked_records.contacts > 0 ||
              preview.totals.linked_records.organizations > 0) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Linked data will become orphaned</AlertTitle>
                <AlertDescription>
                  {preview.totals.linked_records.contacts +
                    preview.totals.linked_records.organizations}{' '}
                  related deal/activity rows reference these records and will be
                  left in place pointing to deleted IDs.
                </AlertDescription>
              </Alert>
            )}

            {preview.totals.truncated && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>More archived records may exist</AlertTitle>
                <AlertDescription>
                  HubSpot returned 10,000+ archived records — run reconcile, then
                  preview again to catch the rest.
                </AlertDescription>
              </Alert>
            )}

            {preview.contacts.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                  <ChevronDown className="h-4 w-4" />
                  Contacts to delete ({preview.contacts.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 max-h-64 overflow-auto rounded-md border p-2 text-sm space-y-1">
                  {preview.contacts.map((c) => (
                    <div key={c.id} className="flex justify-between gap-2">
                      <span>{c.label}</span>
                      <span className="text-muted-foreground text-xs">{c.email ?? ''}</span>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {preview.organizations.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                  <ChevronDown className="h-4 w-4" />
                  Organizations to delete ({preview.organizations.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 max-h-64 overflow-auto rounded-md border p-2 text-sm space-y-1">
                  {preview.organizations.map((o) => (
                    <div key={o.id}>{o.label}</div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {preview.deleted && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                <div className="font-medium">Reconcile complete</div>
                <div className="text-muted-foreground mt-1">
                  Deleted {preview.deleted.contacts} contacts and{' '}
                  {preview.deleted.organizations} organizations. Cleared{' '}
                  {(preview.outbox_cleared?.contacts ?? 0) +
                    (preview.outbox_cleared?.organizations ?? 0)}{' '}
                  pending outbox rows. Logged to <Badge variant="secondary">crm_sync_log</Badge>.
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
