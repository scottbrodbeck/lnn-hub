import { useCallback, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Search, Upload, X } from 'lucide-react';
import { useMediaLibrary, type MediaItem } from '@/hooks/useMediaLibrary';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { updateMediaLibraryCaption } from '@/lib/mediaLibraryApi';

export interface InlineImageSelection {
  url: string;
  caption?: string;
  recordId?: string;
  sourceUrl?: string | null;
  wpMediaId?: number | null;
  wpUrl?: string | null;
}

interface InlineImagePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectImage: (image: InlineImageSelection) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const READY_TIMEOUT_MS = 60000;
const READY_POLL_INTERVAL_MS = 1000;

type InlineImageTab = 'gallery' | 'upload';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const InlineImagePickerDialog = ({ open, onClose, onSelectImage }: InlineImagePickerDialogProps) => {
  const { activeOrganizationId, role } = useAuth();
  const isClient = role === 'client';
  const { images, isLoading, isLoadingMore, hasMore, error, refetch, loadMore } = useMediaLibrary('media', {
    activeOrganizationId: isClient ? activeOrganizationId : null,
    requireOrganization: isClient,
  });
  const { uploadImage, getProcessedUrl } = useImageProcessing();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<InlineImageTab>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images;

    const query = searchQuery.toLowerCase();
    return images.filter((item) => {
      if (item.caption && item.caption.toLowerCase().includes(query)) return true;

      try {
        const dateStr = format(new Date(item.date), 'MMM d, yyyy').toLowerCase();
        const fullDateStr = format(new Date(item.date), 'MMMM d, yyyy').toLowerCase();
        return dateStr.includes(query) || fullDateStr.includes(query);
      } catch {
        return false;
      }
    });
  }, [images, searchQuery]);

  const resetUploadState = () => {
    setSelectedFile(null);
    setCaption('');
    setIsUploading(false);
    setDragActive(false);
  };

  const handleDialogClose = () => {
    if (isUploading) return;
    setSearchQuery('');
    setActiveTab('gallery');
    resetUploadState();
    onClose();
  };

  const handleSelectLibraryImage = (item: MediaItem) => {
    const sourceUrl = item.url;

    onSelectImage({
      url: item.wpUrl || sourceUrl,
      caption: item.caption,
      recordId: item.recordId,
      sourceUrl,
      wpMediaId: item.wpMediaId ?? null,
      wpUrl: item.wpUrl ?? null,
    });
    handleDialogClose();
  };

  const waitUntilImageReady = async (recordId: string, fallbackUrl: string) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < READY_TIMEOUT_MS) {
      const { url, status } = await getProcessedUrl(recordId);
      if (status === 'ready') return url || fallbackUrl;
      await wait(READY_POLL_INTERVAL_MS);
    }

    throw new Error('Image processing timed out');
  };

  const handleFilePicked = useCallback((file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploading) return;
    setDragActive(false);
    handleFilePicked(event.dataTransfer.files?.[0] ?? null);
  }, [handleFilePicked, isUploading]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isUploading) return;
    setDragActive(true);
  }, [isUploading]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);

    try {
      const normalizedCaption = caption.trim() || undefined;
      const { tempUrl, recordId } = await uploadImage(selectedFile);

      if (normalizedCaption) {
        try {
          await updateMediaLibraryCaption({
            recordId,
            caption: normalizedCaption,
            organizationId: isClient ? activeOrganizationId : null,
          });
        } catch (captionError) {
          console.error('Failed to save caption during upload:', captionError);
        }
      }

      const finalUrl = await waitUntilImageReady(recordId, tempUrl);
      await refetch();

      onSelectImage({
        url: finalUrl,
        caption: normalizedCaption,
        recordId,
        sourceUrl: finalUrl,
        wpMediaId: null,
        wpUrl: null,
      });

      toast.success('Image uploaded and ready');
      handleDialogClose();
    } catch (uploadError) {
      console.error('Inline image upload failed:', uploadError);
      toast.error('Image processing is taking too long. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleDialogClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Inline Image</DialogTitle>
          <DialogDescription>Choose from your uploaded image library first, or upload a new image in its own tab.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as InlineImageTab)} className="space-y-4 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="gallery">Photo Gallery</TabsTrigger>
            <TabsTrigger value="upload">Upload New</TabsTrigger>
          </TabsList>

          <TabsContent value="gallery" className="space-y-4 mt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by caption or date..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1">
              {isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              )}

              {!isLoading && error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Failed to load media library.
                </div>
              )}

              {!isLoading && !error && filteredImages.length === 0 && (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
                  No matching images found.
                </div>
              )}

              {!isLoading && !error && filteredImages.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {filteredImages.map((item) => (
                      <button
                        key={item.recordId || `${item.url}-${item.date}`}
                        type="button"
                        onClick={() => handleSelectLibraryImage(item)}
                        className="group overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary"
                      >
                        <div className="aspect-square bg-muted">
                          <img
                            src={item.thumbnailUrl || item.url}
                            alt={item.caption || 'Media library image'}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="space-y-1 px-2 py-2">
                          <p className="truncate text-xs text-foreground">{item.caption || 'No caption'}</p>
                          <p className="text-[11px] text-muted-foreground">{format(new Date(item.date), 'MMM d, yyyy')}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {hasMore && (
                    <div className="mt-4 flex justify-center">
                      <Button type="button" variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading more...
                          </>
                        ) : (
                          'View More'
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-0">
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <Label htmlFor="inline-upload-file">Upload new image</Label>
              <div
                className={cn(
                  'cursor-pointer rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors',
                  dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60',
                  isUploading && 'pointer-events-none opacity-60'
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (isUploading) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Waiting until image is ready...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-6 w-6" />
                    <p className="text-sm">Drag & drop an image here, or click to choose a file</p>
                    <p className="text-xs">PNG, JPG, WEBP or GIF (max 10MB)</p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                id="inline-upload-file"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(event) => {
                  handleFilePicked(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />

              {selectedFile && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedFile(null);
                      }}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="inline-upload-caption">Caption</Label>
                <Input
                  id="inline-upload-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Optional caption"
                  disabled={isUploading}
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Waiting until image is ready...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload and insert
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleDialogClose} disabled={isUploading}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
