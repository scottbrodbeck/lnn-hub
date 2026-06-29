import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface LogoCropDialogProps {
  open: boolean;
  imageUrl: string | null;
  onCropComplete: (croppedUrl: string) => void;
  onCancel: () => void;
}

function defaultFullCrop(): Crop {
  return { unit: '%', x: 0, y: 0, width: 100, height: 100 };
}

export function LogoCropDialog({ open, imageUrl, onCropComplete, onCancel }: LogoCropDialogProps) {
  const { activeOrganizationId, role } = useAuth();
  const [crop, setCrop] = useState<Crop>();
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(() => {
    setCrop(defaultFullCrop());
  }, []);

  const getCroppedBlob = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const image = imgRef.current;
      if (!image || !crop) {
        reject(new Error('No image or crop'));
        return;
      }

      const canvas = document.createElement('canvas');
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const pixelCrop = {
        x: (crop.unit === '%' ? (crop.x / 100) * image.width : crop.x) * scaleX,
        y: (crop.unit === '%' ? (crop.y / 100) * image.height : crop.y) * scaleY,
        width: (crop.unit === '%' ? (crop.width / 100) * image.width : crop.width) * scaleX,
        height: (crop.unit === '%' ? (crop.height / 100) * image.height : crop.height) * scaleY,
      };

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height,
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/png',
        1,
      );
    });
  }, [crop]);

  const handleCropAndSave = async () => {
    setUploading(true);
    try {
      const blob = await getCroppedBlob();

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const base64Data = await base64Promise;

      const { data, error } = await supabase.functions.invoke('process-and-store-image', {
        body: {
          imageData: base64Data,
          filename: 'cropped-logo.png',
          organizationId: role === 'client' ? activeOrganizationId : null,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No URL returned from upload');

      onCropComplete(data.url);
      toast.success('Logo cropped and uploaded');
    } catch (error) {
      console.error('Crop upload error:', error);
      toast.error('Failed to crop and upload logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop Logo (Optional)</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center max-h-[60vh] overflow-auto">
          {imageUrl && (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              className="max-w-full"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Crop preview"
                onLoad={onImageLoad}
                className="max-w-full max-h-[55vh]"
                crossOrigin="anonymous"
              />
            </ReactCrop>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleCropAndSave} disabled={uploading || !crop}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading…
              </>
            ) : (
              'Crop & Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
