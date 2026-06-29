import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFilename } from '@/lib/fileUtils';
import { notifyAdminsOfChangeRequest } from '@/lib/notificationUtils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UrlInput } from '@/components/ui/url-input';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import { SponsorshipBannerUpload } from '@/components/SponsorshipBannerUpload';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { toast } from 'sonner';

export interface ChangeRequestTarget {
  type: 'email_blast' | 'email_sponsorship';
  entityId: string;
  name: string;
  currentClickUrl?: string | null;
  currentImageUrl?: string | null;
}

interface ChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ChangeRequestTarget | null;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp,.gif,.svg,.tiff,.bmp,.pdf,.psd,.ai,.eps,.indd';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

const TYPE_LABEL: Record<ChangeRequestTarget['type'], string> = {
  email_blast: 'Email Blast',
  email_sponsorship: 'Email Sponsorship',
};

export function ChangeRequestDialog({ open, onOpenChange, target }: ChangeRequestDialogProps) {
  const { user, activeOrganizationId } = useAuth();

  const [changeDescription, setChangeDescription] = useState('');
  const [newClickUrl, setNewClickUrl] = useState('');
  const [newCreativeUrl, setNewCreativeUrl] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && target) {
      setChangeDescription('');
      setNewClickUrl(target.currentClickUrl || '');
      setNewCreativeUrl(null);
      setSelectedFiles([]);
    }
  }, [open, target]);

  const validateAndAddFiles = (files: File[]) => {
    const remaining = MAX_FILES - selectedFiles.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }
    const valid: File[] = [];
    for (const file of files.slice(0, remaining)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }
      const ext = getFileExtension(file.name);
      const allowed = ACCEPTED_EXTENSIONS.replace(/\./g, '').split(',');
      if (!allowed.includes(ext) && !isImageFile(file)) {
        toast.error(`${file.name} is not an accepted file type`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) setSelectedFiles(prev => [...prev, ...valid]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    validateAndAddFiles(Array.from(e.dataTransfer.files));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles.length]);

  const uploadFiles = async (): Promise<string[]> => {
    const urls: string[] = [];
    const requestId = crypto.randomUUID();
    for (const file of selectedFiles) {
      const safeName = sanitizeFilename(file.name);
      const path = `change-requests/${requestId}/${safeName}`;
      const { error } = await supabase.storage
        .from('editor-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`);
      const { data } = supabase.storage.from('editor-images').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleSubmit = async () => {
    if (!target) return;
    if (!changeDescription.trim()) {
      toast.error('Please describe what you would like to change');
      return;
    }

    setIsSubmitting(true);
    try {
      const attachmentUrls = selectedFiles.length > 0 ? await uploadFiles() : [];

      const typeLabel = TYPE_LABEL[target.type];
      const { data: inserted, error } = await supabase
        .from('support_requests')
        .insert({
          user_id: user?.id,
          organization_id: activeOrganizationId,
          request_category: 'change_request',
          design_type: target.type,
          design_specs: {
            related_type: target.type,
            related_id: target.entityId,
            related_name: target.name,
            change_description: changeDescription,
            new_click_url: newClickUrl || null,
            new_creative_url: newCreativeUrl || null,
            current_click_url: target.currentClickUrl || null,
            current_creative_url: target.currentImageUrl || null,
          },
          screenshot_urls: attachmentUrls,
          description: `Change request for ${typeLabel} "${target.name}": ${changeDescription.substring(0, 120)}`,
          contact_name: user?.user_metadata?.full_name || user?.email || '',
          contact_email: user?.email || '',
        })
        .select('id')
        .single();

      if (error) throw error;

      // Fire-and-forget admin notification.
      void notifyAdminsOfChangeRequest(supabase, {
        requestId: inserted?.id || '',
        userId: user?.id || '',
        contactName: user?.user_metadata?.full_name || user?.email || '',
        contactEmail: user?.email || '',
        organizationId: activeOrganizationId,
        relatedType: target.type,
        relatedId: target.entityId,
        relatedName: target.name,
        changeDescription,
        newClickUrl: newClickUrl || null,
        newCreativeUrl,
      });

      toast.success('Change request submitted! Our team will take it from here.');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to submit request: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!target) return null;
  const isSponsorship = target.type === 'email_sponsorship';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>
            {TYPE_LABEL[target.type]} — {target.name}. Tell us what to change and (optionally) attach
            the new creative or link. Our team will apply it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="changeDescription">
                What would you like to change? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="changeDescription"
                value={changeDescription}
                onChange={e => setChangeDescription(e.target.value)}
                placeholder="e.g. swap the banner for the new one attached, and point the link to our summer sale page"
                className="mt-1.5 min-h-[90px]"
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground mt-1">{changeDescription.length}/1000 characters</p>
            </div>

            <div>
              <Label htmlFor="newClickUrl">New click-through URL (optional)</Label>
              <UrlInput
                id="newClickUrl"
                value={newClickUrl}
                onValueChange={setNewClickUrl}
                placeholder="https://example.com/landing-page"
                className="mt-1.5"
              />
              {target.currentClickUrl && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: <span className="break-all">{target.currentClickUrl}</span>
                </p>
              )}
            </div>

            <div>
              <Label>New creative (optional)</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                {isSponsorship
                  ? 'Upload and crop a replacement 840 × 210 banner.'
                  : 'Upload a replacement image.'}
              </p>
              {isSponsorship ? (
                <SponsorshipBannerUpload imageUrl={newCreativeUrl} onImageChange={setNewCreativeUrl} />
              ) : (
                <SingleImageUpload imageUrl={newCreativeUrl} onImageChange={setNewCreativeUrl} aspectRatio="auto" />
              )}
            </div>

            <div>
              <Label>Attach files (optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Source files or references. Up to {MAX_FILES} files, 10MB each.
              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
                } ${selectedFiles.length >= MAX_FILES ? 'opacity-50 pointer-events-none' : ''}`}
                onDragEnter={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  if (selectedFiles.length < MAX_FILES) document.getElementById('change-file-upload')?.click();
                }}
              >
                <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
                <input
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={e => { if (e.target.files) { validateAndAddFiles(Array.from(e.target.files)); e.target.value = ''; } }}
                  className="hidden"
                  id="change-file-upload"
                  multiple
                  disabled={selectedFiles.length >= MAX_FILES}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      {isImageFile(file) ? (
                        <img src={URL.createObjectURL(file)} alt={file.name} className="w-8 h-8 object-cover rounded flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-sm truncate flex-1 min-w-0">{file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={e => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, i) => i !== index)); }}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
