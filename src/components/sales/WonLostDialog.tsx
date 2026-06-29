import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComboboxInput } from './ComboboxInput';
import { DEFAULT_LOST_REASONS } from '@/lib/crmLookupDefaults';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: 'won' | 'lost';
  defaultCloseDate?: string | null;
  onConfirm: (payload: { closeDate?: string; reason?: string }) => Promise<void> | void;
}

export function WonLostDialog({ open, onOpenChange, mode, defaultCloseDate, onConfirm }: Props) {
  const [closeDate, setCloseDate] = useState(defaultCloseDate ?? new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const isWon = mode === 'won';

  useEffect(() => {
    if (open) {
      setReason('');
      setCloseDate(defaultCloseDate ?? new Date().toISOString().slice(0, 10));
    }
  }, [open, defaultCloseDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isWon ? 'Mark deal as Won' : 'Mark deal as Lost'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {isWon ? (
            <div className="grid gap-2">
              <Label>Close date *</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Reason</Label>
              <ComboboxInput
                value={reason}
                onChange={setReason}
                options={DEFAULT_LOST_REASONS}
                placeholder="Optional"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              await onConfirm(isWon ? { closeDate } : { reason: reason.trim() || undefined });
              onOpenChange(false);
            }}
            disabled={isWon ? !closeDate : false}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
