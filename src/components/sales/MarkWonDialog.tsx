import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface MarkWonResult {
  closeDate: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCloseDate?: string | null;
  onConfirm: (payload: MarkWonResult) => Promise<void> | void;
}

export function MarkWonDialog({ open, onOpenChange, defaultCloseDate, onConfirm }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [closeDate, setCloseDate] = useState<string>(defaultCloseDate ?? today);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCloseDate(defaultCloseDate ?? today);
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultCloseDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark deal as Won</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="won-close-date">Close date *</Label>
            <Input
              id="won-close-date"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>

          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            After confirming, the closed-won checklist on this deal walks through the
            follow-ups: QuickBooks invoice, admin client, content assignments, and display
            ad campaigns — each optional and individually skippable.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!closeDate || submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm({ closeDate });
                onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? 'Marking won…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
