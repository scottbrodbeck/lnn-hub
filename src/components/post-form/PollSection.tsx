import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from './CollapsibleSection';

interface PollSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  question: string;
  options: string[];
  onQuestionChange: (question: string) => void;
  onOptionsChange: (options: string[]) => void;
  onRemovePoll: () => void;
  isDeletingPoll?: boolean;
}

export function PollSection({
  isOpen,
  onOpenChange,
  question,
  options,
  onQuestionChange,
  onOptionsChange,
  onRemovePoll,
  isDeletingPoll = false,
}: PollSectionProps) {
  const hasPoll = question && options.filter(o => o.trim()).length >= 2;
  
  return (
    <CollapsibleSection
      icon={ListChecks}
      title="Poll"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={!!hasPoll}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add a poll for reader engagement
        </p>
        
        <div>
          <Label htmlFor="poll-question" className="text-sm font-medium text-foreground">
            Poll Question
          </Label>
          <Input
            id="poll-question"
            value={question}
            onChange={(e) => onQuestionChange(e.target.value)}
            placeholder="Enter your poll question..."
            className="mt-1.5"
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground mb-2 block">
            Answer Options
          </Label>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                </div>
                <Input
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...options];
                    newOptions[index] = e.target.value;
                    onOptionsChange(newOptions);
                  }}
                  placeholder={`Option ${index + 1}`}
                  className="flex-1"
                />
                {options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newOptions = options.filter((_, i) => i !== index);
                      onOptionsChange(newOptions);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex gap-2 mt-3">
            {options.length < 4 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOptionsChange([...options, ''])}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Option
              </Button>
            )}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemovePoll}
              disabled={isDeletingPoll}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeletingPoll ? 'Removing...' : 'Remove Poll'}
            </Button>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
