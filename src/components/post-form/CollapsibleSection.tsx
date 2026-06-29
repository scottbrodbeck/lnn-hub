import { LucideIcon, Plus, Minus } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ReactNode } from 'react';

interface CollapsibleSectionProps {
  icon: LucideIcon;
  title: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isComplete?: boolean;
  completeText?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  icon: Icon,
  title,
  isOpen,
  onOpenChange,
  isComplete = false,
  completeText = 'Added ✓',
  children,
}: CollapsibleSectionProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <Minus className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Plus className="h-4 w-4 text-muted-foreground" />
            )}
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{title}</span>
          </div>
          {isComplete && (
            <span className="text-sm text-green-600 dark:text-green-500 flex items-center gap-1">
              {completeText}
            </span>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="bg-muted/30 border border-border rounded-lg p-4 shadow-sm">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
