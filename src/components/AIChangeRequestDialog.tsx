import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface AIChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentHeadline: string;
  currentContent: string;
  onRefine: (changeRequest: string) => Promise<void>;
}

export const AIChangeRequestDialog = ({
  open,
  onOpenChange,
  currentHeadline,
  currentContent,
  onRefine,
}: AIChangeRequestDialogProps) => {
  const [changeRequest, setChangeRequest] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async () => {
    if (!changeRequest.trim()) return;

    setIsRefining(true);
    try {
      await onRefine(changeRequest);
      setChangeRequest('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error refining:', error);
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Changes</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Current Article</h4>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h5 className="font-semibold">{currentHeadline}</h5>
              <div 
                className="text-sm text-muted-foreground prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: currentContent }}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              What would you like to change?
            </label>
            <Textarea
              value={changeRequest}
              onChange={(e) => setChangeRequest(e.target.value)}
              placeholder="E.g., 'Make the tone more professional', 'Add more details about the product features', 'Shorten to 400 words'..."
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRefining}>
            Cancel
          </Button>
          <Button onClick={handleRefine} disabled={!changeRequest.trim() || isRefining}>
            {isRefining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
