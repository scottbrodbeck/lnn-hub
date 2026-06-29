import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDisabledDates, getMinimumRequestDate } from '@/lib/dateRequestUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notifyAdminsOfDateChangeRequest } from '@/lib/notificationUtils';

interface RequestNewDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  assignmentName: string;
  currentDueDate: string;
  instanceDate?: Date;
  onSuccess: () => void;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
}

export function RequestNewDateDialog({
  open,
  onOpenChange,
  assignmentId,
  assignmentName,
  currentDueDate,
  instanceDate,
  onSuccess,
  userId,
  organizationId,
  organizationName,
}: RequestNewDateDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const minDate = getMinimumRequestDate();
  const disabledDates = getDisabledDates();
  
  const currentDate = instanceDate || parseISO(currentDueDate);

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error('Please select a new date');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('post_edit_requests').insert({
        request_type: 'date_change',
        assignment_id: assignmentId,
        instance_date: instanceDate ? format(instanceDate, 'yyyy-MM-dd') : null,
        old_due_date: format(currentDate, 'yyyy-MM-dd'),
        new_due_date: format(selectedDate, 'yyyy-MM-dd'),
        requested_by: userId,
        request_reason: reason || null,
        status: 'pending',
        // post_id is required but not relevant for date changes - use a placeholder approach
        // We'll need to handle this differently - let's use the assignment_id reference instead
        post_id: '00000000-0000-0000-0000-000000000000', // Placeholder - will be ignored for date_change type
      });

      if (error) throw error;

      // Send webhook notification for date change request
      await notifyAdminsOfDateChangeRequest(supabase, {
        assignmentId,
        assignmentName,
        userId,
        organizationId,
        organizationName,
        oldDueDate: format(currentDate, 'yyyy-MM-dd'),
        newDueDate: format(selectedDate, 'yyyy-MM-dd'),
        requestReason: reason || null,
        instanceDate: instanceDate ? format(instanceDate, 'yyyy-MM-dd') : null,
      });

      toast.success('Date change request submitted');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error submitting date change request:', error);
      toast.error('Failed to submit request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedDate(undefined);
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request New Date</DialogTitle>
          <DialogDescription>
            Request a new publication date for "{assignmentName}". The new date must be a weekday 
            and at least 2 business days from today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Current Date</Label>
            <div className="p-3 bg-muted rounded-md text-sm">
              {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </div>
          </div>

          <div className="space-y-2">
            <Label>New Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'EEEE, MMMM d, yyyy') : 'Select a new date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                  disabled={disabledDates}
                  defaultMonth={minDate}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Available dates start from {format(minDate, 'MMMM d, yyyy')} (weekdays only)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need to change the date?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedDate}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
