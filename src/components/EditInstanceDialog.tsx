import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAudit } from "@/lib/audit";

interface EditInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: any;
  instanceDate: Date;
  onSuccess: () => void;
}

export function EditInstanceDialog({
  open,
  onOpenChange,
  assignment,
  instanceDate,
  onSuccess,
}: EditInstanceDialogProps) {
  const [editMode, setEditMode] = useState<'single' | 'future' | 'skip'>('single');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const dateStr = format(instanceDate, 'yyyy-MM-dd');

      if (editMode === 'skip') {
        // Mark this instance as skipped
        const { error } = await supabase
          .from('assignment_instances')
          .upsert({
            assignment_id: assignment.id,
            instance_date: dateStr,
            is_skipped: true,
            exception_notes: notes || 'Skipped instance',
          });

        if (error) throw error;
        toast.success('Instance skipped successfully');

        if (assignment?.organization_id) {
          void recordAudit({
            organizationId: assignment.organization_id,
            action: 'assignment_instance.skipped',
            entityType: 'assignment_instance',
            entityId: `${assignment.id}_${dateStr}`,
            summary: `Skipped "${assignment.assignment_name ?? 'assignment'}" on ${dateStr}`,
            after: { is_skipped: true, instance_date: dateStr, exception_notes: notes || 'Skipped instance' },
            metadata: {
              instance_date: dateStr,
              base_assignment_id: assignment.id,
            },
          });
        }
      } else if (editMode === 'single') {
        // Open the assignment dialog in edit mode for this instance
        // For now, just show a message
        toast.info('Single instance editing will open the assignment editor');
        // TODO: Integrate with AssignmentDialog to edit this instance
      } else if (editMode === 'future') {
        // Update the parent assignment's due_date to this instance
        const { error } = await supabase
          .from('post_assignments')
          .update({
            due_date: dateStr,
            notes: notes || assignment.notes,
          })
          .eq('id', assignment.id);

        if (error) throw error;
        toast.success('Updated this and all future instances');

        if (assignment?.organization_id) {
          void recordAudit({
            organizationId: assignment.organization_id,
            action: 'assignment.rescheduled',
            entityType: 'assignment',
            entityId: assignment.id,
            summary: `Rescheduled "${assignment.assignment_name ?? 'assignment'}" to ${dateStr}`,
            before: { due_date: assignment.due_date, notes: assignment.notes },
            after: { due_date: dateStr, notes: notes || assignment.notes },
            metadata: { from_instance_date: dateStr, scope: 'this_and_future' },
          });
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating instance:', error);
      toast.error(error.message || 'Failed to update instance');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Recurring Instance</DialogTitle>
          <DialogDescription>
            Choose how you want to modify this recurring assignment instance for{' '}
            <strong>{format(instanceDate, 'MMMM d, yyyy')}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <RadioGroup value={editMode} onValueChange={(val) => setEditMode(val as any)}>
            <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="single" id="single" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="single" className="font-medium cursor-pointer">
                  Edit This Instance Only
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Creates an exception for this specific date without affecting other instances
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="future" id="future" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="future" className="font-medium cursor-pointer">
                  Edit This & All Future Instances
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Updates the recurring pattern starting from this date forward
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="skip" id="skip" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="skip" className="font-medium cursor-pointer">
                  Skip This Instance
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Cancel this occurrence - it won't appear on the calendar
                </p>
              </div>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add notes about this change..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Updating...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
