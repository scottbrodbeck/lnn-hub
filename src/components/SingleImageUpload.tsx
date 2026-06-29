import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { MediaLibraryDialog } from '@/components/MediaLibraryDialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface SingleImageUploadProps {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  label?: string;
  description?: string;
  aspectRatio?: 'square' | 'banner' | 'auto' | 'sponsorship';
  className?: string;
  size?: 'default' | 'compact';
}

export function SingleImageUpload({
  imageUrl,
  onImageChange,
  label,
  description,
  aspectRatio = 'auto',
  className,
  size = 'default',
}: SingleImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, getProcessedUrl } = useImageProcessing();

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file type. Please upload an image file (JPG, PNG, GIF, or WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large. Maximum size is 10MB.');
      return;
    }

    setUploading(true);
    try {
      const { recordId } = await uploadImage(file);
      
      // Poll for processed URL
      let attempts = 0;
      const maxAttempts = 30;
      
      const pollForUrl = async (): Promise<string> => {
        try {
          const { url, status } = await getProcessedUrl(recordId);
          if (status === 'ready' && url) {
            return url;
          }
        } catch (pollErr) {
          console.warn('Poll attempt failed, retrying...', pollErr);
        }
        if (attempts >= maxAttempts) {
          const fallback = await getProcessedUrl(recordId).catch(() => null);
          return fallback?.url || '';
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        return pollForUrl();
      };
      
      const finalUrl = await pollForUrl();
      if (finalUrl) {
        onImageChange(finalUrl);
      } else {
        toast.error('Image processing timed out. Please try uploading again.');
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      const message = error instanceof Error ? error.message : 'Upload failed';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [uploadImage, getProcessedUrl, onImageChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [handleFileSelect]);

  const handleLibrarySelect = useCallback((url: string) => {
    onImageChange(url);
    setMediaLibraryOpen(false);
  }, [onImageChange]);

  const handleRemove = useCallback(() => {
    onImageChange(null);
  }, [onImageChange]);

  const isCompact = size === 'compact';

  const aspectRatioClass = {
    square: 'aspect-square',
    banner: 'aspect-[3/1]',
    sponsorship: 'aspect-[4/1]',
    auto: isCompact ? 'aspect-square' : 'min-h-[120px]',
  }[aspectRatio];

  return (
    <div className={cn("space-y-2", isCompact && "max-w-[120px]", className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {imageUrl ? (
        <div className={cn("relative group", aspectRatioClass)}>
          <img
            src={imageUrl}
            alt="Preview"
            className={cn(
              "rounded-md border object-cover w-full h-full",
              !isCompact && "object-contain max-h-[500px]"
            )}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className={cn(
              "absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity",
              isCompact && "h-6 w-6 [&_svg]:size-3"
            )}
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "border-2 border-dashed rounded-md text-center transition-colors cursor-pointer",
            aspectRatioClass,
            isCompact ? "p-2 flex items-center justify-center" : "p-6",
            dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
            uploading && "pointer-events-none opacity-50"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className={cn("flex flex-col items-center gap-1", !isCompact && "py-4 gap-2")}>
              <Loader2 className={cn("animate-spin text-muted-foreground", isCompact ? "h-5 w-5" : "h-8 w-8")} />
              {!isCompact && <span className="text-sm text-muted-foreground">Uploading...</span>}
            </div>
          ) : (
            <div className={cn("flex flex-col items-center gap-1", !isCompact && "py-4 gap-2")}>
              <Upload className={cn("text-muted-foreground", isCompact ? "h-5 w-5" : "h-8 w-8")} />
              {!isCompact && (
                <span className="text-sm text-muted-foreground">
                  Drag & drop or click to upload
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!imageUrl && !uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMediaLibraryOpen(true)}
          className="w-full"
        >
          <ImageIcon className="h-4 w-4 mr-2" />
          Choose from Media Library
        </Button>
      )}

      <MediaLibraryDialog
        open={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
        onSelectImage={handleLibrarySelect}
        type="media"
      />
    </div>
  );
}
