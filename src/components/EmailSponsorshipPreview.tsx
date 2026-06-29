import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calendar, ExternalLink, Image } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { AllFieldsPanel } from './admin/AllFieldsPanel';

interface EmailSponsorshipPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsorshipId: string;
}

export function EmailSponsorshipPreview({ open, onOpenChange, sponsorshipId }: EmailSponsorshipPreviewProps) {
  const [sponsorship, setSponsorship] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    if (open && sponsorshipId) {
      fetchSponsorship();
    }
  }, [open, sponsorshipId]);

  const fetchSponsorship = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_sponsorships')
        .select('*')
        .eq('id', sponsorshipId)
        .maybeSingle();

      if (error) throw error;
      setSponsorship(data);
    } catch (error) {
      console.error('Error fetching sponsorship:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending Approval</Badge>;
      case 'approved':
        return <Badge className="bg-green-500 text-white">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
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
            <Image className="h-5 w-5" />
            Email Sponsorship Submission
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !sponsorship ? (
          <div className="text-center py-8 text-muted-foreground">
            Sponsorship not found
          </div>
        ) : (() => {
          const previewBody = (
          <div className="space-y-6">
            {/* Status and dates */}
            <div className="flex flex-wrap gap-2">
              {getStatusBadge(sponsorship.status)}
              {sponsorship.submitted_at && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Submitted {format(parseISO(sponsorship.submitted_at), 'MMM d, yyyy')}
                </Badge>
              )}
              {sponsorship.week_start_date && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Week of {format(parseISO(sponsorship.week_start_date), 'MMM d, yyyy')}
                </Badge>
              )}
            </div>

            {/* Deadline */}
            {sponsorship.submission_deadline && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Submission Deadline:</span>{' '}
                {format(parseISO(sponsorship.submission_deadline), 'MMM d, yyyy')}
              </div>
            )}

            {/* Banner image */}
            {sponsorship.banner_image_url && (
              <div className="rounded-lg overflow-hidden bg-muted border border-border">
                <img
                  src={sponsorship.banner_image_url}
                  alt="Sponsorship banner"
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            {/* Click URL */}
            {sponsorship.click_url && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Click URL</p>
                <a
                  href={sponsorship.click_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  {sponsorship.click_url}
                </a>
              </div>
            )}

            {/* Review info */}
            {sponsorship.status !== 'pending' && sponsorship.reviewed_at && (
              <div className={`p-4 rounded-md ${
                sponsorship.status === 'approved' || sponsorship.status === 'published'
                  ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}>
                <p className="text-sm text-muted-foreground mb-1">
                  {sponsorship.status === 'approved' || sponsorship.status === 'published' ? 'Approved' : 'Reviewed'} on{' '}
                  {format(parseISO(sponsorship.reviewed_at), 'MMM d, yyyy h:mm a')}
                </p>
                {sponsorship.review_notes && (
                  <p className="text-sm">
                    <span className="font-medium">Notes:</span> {sponsorship.review_notes}
                  </p>
                )}
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
                  row={sponsorship}
                  fkColumns={{
                    client_id: 'user',
                    organization_id: 'organization',
                    site_id: 'site',
                    assignment_id: 'assignment',
                    reviewed_by: 'user',
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
