import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFilename } from '@/lib/fileUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface DesignRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: 'email_blast' | 'email_sponsorship' | 'display_ad';
}

const DESIGN_TYPES = [
  {
    value: 'email_blast',
    label: 'Email Blast Image',
    description: '560×900px sponsored email graphic',
  },
  {
    value: 'email_sponsorship',
    label: 'Email Sponsorship Banner',
    description: '840×210px newsletter header banner',
  },
  {
    value: 'display_ad',
    label: 'Website Display Ad',
    description: 'Billboard (600×300) or Skyscraper (300×600)',
  },
] as const;

const DISPLAY_AD_SIZES = [
  { value: 'billboard', label: 'Billboard', dimensions: '600×300' },
  { value: 'skyscraper', label: 'Skyscraper', dimensions: '300×600' },
] as const;

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp,.gif,.svg,.tiff,.bmp,.pdf,.psd,.ai,.eps,.indd';
const IMAGE_MIME_PREFIXES = ['image/'];

function isImageFile(file: File): boolean {
  return IMAGE_MIME_PREFIXES.some(p => file.type.startsWith(p));
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function DesignRequestDialog({
  open,
  onOpenChange,
  defaultType = 'email_blast',
}: DesignRequestDialogProps) {
  const { user, activeOrganizationId } = useAuth();
  
  const [designType, setDesignType] = useState<string>(defaultType);
  const [displayAdSize, setDisplayAdSize] = useState<string>('billboard');

  useEffect(() => {
    if (open) {
      setDesignType(defaultType);
      setDisplayAdSize('billboard');
    }
  }, [open, defaultType]);

  const [clickUrl, setClickUrl] = useState('');
  const [adCopy, setAdCopy] = useState('');
  const [visualDirection, setVisualDirection] = useState('');
  const [referenceLinks, setReferenceLinks] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setDesignType(defaultType);
    setDisplayAdSize('billboard');
    setClickUrl('');
    setAdCopy('');
    setVisualDirection('');
    setReferenceLinks('');
    setSelectedFiles([]);
  };

  const validateAndAddFiles = (files: File[]) => {
    const remaining = MAX_FILES - selectedFiles.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of files.slice(0, remaining)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const ext = getFileExtension(file.name);
      const allowedExts = ACCEPTED_EXTENSIONS.replace(/\./g, '').split(',');
      if (!allowedExts.includes(ext) && !isImageFile(file)) {
        toast.error(`${file.name} is not an accepted file type`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  }, [selectedFiles.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    const urls: string[] = [];
    const requestId = crypto.randomUUID();

    for (const file of selectedFiles) {
      const safeName = sanitizeFilename(file.name);
      const path = `design-requests/${requestId}/${safeName}`;

      const { error } = await supabase.storage
        .from('editor-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (error) {
        throw new Error(`Failed to upload ${file.name}: ${error.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('editor-images')
        .getPublicUrl(path);

      urls.push(urlData.publicUrl);
    }

    return urls;
  };

  const handleSubmit = async () => {
    if (!adCopy.trim()) {
      toast.error('Please describe what the design should say');
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload files first if any
      let screenshotUrls: string[] = [];
      if (selectedFiles.length > 0) {
        screenshotUrls = await uploadFiles();
      }

      const { error } = await supabase
        .from('support_requests')
        .insert({
          user_id: user?.id,
          organization_id: activeOrganizationId,
          request_category: 'design',
          design_type: designType,
          design_specs: {
            click_url: clickUrl,
            ad_copy: adCopy,
            visual_direction: visualDirection,
            reference_links: referenceLinks,
            ...(designType === 'display_ad' && { 
              ad_size: displayAdSize,
              ad_dimensions: DISPLAY_AD_SIZES.find(s => s.value === displayAdSize)?.dimensions 
            }),
          },
          screenshot_urls: screenshotUrls.length > 0 ? screenshotUrls : [],
          description: `Design request for ${DESIGN_TYPES.find(t => t.value === designType)?.label}${designType === 'display_ad' ? ` (${DISPLAY_AD_SIZES.find(s => s.value === displayAdSize)?.label})` : ''}: ${adCopy.substring(0, 100)}...`,
          contact_name: user?.user_metadata?.full_name || user?.email || '',
          contact_email: user?.email || '',
        });

      if (error) throw error;

      toast.success('Design request submitted! Our team will be in touch.');
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Failed to submit request: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Request Design Help</DialogTitle>
          <DialogDescription>
            Need a custom design? Fill out this form and our team will create it for you.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-scroll -mx-6 px-6">
          <div className="space-y-4 py-4">
          <div>
            <Label className="text-base">What type of design do you need?</Label>
            <RadioGroup
              value={designType}
              onValueChange={setDesignType}
              className="mt-2 space-y-2"
            >
              {DESIGN_TYPES.map(type => (
                <div key={type.value} className="flex items-start space-x-3">
                  <RadioGroupItem value={type.value} id={type.value} className="mt-0.5" />
                  <div>
                    <Label htmlFor={type.value} className="font-medium cursor-pointer">
                      {type.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {designType === 'display_ad' && (
            <div className="ml-6 p-3 border rounded-md bg-muted/50">
              <Label className="text-sm font-medium">Select ad size</Label>
              <RadioGroup
                value={displayAdSize}
                onValueChange={setDisplayAdSize}
                className="mt-2 flex gap-4"
              >
                {DISPLAY_AD_SIZES.map(size => (
                  <div key={size.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={size.value} id={`size-${size.value}`} />
                    <Label htmlFor={`size-${size.value}`} className="cursor-pointer">
                      {size.label} <span className="text-muted-foreground">({size.dimensions})</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          <div>
            <Label htmlFor="clickUrl">Click-through URL</Label>
            <UrlInput
              id="clickUrl"
              value={clickUrl}
              onValueChange={setClickUrl}
              placeholder="https://example.com/landing-page"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="adCopy">
              What should the design say? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="adCopy"
              value={adCopy}
              onChange={e => setAdCopy(e.target.value)}
              placeholder="Include headline, body text, and any call-to-action text..."
              className="mt-1.5 min-h-[80px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {adCopy.length}/500 characters
            </p>
          </div>

          <div>
            <Label htmlFor="visualDirection">Visual style or elements to include</Label>
            <Textarea
              id="visualDirection"
              value={visualDirection}
              onChange={e => setVisualDirection(e.target.value)}
              placeholder="Describe colors, style, imagery, or mood you'd like..."
              className="mt-1.5 min-h-[60px]"
            />
          </div>

          <div>
            <Label htmlFor="referenceLinks">Reference links (optional)</Label>
            <Input
              id="referenceLinks"
              value={referenceLinks}
              onChange={e => setReferenceLinks(e.target.value)}
              placeholder="Links to your website, social media, or inspiration"
              className="mt-1.5"
            />
          </div>

          {/* File Upload Section */}
          <div>
            <Label>Attach files (optional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Logos, photos, or reference files. Up to {MAX_FILES} files, 10MB each.
            </p>

            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
              } ${selectedFiles.length >= MAX_FILES ? 'opacity-50 pointer-events-none' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => {
                if (selectedFiles.length < MAX_FILES) {
                  document.getElementById('design-file-upload')?.click();
                }
              }}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drop files here or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Images, PDFs, and Adobe files accepted
              </p>
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileInput}
                className="hidden"
                id="design-file-upload"
                multiple
                disabled={selectedFiles.length >= MAX_FILES}
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedFiles.length} of {MAX_FILES} files
                </p>
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    {isImageFile(file) ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-8 h-8 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <span className="text-sm truncate flex-1 min-w-0">{file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {(file.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
