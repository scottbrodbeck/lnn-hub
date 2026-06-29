import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Globe, Minus, Plus } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type ContentCategory = 'website' | 'email_blast' | 'email_sponsorship';

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  website: 'Sponsored Post',
  email_blast: 'Email Blast',
  email_sponsorship: 'Email Sponsorship',
};

const CATEGORY_VARIANTS: Record<ContentCategory, 'default' | 'secondary' | 'outline'> = {
  website: 'default',
  email_blast: 'secondary',
  email_sponsorship: 'outline',
};

interface Assignment {
  id: string;
  originalId?: string;
  assignment_name: string;
  due_date: string;
  recurrence_type?: string;
  instanceDate?: Date;
  notes?: string | null;
  content_category?: string;
  site?: { name: string; url?: string };
  profiles?: { full_name: string | null; email: string };
}

interface AssignmentSelectorProps {
  assignments: Assignment[];
  selectedAssignments: string[];
  onToggleAssignment: (id: string) => void;
  onClearSelection?: () => void;
  isLoading?: boolean;
  mode: 'client' | 'admin';
  /** For admin mode - use radio instead of checkbox */
  singleSelect?: boolean;
  /** Optional: wrap in collapsible */
  collapsible?: boolean;
  collapsibleOpen?: boolean;
  onCollapsibleOpenChange?: (open: boolean) => void;
  collapsibleTitle?: string;
  emptyMessage?: string;
}

export function AssignmentSelector({
  assignments,
  selectedAssignments,
  onToggleAssignment,
  onClearSelection,
  isLoading = false,
  mode,
  singleSelect = false,
  collapsible = false,
  collapsibleOpen = false,
  onCollapsibleOpenChange,
  collapsibleTitle = 'Select Assignment',
  emptyMessage = 'No assignments available',
}: AssignmentSelectorProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading assignments...
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        {emptyMessage}
      </div>
    );
  }

  const content = (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {assignments.map((assignment) => {
        const isSelected = selectedAssignments.includes(assignment.id);

        // Handle TBD dates
        const hasDueDate = assignment.due_date && assignment.due_date !== 'TBD';
        const dueDate = hasDueDate 
          ? (assignment.instanceDate || new Date(assignment.due_date + 'T00:00:00'))
          : null;

        return (
          <label
            key={assignment.id}
            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {singleSelect ? (
              <input
                type="radio"
                name="assignment"
                checked={isSelected}
                onChange={() => onToggleAssignment(assignment.id)}
                className="h-4 w-4"
              />
            ) : (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleAssignment(assignment.id)}
                className="mt-0.5"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium text-sm truncate">
                  {assignment.assignment_name}
                </div>
                {assignment.content_category && CATEGORY_LABELS[assignment.content_category as ContentCategory] && (
                  <Badge
                    variant={CATEGORY_VARIANTS[assignment.content_category as ContentCategory]}
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {CATEGORY_LABELS[assignment.content_category as ContentCategory]}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                {mode === 'admin' && assignment.profiles && (
                  <span>
                    {assignment.profiles.full_name || assignment.profiles.email}
                  </span>
                )}
                {mode === 'admin' && assignment.profiles && <span>•</span>}
                <span>{dueDate ? format(dueDate, 'MMM d, yyyy') : 'Date TBD'}</span>
                {assignment.recurrence_type && assignment.recurrence_type !== 'one_time' && (
                  <span className="text-muted-foreground">(recurring)</span>
                )}
              </div>
              {assignment.site && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                  <Globe className="h-3 w-3" />
                  <span>{assignment.site.name}</span>
                </div>
              )}
              {mode === 'client' && assignment.notes && (
                <p className="mt-1 text-xs text-muted-foreground bg-muted/50 p-1.5 rounded">
                  <span className="font-medium">Note:</span> {assignment.notes}
                </p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );

  if (collapsible) {
    return (
      <Collapsible open={collapsibleOpen} onOpenChange={onCollapsibleOpenChange}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary w-full">
          {collapsibleOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <Calendar className="h-4 w-4" />
          {collapsibleTitle}
          {selectedAssignments.length > 0 && (
            <span className="ml-2 text-green-600 dark:text-green-400 text-xs">
              ✓ {selectedAssignments.length} selected
            </span>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="text-xs text-muted-foreground mb-2">
            {mode === 'admin'
              ? 'Select an assignment to submit this post on behalf of a client'
              : 'Select assignments for this post'}
          </div>
          {content}
          {mode === 'client' && assignments.length > 0 && (
            <div className="text-xs text-muted-foreground mt-2 italic">
              Showing the next few upcoming assignments. To see all your active assignments, open My Posts.
            </div>
          )}
          {onClearSelection && selectedAssignments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="mt-2 text-xs"
            >
              Clear Selection
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <>
      {content}
      {onClearSelection && selectedAssignments.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="mt-2 text-xs"
        >
          Clear Selection
        </Button>
      )}
    </>
  );
}
