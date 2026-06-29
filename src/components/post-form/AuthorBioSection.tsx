import { useState } from 'react';
import { User, Upload, X, Loader2, Settings, RefreshCw } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CollapsibleSection } from './CollapsibleSection';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { toast } from 'sonner';
import { useRef } from 'react';

interface AuthorBioSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  authorName: string;
  authorBio: string;
  authorPhotoUrl: string | null;
  onAuthorNameChange: (name: string) => void;
  onAuthorBioChange: (bio: string) => void;
  onAuthorPhotoChange: (url: string | null) => void;
  showSettingsLink?: boolean;
  hasDefaultSet?: boolean;
  onRefreshDefaults?: () => void;
}

export function AuthorBioSection({
  isOpen,
  onOpenChange,
  authorName,
  authorBio,
  authorPhotoUrl,
  onAuthorNameChange,
  onAuthorBioChange,
  onAuthorPhotoChange,
  showSettingsLink = false,
  hasDefaultSet = false,
  onRefreshDefaults,
}: AuthorBioSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, getProcessedUrl } = useImageProcessing();

  // Handle bio change - strip line breaks
  const handleBioChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const sanitizedText = e.target.value.replace(/[\r\n]+/g, ' ');
    onAuthorBioChange(sanitizedText);
  };

  // Handle photo upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB');
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadImage(file);
      
      // Poll until processing is complete (max 30s)
      let finalUrl = result.tempUrl;
      for (let i = 0; i < 30; i++) {
        const processedResult = await getProcessedUrl(result.recordId);
        if (processedResult.status === 'ready') {
          finalUrl = processedResult.url;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      onAuthorPhotoChange(finalUrl);
      toast.success('Author photo uploaded');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    onAuthorPhotoChange(null);
  };

  const isComplete = !!(authorName.trim() || authorBio.trim() || authorPhotoUrl);

  const handleRemoveForThisPost = () => {
    onAuthorNameChange('');
    onAuthorBioChange('');
    onAuthorPhotoChange(null);
  };

  return (
    <CollapsibleSection
      icon={User}
      title="Author Bio"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isComplete={isComplete}
    >
      <div className="space-y-4">
        {/* Read-only info message when using defaults */}
        {hasDefaultSet && (
          <div className="p-3 bg-muted/50 rounded-md border border-border">
            <p className="text-sm text-muted-foreground">
              Using your saved default author bio. <a href="/client/settings" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Edit in Settings</a> to change.
            </p>
          </div>
        )}

        {/* Author Name */}
        <div>
          <Label htmlFor="author-name" className="text-sm font-medium">
            Author Name
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">Appears at the bottom of your post</p>
          <Input
            id="author-name"
            placeholder="Enter author name"
            value={authorName}
            onChange={(e) => onAuthorNameChange(e.target.value)}
            className="mt-1.5"
            disabled={hasDefaultSet}
          />
        </div>

        <div className="flex gap-4">
          {/* Photo upload area */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted border-2 border-border flex items-center justify-center">
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : authorPhotoUrl ? (
                <img
                  src={authorPhotoUrl}
                  alt="Author"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {!hasDefaultSet && (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Upload
                </Button>
                {authorPhotoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePhoto}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Bio text area */}
          <div className="flex-1">
            <Label htmlFor="author-bio" className="text-sm font-medium">
              Author Bio
            </Label>
            <Textarea
              id="author-bio"
              placeholder="A brief one-paragraph bio..."
              value={authorBio}
              onChange={handleBioChange}
              className="mt-1.5 min-h-[100px] resize-none"
              disabled={hasDefaultSet}
            />
            <p className="text-xs text-muted-foreground mt-1">
              One paragraph only. Line breaks will be removed.
            </p>
          </div>
        </div>

        {showSettingsLink && (
          <div className="flex items-center justify-between text-sm pt-4 border-t border-border">
            <a 
              href="/client/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <Settings className="h-3 w-3" />
              Manage author defaults
            </a>
            <div className="flex items-center gap-2">
              {hasDefaultSet && onRefreshDefaults && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-primary"
                  onClick={onRefreshDefaults}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              )}
              {isComplete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={handleRemoveForThisPost}
                >
                  <X className="h-3 w-3 mr-1" />
                  Remove for this post
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
