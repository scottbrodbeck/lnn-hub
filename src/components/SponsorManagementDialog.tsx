import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoUpload } from '@/components/LogoUpload';
import { UrlInput } from '@/components/ui/url-input';
import { Save, Loader2 } from 'lucide-react';
import { Sponsor } from '@/hooks/useSponsors';

interface SponsorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsor: Sponsor | null; // null = create mode
  onSave: (data: { name: string; logo_url: string; link_url: string | null }) => Promise<boolean>;
  isSaving?: boolean;
}

export function SponsorManagementDialog({
  open,
  onOpenChange,
  sponsor,
  onSave,
  isSaving = false,
}: SponsorManagementDialogProps) {
  const [name, setName] = useState(sponsor?.name || '');
  const [logoUrl, setLogoUrl] = useState<string | null>(sponsor?.logo_url || null);
  const [linkUrl, setLinkUrl] = useState<string | null>(sponsor?.link_url || null);

  // Sync state when sponsor prop changes (e.g. editing different sponsors)
  useEffect(() => {
    setName(sponsor?.name || '');
    setLogoUrl(sponsor?.logo_url || null);
    setLinkUrl(sponsor?.link_url || null);
  }, [sponsor]);

  // Reset when dialog opens with different sponsor
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setName(sponsor?.name || '');
      setLogoUrl(sponsor?.logo_url || null);
      setLinkUrl(sponsor?.link_url || null);
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    if (!name.trim() || !logoUrl) return;
    const success = await onSave({ name: name.trim(), logo_url: logoUrl, link_url: linkUrl });
    if (success) {
      onOpenChange(false);
    }
  };

  const isValid = name.trim() && logoUrl;
  const isEditing = !!sponsor;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Sponsor' : 'Create New Sponsor'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update sponsor details. Changes will be synced to all WordPress sites.'
              : 'Create a new sponsor with a logo and organization name for use across posts.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="sponsor-name" className="text-sm font-medium">
              Organization Name *
            </Label>
            <Input
              id="sponsor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ABC Example Corp."
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Logo * <span className="text-muted-foreground font-normal">(horizontal works best; cropping is optional)</span></Label>
            <div className="mt-1.5">
              <LogoUpload
                variant="inline"
                onLogoChange={setLogoUrl}
                logoUrl={logoUrl}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="sponsor-link" className="text-sm font-medium">
              Link URL (Optional)
            </Label>
            <UrlInput
              id="sponsor-link"
              value={linkUrl || ''}
              onValueChange={(val) => setLinkUrl(val || null)}
              placeholder="https://example.com"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Makes the logo clickable on posts
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="w-full"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Sponsor'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
