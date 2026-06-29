import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProductSyncRuns } from '@/hooks/useLnnProductSync';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ProductSyncHistoryDialog({ open, onOpenChange }: Props) {
  const { data: runs = [], isLoading } = useProductSyncRuns(20);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Product Sync History</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No sync runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const triggered = r.triggered_by.startsWith('user:') ? 'Manual' : 'Scheduled';
                const variant: 'default' | 'destructive' | 'secondary' =
                  r.status === 'success' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary';
                return (
                  <div key={r.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={variant} className="capitalize">{r.status}</Badge>
                        <span className="text-muted-foreground">{triggered}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                      <Stat label="Created" value={r.created_count} />
                      <Stat label="Updated" value={r.updated_count} />
                      <Stat label="Unchanged" value={r.unchanged_count} />
                      <Stat label="Archived" value={r.archived_count} />
                    </div>
                    {r.error && (
                      <p className="mt-2 text-xs text-destructive break-words">{r.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-muted/50 p-2 text-center">
      <div className="font-semibold">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
