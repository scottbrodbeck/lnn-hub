import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ImageManagementDialogProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string;
  onSave: (caption: string) => void;
  onRemove: () => void;
  onReplace: () => void;
}

export const ImageManagementDialog = ({
  open,
  onClose,
  imageUrl,
  caption = '',
  onSave,
  onRemove,
  onReplace,
}: ImageManagementDialogProps) => {
  const [draftCaption, setDraftCaption] = useState(caption);

  useEffect(() => {
    if (open) {
      setDraftCaption(caption);
    }
  }, [caption, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>
            Update the caption, replace the image, or remove it from the article.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <img
            src={imageUrl}
            alt="Selected image"
            className="max-h-[18rem] w-full rounded-lg object-contain shadow-sm"
          />

          <div className="space-y-2">
            <Label htmlFor="edit-inline-image-caption">Caption</Label>
            <Input
              id="edit-inline-image-caption"
              value={draftCaption}
              onChange={(event) => setDraftCaption(event.target.value)}
              placeholder="Add a caption for this image"
            />
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={onClose} className="w-full">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onRemove} className="w-full">
            Remove Image
          </Button>
          <Button variant="outline" onClick={onReplace} className="w-full">
            Replace Image
          </Button>
          <Button onClick={() => onSave(draftCaption)} className="w-full">
            Save Caption
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
