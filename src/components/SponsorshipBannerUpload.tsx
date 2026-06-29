import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Crop as CropIcon, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BannerCropDialog } from '@/components/BannerCropDialog';

interface SponsorshipBannerUploadProps {
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SponsorshipBannerUpload({ imageUrl, onImageChange, className }: SponsorshipBannerUploadProps) {
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Unsupported file type. Please upload an image (JPG, PNG, GIF, or WebP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large. Maximum size is 10MB.');
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setRawDataUrl(reader.result as string);
      setCropOpen(true);
      setReading(false);
    };
    reader.onerror = () => {
      toast.error('Could not read that image. Please try another file.');
      setReading(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleCropComplete = useCallback((url: string, sizeBytes: number) => {
    onImageChange(url);
    setProcessedSize(sizeBytes);
    setCropOpen(false);
  }, [onImageChange]);

  const handleRemove = useCallback(() => {
    onImageChange(null);
    setProcessedSize(null);
    setRawDataUrl(null);
  }, [onImageChange]);

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {imageUrl ? (
        <div className="space-y-2">
          <div className="relative group aspect-[4/1] w-full">
            <img
              src={imageUrl}
              alt="Banner preview (840×210)"
              className="rounded-md border object-cover w-full h-full"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Saved at 840 × 210{processedSize ? ` · ${formatBytes(processedSize)}` : ''}
            </p>
            <div className="flex gap-2">
              {rawDataUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCropOpen(true)}>
                  <CropIcon className="h-3.5 w-3.5 mr-1" />
                  Adjust crop
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Replace image
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-md text-center transition-colors cursor-pointer aspect-[4/1] flex items-center justify-center',
            dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
            reading && 'pointer-events-none opacity-50',
          )}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onClick={() => !reading && fileInputRef.current?.click()}
        >
          {reading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-7 w-7 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Drag &amp; drop or click to upload — you'll crop it to 840 × 210 next
              </span>
            </div>
          )}
        </div>
      )}

      <BannerCropDialog
        open={cropOpen}
        imageDataUrl={rawDataUrl}
        onCropComplete={handleCropComplete}
        onCancel={() => setCropOpen(false)}
      />
    </div>
  );
}
