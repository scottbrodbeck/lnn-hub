import { useState, useEffect } from 'react';
import { getCleanCurrentUrl } from '@/lib/utils';
import { useLocation, Link } from 'react-router-dom';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { notifyAdminsOfSupportRequest } from '@/lib/notificationUtils';
import { Loader2, X, FileText, BookOpen } from 'lucide-react';
import { useW9Document, getW9SignedUrl } from '@/hooks/useW9Document';
import { useOnboardingSettings } from '@/hooks/useOnboardingSettings';

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  const { user, activeOrganizationId, activeOrganizationName } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const { data: onboarding } = useOnboardingSettings();
  
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: w9 } = useW9Document();

  const handleDownloadW9 = async () => {
    if (!w9) return;
    try {
      const url = await getW9SignedUrl(w9.file_path, w9.file_name);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({ title: 'Could not open W-9', description: e.message, variant: 'destructive' });
    }
  };

  // Pre-fill contact info from profile
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        setContactName(profile.full_name || '');
        setContactEmail(profile.email || '');
      }
    }
    
    if (open) {
      loadProfile();
    }
  }, [user?.id, open]);

  const handleAddScreenshot = (url: string | null) => {
    if (url) {
      setScreenshots(prev => [...prev, url]);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  // Internal state for new screenshot upload
  const [newScreenshotUrl, setNewScreenshotUrl] = useState<string | null>(null);
  
  const handleNewScreenshot = (url: string | null) => {
    if (url) {
      setScreenshots(prev => [...prev, url]);
      setNewScreenshotUrl(null); // Reset for next upload
    }
  };

  const resetForm = () => {
    setDescription('');
    setScreenshots([]);
    setNewScreenshotUrl(null);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({
        title: 'Description required',
        description: 'Please describe your issue.',
        variant: 'destructive',
      });
      return;
    }

    if (!contactName.trim() || !contactEmail.trim()) {
      toast({
        title: 'Contact info required',
        description: 'Please provide your name and email.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      // Insert support request into database
      const { data: request, error: insertError } = await supabase
        .from('support_requests')
        .insert({
          user_id: user?.id,
          organization_id: activeOrganizationId || null,
          description: description.trim(),
          screenshot_urls: screenshots,
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          page_url: getCleanCurrentUrl(),
          user_agent: navigator.userAgent,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Notify admins
      await notifyAdminsOfSupportRequest(supabase, {
        requestId: request.id,
        description: description.trim(),
        userId: user?.id || '',
        organizationId: activeOrganizationId,
        organizationName: activeOrganizationName,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        pageUrl: getCleanCurrentUrl(),
        screenshotCount: screenshots.length,
      });

      toast({
        title: 'Request submitted',
        description: 'Our team will get back to you soon.',
      });

      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to submit support request:', error);
      toast({
        title: 'Submission failed',
        description: error.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Need Help?</DialogTitle>
          <DialogDescription>
            Having trouble? Something not working correctly? Contact our team and we'll help.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="description">
              Describe your issue <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Tell us what's happening..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Screenshots (optional)</Label>
            <div className="space-y-3">
              {screenshots.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Screenshot ${index + 1}`}
                    className="w-full h-32 object-cover rounded-md border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveScreenshot(index)}
                    disabled={submitting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <SingleImageUpload
                imageUrl={newScreenshotUrl}
                onImageChange={handleNewScreenshot}
                label="Add screenshot"
                description="Drop an image or click to upload"
                aspectRatio="banner"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">
                Your Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">
                Your Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {(w9 || onboarding?.guideEnabled) && (
          <div className="border-t border-border pt-3 -mb-2 flex flex-col gap-2">
            {onboarding?.guideEnabled && (
              <Link
                to="/client/guide"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                New here? Read the Getting Started guide
              </Link>
            )}
            {w9 && (
              <button
                type="button"
                onClick={handleDownloadW9}
                className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Need our W-9 tax form? Download here
              </button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
