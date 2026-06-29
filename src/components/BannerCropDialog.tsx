import { useState, useRef, useCallback } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Email sponsorship banners are a fixed 840×210 (4:1) newsletter header.
const BANNER_WIDTH = 840;
const BANNER_HEIGHT = 210;
const BANNER_ASPECT = BANNER_WIDTH / BANNER_HEIGHT;

interface BannerCropDialogProps {
  open: boolean;
  /** The raw uploaded image as a data URL (from FileReader). */
  imageDataUrl: string | null;
  onCropComplete: (url: string, sizeBytes: number) => void;
  onCancel: () => void;
}

export function BannerCropDialog({ open, imageDataUrl, onCropComplete, onCancel }: BannerCropDialogProps) {
  const [crop, setCrop] = useState<Crop>();
  const [processing, setProcessing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Center a locked 4:1 crop covering as much of the image as fits.
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    // Seed from the limiting dimension so the locked 4:1 box never overflows
    // the image (wider-than-4:1 → constrain height; taller → constrain width).
    const seed: Pick<PercentCrop, 'unit'> & Partial<Omit<PercentCrop, 'unit'>> =
      naturalWidth / naturalHeight > BANNER_ASPECT
        ? { unit: '%', height: 100 }
        : { unit: '%', width: 100 };
    const initial = centerCrop(
      makeAspectCrop(seed, BANNER_ASPECT, naturalWidth, naturalHeight),
      naturalWidth,
      naturalHeight,
    );
    setCrop(initial);
  }, []);

  // Draw the selected region into an exact 840×210 canvas → JPEG blob.
  const getCroppedBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const image = imgRef.current;
      if (!image || !crop || !crop.width || !crop.height) {
        reject(new Error('No crop selected'));
        return;
      }

      // crop is kept in % units, so map directly onto the natural pixels.
      const sx = (crop.x / 100) * image.naturalWidth;
      const sy = (crop.y / 100) * image.naturalHeight;
      const sw = (crop.width / 100) * image.naturalWidth;
      const sh = (crop.height / 100) * image.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = BANNER_WIDTH;
      canvas.height = BANNER_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        0.9,
      );
    });
  }, [crop]);

  const handleApply = async () => {
    setProcessing(true);
    try {
      const blob = await getCroppedBlob();

      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Reuse the display-ad image pipeline: it resizes to the exact target
      // dimensions and optimizes file size via Cloudinary, then returns a URL.
      const { data, error } = await supabase.functions.invoke('upload-display-ad-image', {
        body: {
          imageData: base64Data,
          filename: 'sponsorship-banner.jpg',
          width: BANNER_WIDTH,
          height: BANNER_HEIGHT,
          actualWidth: BANNER_WIDTH,
          actualHeight: BANNER_HEIGHT,
          fileSize: blob.size,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error(data?.error || 'No URL returned from processing');

      // Fetch the processed file to report an accurate optimized size.
      let processedSize = blob.size;
      try {
        const res = await fetch(data.url);
        const processedBlob = await res.blob();
        processedSize = processedBlob.size;
      } catch {
        // Non-fatal — fall back to the pre-optimization size.
      }

      onCropComplete(data.url, processedSize);
    } catch (err) {
      console.error('Banner crop/process error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to process banner');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !processing && onCancel()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop banner to 840 × 210</DialogTitle>
          <DialogDescription>
            Drag and resize the box to choose the part of your image to use. It will be saved at
            exactly 840 × 210 pixels and optimized automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center max-h-[60vh] overflow-auto bg-muted/30 rounded-md p-2">
          {imageDataUrl && (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop: PercentCrop) => setCrop(percentCrop)}
              aspect={BANNER_ASPECT}
              keepSelection
              className="max-w-full"
            >
              <img
                ref={imgRef}
                src={imageDataUrl}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-w-full max-h-[55vh]"
              />
            </ReactCrop>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={processing || !crop?.width}>
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing…
              </>
            ) : (
              'Apply crop'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
