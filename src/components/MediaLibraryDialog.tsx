import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMediaLibrary } from '@/hooks/useMediaLibrary';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, FolderOpen, Search, Check, X, Edit2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { deleteMediaLibraryItem, updateMediaLibraryCaption } from '@/lib/mediaLibraryApi';

interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string | string[]) => void;
  type: 'media' | 'logo';
  allowMultiple?: boolean;
}

export const MediaLibraryDialog = ({
  open,
  onClose,
  onSelectImage,
  type,
  allowMultiple = false
}: MediaLibraryDialogProps) => {
  const { activeOrganizationId, role } = useAuth();
  const isClient = role === 'client';
  const { images, isLoading, isLoadingMore, hasMore, error, refetch, loadMore } = useMediaLibrary(type, {
    activeOrganizationId: isClient ? activeOrganizationId : null,
    requireOrganization: isClient,
  });
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [deleteImageUrl, setDeleteImageUrl] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionValue, setCaptionValue] = useState('');

  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images;

    const query = searchQuery.toLowerCase();
    return images.filter(item => {
      if (item.caption && item.caption.toLowerCase().includes(query)) {
        return true;
      }

      try {
        const dateStr = format(new Date(item.date), 'MMM d, yyyy').toLowerCase();
        const fullDateStr = format(new Date(item.date), 'MMMM d, yyyy').toLowerCase();
        if (dateStr.includes(query) || fullDateStr.includes(query)) {
          return true;
        }
      } catch {
        return false;
      }

      return false;
    });
  }, [images, searchQuery]);

  const imageToDelete = deleteImageUrl ? images.find((item) => item.url === deleteImageUrl) : null;

  const toggleSelection = (imageUrl: string) => {
    if (!allowMultiple) {
      onSelectImage(imageUrl);
      onClose();
      return;
    }

    setSelectedUrls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageUrl)) {
        newSet.delete(imageUrl);
      } else {
        newSet.add(imageUrl);
      }
      return newSet;
    });
  };

  const handleAddSelected = () => {
    if (selectedUrls.size > 0) {
      onSelectImage(Array.from(selectedUrls));
      setSelectedUrls(new Set());
      onClose();
    }
  };

  const handleClearSelection = () => {
    setSelectedUrls(new Set());
  };

  const handleCancel = () => {
    setSelectedUrls(new Set());
    onClose();
  };

  const handleDeleteImage = async () => {
    if (!imageToDelete) return;

    try {
      await deleteMediaLibraryItem({
        recordId: imageToDelete.recordId,
        imageUrl: imageToDelete.url,
        organizationId: isClient ? activeOrganizationId : null,
      });

      toast({
        title: 'Image deleted',
        description: 'The image has been permanently removed.',
      });

      await refetch();
      setDeleteImageUrl(null);
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete image. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const startEditCaption = (imageUrl: string, currentCaption?: string) => {
    setEditingCaption(imageUrl);
    setCaptionValue(currentCaption || '');
  };

  const saveCaption = async (imageUrl: string) => {
    const targetImage = images.find((item) => item.url === imageUrl);

    try {
      await updateMediaLibraryCaption({
        recordId: targetImage?.recordId,
        imageUrl,
        caption: captionValue || null,
        organizationId: isClient ? activeOrganizationId : null,
      });

      toast({
        title: 'Caption saved',
        description: 'Image caption has been updated.',
      });

      await refetch();
      setEditingCaption(null);
    } catch (error) {
      console.error('Error saving caption:', error);
      toast({
        title: 'Error',
        description: 'Failed to save caption. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const cancelEditCaption = () => {
    setEditingCaption(null);
    setCaptionValue('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {type === 'media' ? '📁 Media Library' : '📁 Logo Gallery'}
          </DialogTitle>
          <DialogDescription>
            {allowMultiple
              ? `Select multiple images from your uploaded library (${selectedUrls.size} selected)`
              : 'Select an image from your uploaded library'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search by ${type === 'media' ? 'caption or ' : ''}date...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-destructive">
              Failed to load images. Please try again.
            </div>
          )}

          {!isLoading && !error && images.length === 0 && (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No images available yet. Upload an image first to build your {type === 'media' ? 'library' : 'gallery'}.
              </p>
            </div>
          )}

          {!isLoading && !error && images.length > 0 && filteredImages.length === 0 && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No images match your search. Try different keywords.
              </p>
            </div>
          )}

          {!isLoading && !error && filteredImages.length > 0 && (
            <>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                {filteredImages.map((item, index) => {
                  const isSelected = selectedUrls.has(item.url);
                  const isEditingThisCaption = editingCaption === item.url;
                  return (
                    <div key={item.recordId || `${item.url}-${index}`} className="relative group">
                      <button
                        onClick={() => toggleSelection(item.url)}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-muted cursor-pointer w-full ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary ring-offset-2'
                            : 'border-border hover:border-primary'
                        }`}
                      >
                        <img
                          src={item.thumbnailUrl || item.url}
                          alt={item.caption || `${type} ${index + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {allowMultiple && isSelected && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteImageUrl(item.url);
                        }}
                        className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                        title="Delete image"
                      >
                        <X className="h-4 w-4" />
                      </button>

                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditingThisCaption ? (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={captionValue}
                              onChange={(e) => setCaptionValue(e.target.value)}
                              placeholder="Add caption..."
                              className="h-6 text-xs bg-background/20 border-white/30 text-white"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveCaption(item.url)}
                              className="h-6 w-6 p-0 hover:bg-white/20"
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditCaption}
                              className="h-6 w-6 p-0 hover:bg-white/20"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="truncate flex-1">{item.caption || 'No caption'}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditCaption(item.url, item.caption);
                                }}
                                className="hover:text-primary transition-colors"
                                title="Edit caption"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-white/70">
                              {format(new Date(item.date), 'MMM d, yyyy')}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          {allowMultiple && selectedUrls.size > 0 && (
            <>
              <Button variant="outline" onClick={handleClearSelection}>
                Clear Selection
              </Button>
              <Button onClick={handleAddSelected}>
                Add Selected ({selectedUrls.size})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!deleteImageUrl} onOpenChange={() => setDeleteImageUrl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this image? This action cannot be undone.
              The image will be removed from storage, the database, and all WordPress media mappings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteImage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};