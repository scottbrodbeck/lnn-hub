import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Textarea } from './ui/textarea';
import { Upload, X, Star, Pencil, FolderOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateMediaLibraryCaption, lookupMediaLibraryItemsByUrls } from '@/lib/mediaLibraryApi';
import { Dialog, DialogContent } from './ui/dialog';
import { MediaLibraryDialog } from './MediaLibraryDialog';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { useAuth } from '@/contexts/AuthContext';

interface ImageUploadProps {
  onImagesChange: (images: ProcessedImage[]) => void;
  disabled?: boolean;
  initialImages?: ProcessedImage[];
}

export interface ProcessedImage {
  id: string;
  originalUrl: string;
  processedUrl: string;
  thumbnailUrl?: string;
  isFeatured: boolean;
  caption?: string;
  recordId?: string;
}

export const ImageUpload = ({ onImagesChange, disabled, initialImages = [] }: ImageUploadProps) => {
  const { activeOrganizationId, role } = useAuth();
  const isClient = role === 'client';
  const [images, setImages] = useState<ProcessedImage[]>(initialImages);

  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState('');
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  const { uploadImage, isImageProcessing, isAnyProcessing, getProcessedUrl, getThumbnailUrl } = useImageProcessing();

  // Update image URLs when processing completes
  useEffect(() => {
    const updateProcessedUrls = async () => {
      if (isAnyProcessing) return;

      // Check if any images have recordIds and might need URL updates
      const imagesWithRecords = images.filter(img => img.recordId);
      if (imagesWithRecords.length === 0) return;

      let hasChanges = false;
      const updatedImages = await Promise.all(
        images.map(async (img) => {
          if (!img.recordId) return img;
          
          try {
            const [processedResult, thumbnailUrl] = await Promise.all([
              getProcessedUrl(img.recordId),
              getThumbnailUrl(img.recordId)
            ]);
            const newUrl = processedResult.url;
            if (newUrl !== img.processedUrl || thumbnailUrl !== img.thumbnailUrl) {
              hasChanges = true;
              return { 
                ...img, 
                processedUrl: newUrl, 
                originalUrl: newUrl,
                thumbnailUrl: thumbnailUrl || undefined
              };
            }
          } catch {
            // Keep existing URL on error
          }
          return img;
        })
      );

      if (hasChanges) {
        setImages(updatedImages);
        onImagesChange(updatedImages);
      }
    };

    updateProcessedUrls();
  }, [isAnyProcessing]);

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    try {
      const newImages: ProcessedImage[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image file`);
          continue;
        }

        // Check file size - warn but don't block
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 20MB)`);
          continue;
        }

        const isFeatured = images.length === 0 && i === 0;
        
        // Upload directly to storage
        const { id, tempUrl, recordId } = await uploadImage(file);
        
        newImages.push({
          id,
          originalUrl: tempUrl,
          processedUrl: tempUrl,
          isFeatured,
          caption: undefined,
          recordId
        });
      }

      const updatedImages = [...images, ...newImages];
      setImages(updatedImages);
      onImagesChange(updatedImages);
      toast.success(`${newImages.length} image(s) uploaded`);
    } catch (error) {
      toast.error('Failed to upload images');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleFiles(files);
  };

  const removeImage = (index: number) => {
    const updatedImages = images.filter((_, i) => i !== index);
    if (updatedImages.length > 0 && images[index].isFeatured) {
      updatedImages[0].isFeatured = true;
    }
    setImages(updatedImages);
    onImagesChange(updatedImages);
  };

  const setFeaturedImage = (index: number) => {
    const updatedImages = images.map((img, i) => ({
      ...img,
      isFeatured: i === index
    }));
    setImages(updatedImages);
    onImagesChange(updatedImages);
  };

  const handleImageClick = (imageUrl: string) => {
    setLightboxImage(imageUrl);
  };

  const startCaptionEdit = (imageId: string, currentCaption: string) => {
    setEditingCaptionId(imageId);
    setCaptionText(currentCaption);
  };

  const saveCaption = async (index: number) => {
    const image = images[index];
    const newCaption = captionText.trim() || undefined;
    
    // Update local state immediately
    const updatedImages = [...images];
    updatedImages[index].caption = newCaption;
    setImages(updatedImages);
    onImagesChange(updatedImages);
    setEditingCaptionId(null);
    setCaptionText('');
    
    // Persist caption to image_uploads table via backend
    const imageUrl = image.processedUrl || image.originalUrl;
    if (imageUrl) {
      try {
        await updateMediaLibraryCaption({
          recordId: image.recordId,
          imageUrl,
          caption: newCaption || null,
          organizationId: isClient ? activeOrganizationId : null,
        });
      } catch (err) {
        console.error('Failed to persist caption:', err);
      }
    }
    
    toast.success('Caption saved');
  };

  const cancelCaptionEdit = () => {
    setEditingCaptionId(null);
    setCaptionText('');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };

  const handleLibrarySelect = async (imageUrl: string | string[]) => {
    const urls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
    
    const records = await lookupMediaLibraryItemsByUrls({
      urls,
      organizationId: isClient ? activeOrganizationId : null,
    });

    const imageDataMap = new Map<string, { caption?: string; recordId: string; thumbnailUrl?: string }>();
    records.forEach(upload => {
      imageDataMap.set(upload.public_url, { 
        caption: upload.caption || undefined, 
        recordId: upload.id,
        thumbnailUrl: upload.thumbnail_url || undefined
      });
    });

    const newImages: ProcessedImage[] = urls.map((url, index) => {
      const info = imageDataMap.get(url);
      return {
        id: crypto.randomUUID(),
        originalUrl: url,
        processedUrl: url,
        thumbnailUrl: info?.thumbnailUrl,
        isFeatured: images.length === 0 && index === 0,
        caption: info?.caption,
        recordId: info?.recordId
      };
    });
    
    const updatedImages = [...images, ...newImages];
    setImages(updatedImages);
    onImagesChange(updatedImages);
    
    toast.success(urls.length === 1 ? 'Image added from library' : `${urls.length} images added from library`);
  };

  const isDisabled = disabled || uploading || isAnyProcessing;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Featured Image & Gallery <span className="text-destructive">*</span></h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a featured image for social media and search engines, or multiple images for a gallery.
            Mark an image as featured by clicking its star icon, and add optional captions to both featured and gallery images.
          </p>
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          } ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onDragEnter={!isDisabled ? handleDragIn : undefined}
          onDragLeave={!isDisabled ? handleDragOut : undefined}
          onDragOver={!isDisabled ? handleDrag : undefined}
          onDrop={!isDisabled ? handleDrop : undefined}
          onClick={() => !isDisabled && document.getElementById('image-upload')?.click()}
        >
          <input
            type="file"
            id="image-upload"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isDisabled}
          />
          {uploading ? (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-muted-foreground mb-4 animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Click or drag to upload images
              </p>
            </>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            setMediaLibraryOpen(true);
          }}
          className="w-full"
          disabled={isDisabled}
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          Select from Media Library
        </Button>

        {isAnyProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Optimizing images in background...</span>
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {images.map((image, index) => {
              const isProcessing = isImageProcessing(image.id);
              
              return (
                <div key={image.id} className="relative group">
                  <div 
                    className={`aspect-square rounded-lg overflow-hidden border-2 border-border bg-muted ${
                      isProcessing ? 'cursor-wait' : 'cursor-zoom-in'
                    }`}
                    onClick={() => !isProcessing && handleImageClick(image.originalUrl)}
                  >
                    <img
                      src={image.thumbnailUrl || image.processedUrl || image.originalUrl}
                      alt={`Upload ${index + 1}`}
                      className={`w-full h-full object-cover ${isProcessing ? 'opacity-50' : ''}`}
                      loading="lazy"
                    />
                    {isProcessing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`absolute top-2 left-2 transition-opacity ${
                      image.isFeatured 
                        ? 'opacity-100' 
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeaturedImage(index);
                    }}
                    disabled={isProcessing}
                  >
                    <Star 
                      className={`h-5 w-5 ${
                        image.isFeatured 
                          ? 'fill-yellow-400 text-yellow-400' 
                          : 'text-muted-foreground'
                      }`}
                    />
                  </Button>
                  {image.isFeatured && (
                    <div className="absolute top-2 left-[44px] bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                      Featured
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    disabled={isProcessing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  
                  <div className="mt-2 space-y-1">
                    {editingCaptionId === image.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={captionText}
                          onChange={(e) => setCaptionText(e.target.value)}
                          placeholder="Add a caption..."
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => saveCaption(index)}
                          >
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={cancelCaptionEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <p className="text-xs text-muted-foreground flex-1">
                          {image.caption || 'No caption'}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => startCaptionEdit(image.id, image.caption || '')}
                          className="h-6 w-6 p-0"
                          disabled={isProcessing}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
          <DialogContent className="max-w-4xl p-0 border-0 bg-transparent">
            <div className="relative w-full h-full flex items-center justify-center">
              {lightboxImage && (
                <img
                  src={lightboxImage}
                  alt="Preview"
                  className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <MediaLibraryDialog
          open={mediaLibraryOpen}
          onClose={() => setMediaLibraryOpen(false)}
          onSelectImage={handleLibrarySelect}
          type="media"
          allowMultiple={true}
        />
      </div>
    </Card>
  );
};
