import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface EditNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentName: string;
  currentNotes: string;
  onSave: (notes: string) => void;
  isLoading?: boolean;
}

export function EditNotesDialog({
  open,
  onOpenChange,
  assignmentName,
  currentNotes,
  onSave,
  isLoading,
}: EditNotesDialogProps) {
  const [notes, setNotes] = useState(currentNotes);

  useEffect(() => {
    if (open) {
      setNotes(currentNotes);
    }
  }, [open, currentNotes]);

  const handleSave = () => {
    onSave(notes);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Notes for {assignmentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes for this post..."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
