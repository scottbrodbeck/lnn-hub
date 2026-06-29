import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Upload, X, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFilename } from '@/lib/fileUtils';
import { useAuth } from '@/contexts/AuthContext';
import { MediaLibraryDialog } from './MediaLibraryDialog';
import { LogoCropDialog } from './LogoCropDialog';
import { UrlInput } from './ui/url-input';

interface LogoUploadProps {
  onLogoChange: (logoUrl: string | null) => void;
  logoUrl: string | null;
  logoLinkUrl?: string | null;
  onLogoLinkChange?: (linkUrl: string | null) => void;
  variant?: 'card' | 'inline';
}

export const LogoUpload = ({
  onLogoChange,
  logoUrl,
  logoLinkUrl,
  onLogoLinkChange,
  variant = 'card'
}: LogoUploadProps) => {
  const { activeOrganizationId, role } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [logoGalleryOpen, setLogoGalleryOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);

  const uploadRawImage = async (file: File): Promise<string> => {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64Data = await base64Promise;

    const { data, error } = await supabase.functions.invoke('process-and-store-image', {
      body: {
        imageData: base64Data,
        filename: sanitizeFilename(file.name),
        organizationId: role === 'client' ? activeOrganizationId : null,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('No URL returned from upload');
    return data.url;
  };

  const openCropDialog = (url: string) => {
    setCropImageUrl(url);
    setCropDialogOpen(true);
  };

  const handleCropComplete = (croppedUrl: string) => {
    setCropDialogOpen(false);
    setCropImageUrl(null);
    onLogoChange(croppedUrl);
  };

  const handleCropCancel = () => {
    setCropDialogOpen(false);
    setCropImageUrl(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setIsProcessing(true);
    try {
      const rawUrl = await uploadRawImage(file);
      openCropDialog(rawUrl);
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = () => {
    onLogoChange(null);
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setIsProcessing(true);
      try {
        const rawUrl = await uploadRawImage(file);
        openCropDialog(rawUrl);
      } catch (error) {
        console.error('Logo upload error:', error);
        toast.error('Failed to upload logo');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleGallerySelect = (imageUrl: string | string[]) => {
    const url = Array.isArray(imageUrl) ? imageUrl[0] : imageUrl;
    openCropDialog(url);
  };

  const content = (
    <div className="space-y-3">
      {!logoUrl ? (
        <>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" id="logo-upload" disabled={isProcessing} />
            <label htmlFor="logo-upload" className="cursor-pointer">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                {isProcessing ? 'Processing logo...' : 'Click or drag to upload logo'}
              </p>
            </label>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              setLogoGalleryOpen(true);
            }}
            className="w-full"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Select from Logo Gallery
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="inline-block relative group">
            <img src={logoUrl} alt="Logo" className="h-20 w-auto max-w-full object-contain rounded-lg border border-border bg-muted/30 p-1" />
            <Button variant="destructive" size="icon" className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={handleRemove}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {onLogoLinkChange && (
            <div className="space-y-2">
              <label htmlFor="logo-link-url" className="text-sm font-medium text-foreground">
                Logo Link URL (Optional)
              </label>
              <UrlInput
                id="logo-link-url"
                value={logoLinkUrl || ''}
                onValueChange={(val) => onLogoLinkChange(val || null)}
                placeholder="https://example.com"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Makes the logo clickable and links to this URL
              </p>
            </div>
          )}
        </div>
      )}
      <MediaLibraryDialog
        open={logoGalleryOpen}
        onClose={() => setLogoGalleryOpen(false)}
        onSelectImage={handleGallerySelect}
        type="logo"
      />
      <LogoCropDialog
        open={cropDialogOpen}
        imageUrl={cropImageUrl}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload a logo to appear at the top of your post
        </p>
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Logo</CardTitle>
        <CardDescription>Upload a logo to appear at the top of your post</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
};
