import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFilename } from '@/lib/fileUtils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface UploadedImageData {
  url: string;
  caption?: string;
  recordId?: string;
}

interface ImageUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onImageUploaded: (image: UploadedImageData) => void;
}

export const ImageUploadDialog = ({ open, onClose, onImageUploaded }: ImageUploadDialogProps) => {
  const { activeOrganizationId, role } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const resetState = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setDragActive(false);
  };

  const handleClose = () => {
    if (isUploading) return;
    resetState();
    onClose();
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return false;
    }
    return true;
  };

  const setFile = (file: File) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = Array.from(e.dataTransfer.files).find((candidate) => candidate.type.startsWith('image/'));
    if (file && validateFile(file)) {
      setFile(file);
    }
  }, [previewUrl]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setFile(file);
    }
  };

  const removeFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile);
      });

      const base64Data = await base64Promise;
      const normalizedCaption = caption.trim();

      const { data, error } = await supabase.functions.invoke('process-and-store-image', {
        body: {
          imageData: base64Data,
          filename: sanitizeFilename(selectedFile.name),
          caption: normalizedCaption || undefined,
          organizationId: role === 'client' ? activeOrganizationId : null,
        },
      });

      if (error) throw error;

      if (data?.url) {
        onImageUploaded({
          url: data.url,
          caption: normalizedCaption || undefined,
          recordId: data.recordId,
        });
        toast.success('Image uploaded successfully');
      }

      resetState();
      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-sm font-medium">Click to upload or drag and drop</p>
            <p className="mb-4 text-xs text-muted-foreground">PNG, JPG, WEBP or GIF (Maximum 10MB)</p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label htmlFor="file-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>Select Files</span>
              </Button>
            </label>
          </div>

          {selectedFile && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-secondary p-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {previewUrl && (
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="h-10 w-10 rounded object-cover"
                    />
                  )}
                  <span className="truncate text-sm">{selectedFile.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inline-image-caption">Caption</Label>
                <Input
                  id="inline-image-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption for this inline image"
                  disabled={isUploading}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
