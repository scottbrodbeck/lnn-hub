import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { completeAssignmentsForPost, extractUuidsFromAssignmentIds } from '@/lib/assignmentUtils';

interface OrphanedPost {
  id: string;
  headline: string;
  client_id: string;
  client?: {
    full_name: string | null;
    email: string;
    organization_id: string | null;
  };
}

interface Assignment {
  id: string;
  assignment_name: string;
  due_date: string | null;
  site_id: string;
  organization_id: string | null;
  is_completed: boolean;
  site?: { name: string };
  organization?: { name: string };
}

interface LinkOrphanedPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: OrphanedPost | null;
  onSuccess: () => void;
}

export function LinkOrphanedPostDialog({
  open,
  onOpenChange,
  post,
  onSuccess,
}: LinkOrphanedPostDialogProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [triggerWordPress, setTriggerWordPress] = useState(true);
  const [markComplete, setMarkComplete] = useState(true);

  useEffect(() => {
    if (open && post) {
      fetchOrganizations();
      // If the post's client has an organization, pre-select it
      if (post.client?.organization_id) {
        setSelectedOrgId(post.client.organization_id);
      }
    }
  }, [open, post]);

  useEffect(() => {
    if (selectedOrgId) {
      fetchAssignments(selectedOrgId);
    } else {
      setAssignments([]);
    }
  }, [selectedOrgId]);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  };

  const fetchAssignments = async (orgId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          id,
          assignment_name,
          due_date,
          site_id,
          organization_id,
          is_completed,
          site:sites(name),
          organization:organizations(name)
        `)
        .eq('organization_id', orgId)
        .eq('is_completed', false)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setAssignments(data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!post || !selectedAssignmentId) {
      toast.error('Please select an assignment');
      return;
    }

    setSaving(true);
    try {
      // Update the post with the assignment ID
      const { error: updateError } = await supabase
        .from('posts')
        .update({
          assignment_ids: [selectedAssignmentId]
        })
        .eq('id', post.id);

      if (updateError) throw updateError;

      // Mark assignment as complete if checkbox is checked
      if (markComplete) {
        const result = await completeAssignmentsForPost(supabase, [selectedAssignmentId], post.id);
        if (!result.success) {
          console.error('Error completing assignment:', result.errors);
        }
      }

      // Trigger WordPress publishing if checkbox is checked
      if (triggerWordPress) {
        const assignment = assignments.find(a => a.id === selectedAssignmentId);
        if (assignment?.site_id) {
          const { error: wpError } = await supabase.functions.invoke('publish-to-wordpress', {
            body: {
              mode: 'publish',
              site_id: assignment.site_id,
              post_id: post.id
            }
          });

          if (wpError) {
            console.error('WordPress publish error:', wpError);
            toast.error('Post linked but WordPress draft creation failed');
          } else {
            toast.success('Post linked and WordPress draft created');
          }
        }
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error linking post:', error);
      toast.error('Failed to link post: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedAssignmentId('');
    setSelectedOrgId('');
    setAssignments([]);
    setTriggerWordPress(true);
    setMarkComplete(true);
    onOpenChange(false);
  };

  // Sort assignments by date (nulls last)
  const sortedAssignments = [...assignments].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Post to Assignment</DialogTitle>
          <DialogDescription>
            Select an assignment to link this post to. This will allow WordPress publishing.
          </DialogDescription>
        </DialogHeader>

        {post && (
          <div className="space-y-4 py-4">
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-medium">Post: {post.headline}</p>
              <p className="text-xs text-muted-foreground mt-1">
                By: {post.client?.full_name || post.client?.email || 'Unknown'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrgId && (
              <div className="space-y-2">
                <Label>Assignment</Label>
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sortedAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No assignments found for this organization.
                  </p>
                ) : (
                  <RadioGroup
                    value={selectedAssignmentId}
                    onValueChange={setSelectedAssignmentId}
                    className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2"
                  >
                    {sortedAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50"
                      >
                        <RadioGroupItem value={assignment.id} id={assignment.id} />
                        <label
                          htmlFor={assignment.id}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          <div className="font-medium">{assignment.assignment_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {assignment.site?.name} • {' '}
                            {assignment.due_date
                              ? format(parseISO(assignment.due_date), 'MMM d, yyyy')
                              : 'No date'}
                          </div>
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mark-complete"
                  checked={markComplete}
                  onCheckedChange={(checked) => setMarkComplete(checked as boolean)}
                />
                <label
                  htmlFor="mark-complete"
                  className="text-sm font-medium cursor-pointer"
                >
                  Mark assignment as complete
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="trigger-wordpress"
                  checked={triggerWordPress}
                  onCheckedChange={(checked) => setTriggerWordPress(checked as boolean)}
                />
                <label
                  htmlFor="trigger-wordpress"
                  className="text-sm font-medium cursor-pointer"
                >
                  Create WordPress draft after linking
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedAssignmentId || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Link Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
