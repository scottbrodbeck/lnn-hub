import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCrmImportBatches } from '@/hooks/useCrmImportBatches';
import { useHubspotUndo } from '@/hooks/useHubspotImport';
import { HubspotImportWizard } from './HubspotImportWizard';
import { Download, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    previewing: 'bg-muted text-muted-foreground',
    ready: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    importing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    failed: 'bg-destructive/10 text-destructive',
    undone: 'bg-muted text-muted-foreground line-through',
  };
  return <Badge variant="outline" className={map[status] || ''}>{status}</Badge>;
}

function summarize(counts: any) {
  if (!counts || typeof counts !== 'object') return '—';
  return Object.entries(counts)
    .map(([k, v]: any) => {
      const c = v.create ?? 0;
      const u = v.update ?? v.match ?? 0;
      return `${k}: +${c} ~${u}`;
    })
    .join(' · ');
}

export function ImportsPanel({ canEdit }: { canEdit: boolean }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data: batches, isLoading } = useCrmImportBatches();
  const undo = useHubspotUndo();
  const qc = useQueryClient();

  const handleUndo = async (id: string) => {
    if (!confirm(
      'Undo this import?\n\n' +
      '• Records newly created by this batch will be deleted.\n' +
      '• Existing records updated by this batch will be un-tagged from the batch but their current data remains (we do not have field-level history to restore).'
    )) return;
    try {
      const r = await undo.mutateAsync({ batch_id: id });
      toast.success(`Undone — deleted ${r.deleted ?? 0}, un-tagged ${r.untagged ?? 0}`);
      qc.invalidateQueries({ queryKey: ['crm'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              HubSpot import
            </CardTitle>
            <CardDescription>
              Bring deals, organizations, contacts and products from HubSpot into the CRM.
              Preview before committing — every import can be undone.
            </CardDescription>
          </div>
          <Button disabled={!canEdit} onClick={() => setWizardOpen(true)}>
            New import
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !batches?.length ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="capitalize">{b.source}</TableCell>
                    <TableCell>{statusBadge(b.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {summarize(b.counts)}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status === 'completed' && canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUndo(b.id)}
                          disabled={undo.isPending}
                        >
                          <Undo2 className="h-4 w-4 mr-1" /> Undo
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <HubspotImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
