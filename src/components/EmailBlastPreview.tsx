import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calendar, ExternalLink, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { AllFieldsPanel } from './admin/AllFieldsPanel';

interface EmailBlastPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blastId: string;
}

export function EmailBlastPreview({ open, onOpenChange, blastId }: EmailBlastPreviewProps) {
  const [blast, setBlast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    if (open && blastId) {
      fetchBlast();
    }
  }, [open, blastId]);

  const fetchBlast = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_blasts')
        .select('*')
        .eq('id', blastId)
        .maybeSingle();

      if (error) throw error;
      setBlast(data);
    } catch (error) {
      console.error('Error fetching blast:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'submitted':
        return <Badge variant="default">Submitted</Badge>;
      case 'published':
        return <Badge className="bg-green-500 text-white">Published</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Blast Submission
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !blast ? (
          <div className="text-center py-8 text-muted-foreground">
            Blast not found
          </div>
        ) : (() => {
          const previewBody = (
          <div className="space-y-6">
            {/* Status and dates */}
            <div className="flex flex-wrap gap-2">
              {getStatusBadge(blast.status)}
              {blast.submitted_at && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Submitted {format(parseISO(blast.submitted_at), 'MMM d, yyyy')}
                </Badge>
              )}
              {blast.scheduled_date && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Scheduled {format(parseISO(blast.scheduled_date), 'MMM d, yyyy')}
                </Badge>
              )}
              {blast.published_at && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Published {format(parseISO(blast.published_at), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>

            {/* Title */}
            <div>
              <h2 className="text-2xl font-bold text-foreground">{blast.title}</h2>
              {blast.subject_line && (
                <p className="text-muted-foreground mt-1">
                  <span className="font-medium">Subject:</span> {blast.subject_line}
                </p>
              )}
              {blast.preview_text && (
                <p className="text-muted-foreground mt-1">
                  <span className="font-medium">Preview:</span> {blast.preview_text}
                </p>
              )}
            </div>

            {/* Main image */}
            {blast.main_image_url && (
              <div className="rounded-lg overflow-hidden bg-muted">
                <img
                  src={blast.main_image_url}
                  alt="Main image"
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Headline */}
            {blast.headline && (
              <h3 className="text-xl font-semibold text-foreground">{blast.headline}</h3>
            )}

            {/* Body content */}
            {blast.body_content && (
              <div 
                className="prose prose-sm sm:prose max-w-none"
                dangerouslySetInnerHTML={{ __html: blast.body_content }}
              />
            )}

            {/* Secondary image */}
            {blast.secondary_image_url && (
              <div className="rounded-lg overflow-hidden bg-muted">
                <img
                  src={blast.secondary_image_url}
                  alt="Secondary image"
                  className="w-full h-auto object-cover max-h-[300px]"
                />
              </div>
            )}

            {/* CTA Button */}
            {blast.cta_button_text && blast.cta_button_url && (
              <div className="pt-4 border-t border-border">
                <div className="flex justify-center">
                  <a
                    href={blast.cta_button_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:shadow-md"
                  >
                    {blast.cta_button_text}
                  </a>
                </div>
              </div>
            )}

            {/* Click URL */}
            {blast.click_url && (
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-1">Click URL</p>
                <a
                  href={blast.click_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  {blast.click_url}
                </a>
              </div>
            )}

            {/* Beehiiv link */}
            {blast.beehiiv_post_url && (
              <div className="pt-4 border-t border-border">
                <a
                  href={blast.beehiiv_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View in Beehiiv
                </a>
              </div>
            )}

            {/* Mailchimp link */}
            {blast.mailchimp_campaign_url && (
              <div className="pt-4 border-t border-border">
                <a
                  href={blast.mailchimp_campaign_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View in Mailchimp
                </a>
              </div>
            )}
          </div>
          );

          if (!isAdmin) return previewBody;

          return (
            <Tabs defaultValue="preview" className="w-full">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="all">All fields</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-4">
                {previewBody}
              </TabsContent>
              <TabsContent value="all" className="mt-4">
                <AllFieldsPanel
                  row={blast}
                  fkColumns={{
                    client_id: 'user',
                    organization_id: 'organization',
                    site_id: 'site',
                    assignment_id: 'assignment',
                  }}
                />
              </TabsContent>
            </Tabs>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
