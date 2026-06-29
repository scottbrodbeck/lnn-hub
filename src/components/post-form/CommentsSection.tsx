import { MessageSquare } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CollapsibleSection } from './CollapsibleSection';

interface CommentsSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  commentsEnabled: boolean;
  onCommentsEnabledChange: (enabled: boolean) => void;
  switchId?: string;
}

export function CommentsSection({
  isOpen,
  onOpenChange,
  commentsEnabled,
  onCommentsEnabledChange,
  switchId = 'enable-comments',
}: CommentsSectionProps) {
  return (
    <CollapsibleSection
      icon={MessageSquare}
      title="Comments"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={commentsEnabled}
      completeText="Enabled ✓"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor={switchId} className="text-sm font-medium text-foreground">
              Enable Comments
            </Label>
            <p className="text-sm text-muted-foreground">
              Allow readers to comment on this article
            </p>
          </div>
          <Switch
            id={switchId}
            checked={commentsEnabled}
            onCheckedChange={onCommentsEnabledChange}
          />
        </div>
        
        {commentsEnabled && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <span className="text-amber-600 dark:text-amber-500 mt-0.5">⚠️</span>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              By enabling comments, you acknowledge that the site's standard comment moderation policy will apply. Comments that do not violate the comment policy will not be removed.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
