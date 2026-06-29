import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Check, X, Clock, User, FileEdit, AlertCircle, CalendarClock, ArrowRight, 
  Eye, ExternalLink, Palette, HelpCircle, MessageSquare, Building2, ChevronDown, ChevronUp,
  Download, Image, Globe, Mail, RotateCcw
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RequestDetailDialog } from './RequestDetailDialog';
import { EmailBlastPreview } from '@/components/EmailBlastPreview';
import { recordAudit } from '@/lib/audit';
import {

  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 50;

// Helper to extract image URL from string or object format
const getImageUrl = (image: any): string | null => {
  if (!image) return null;
  if (typeof image === 'string') {
    if (image.startsWith('{')) {
      try {
        const parsed = JSON.parse(image);
        return parsed.processedUrl || parsed.originalUrl || null;
      } catch {
        return image;
      }
    }
    return image;
  }
  if (typeof image === 'object') {
    return image.processedUrl || image.originalUrl || null;
  }
  return null;
};

// Helper to extract YouTube video ID from URL
const getYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
};

interface EditRequest {
  id: string;
  post_id: string;
  request_type: string;
  assignment_id: string | null;
  instance_date: string | null;
  old_due_date: string | null;
  new_due_date: string | null;
  old_headline: string;
  new_headline: string;
  old_content: string;
  new_content: string;
  old_author_name: string | null;
  new_author_name: string | null;
  old_author_bio: string | null;
  new_author_bio: string | null;
  old_author_photo_url: string | null;
  new_author_photo_url: string | null;
  old_featured_image_url: string | null;
  new_featured_image_url: string | null;
  old_featured_image_id: string | null;
  new_featured_image_id: string | null;
  old_gallery_images: any[] | null;
  new_gallery_images: any[] | null;
  old_youtube_url: string | null;
  new_youtube_url: string | null;
  old_logo_url: string | null;
  new_logo_url: string | null;
  old_logo_link_url: string | null;
  new_logo_link_url: string | null;
  old_logo_author_name: string | null;
  new_logo_author_name: string | null;
  old_cta_button_text: string | null;
  new_cta_button_text: string | null;
  old_cta_button_url: string | null;
  new_cta_button_url: string | null;
  requested_by: string;
  requested_at: string;
  request_reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  wordpress_updated?: boolean | null;
  wordpress_update_error?: string | null;
  additional_request_data?: {
    additionalChanges?: string | null;
  } | null;
  profiles: {
    full_name: string | null;
    email: string;
  };
  post_assignments?: {
    assignment_name: string;
    site: {
      name: string;
    };
    organization?: {
      name: string;
    };
    recurrence_type: string;
  } | null;
  user_organization?: {
    id?: string;
    name: string;
  } | null;
}

interface SupportRequest {
  id: string;
  user_id: string;
  organization_id: string | null;
  request_category: string;
  design_type: string | null;
  design_specs: Record<string, any> | null;
  description: string;
  contact_name: string;
  contact_email: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  screenshot_urls?: string[] | null;
  profiles?: { full_name: string | null; email: string } | null;
  organizations?: { name: string } | null;
}

interface SponsorshipRequest {
  id: string;
  banner_image_url: string;
  click_url: string;
  week_start_date: string;
  submitted_at: string | null;
  status: string;
  client_id: string | null;
  organization_id: string | null;
  assignment_id: string | null;
  site_id: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  profiles?: { full_name: string | null; email: string } | null;
  organizations?: { name: string } | null;
  sites?: { name: string } | null;
}

interface TasksRequestsContentProps {
  onPendingCountChange?: (count: number) => void;
}

type SortField = 'date' | 'type' | 'user' | 'organization' | 'status';
type SortDirection = 'asc' | 'desc';

// Download helper
const handleImageDownload = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
};

const DownloadButton = ({ url, filename, className = '' }: { url: string; filename: string; className?: string }) => (
  <Button
    variant="outline"
    size="sm"
    className={className}
    onClick={(e) => {
      e.stopPropagation();
      handleImageDownload(url, filename);
    }}
  >
    <Download className="h-3 w-3 mr-1" />
    Download
  </Button>
);

// Header link helpers — wrap user/org name in <Link> when an id is available
const UserLink = ({ userId, name }: { userId?: string | null; name: string }) => {
  const inner = (
    <>
      <User className="h-3 w-3" />
      {name}
    </>
  );
  if (!userId) {
    return <span className="flex items-center gap-1 font-medium text-foreground">{inner}</span>;
  }
  return (
    <Link
      to={`/admin/users?user=${userId}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 font-medium text-foreground hover:underline"
    >
      {inner}
    </Link>
  );
};

const OrgLink = ({ orgId, name }: { orgId?: string | null; name: string | null }) => {
  if (!name) return null;
  const inner = (
    <>
      <Building2 className="h-3 w-3" />
      {name}
    </>
  );
  if (!orgId) {
    return <span className="flex items-center gap-1 text-primary">{inner}</span>;
  }
  return (
    <Link
      to={`/admin/clients?org=${orgId}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 text-primary hover:underline"
    >
      {inner}
    </Link>
  );
};

export function TasksRequestsContent({ onPendingCountChange }: TasksRequestsContentProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [sponsorshipRequests, setSponsorshipRequests] = useState<SponsorshipRequest[]>([]);
  const [emailBlasts, setEmailBlasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [previewRequest, setPreviewRequest] = useState<EditRequest | null>(null);
  const [previewWordpressUrl, setPreviewWordpressUrl] = useState<string | null>(null);
  const [previewBlastId, setPreviewBlastId] = useState<string | null>(null);
  
  // Detail dialog state
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean;
    title: string;
    content: string | null;
    type: 'text' | 'design_specs';
    designSpecs?: any;
    images?: string[];
  }>({ open: false, title: '', content: null, type: 'text' });

  // Pagination and sorting for resolved/rejected
  const [resolvedPage, setResolvedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const [resolvedSort, setResolvedSort] = useState<{ field: SortField; direction: SortDirection }>({ field: 'date', direction: 'desc' });
  const [rejectedSort, setRejectedSort] = useState<{ field: SortField; direction: SortDirection }>({ field: 'date', direction: 'desc' });

  // Selected row for grid view detail
  const [selectedGridItem, setSelectedGridItem] = useState<any>(null);

  // Sponsorship review notes
  const [sponsorshipReviewNotes, setSponsorshipReviewNotes] = useState('');

  useEffect(() => {
    fetchRequests();
    fetchSupportRequests();
    fetchSponsorshipRequests();
    fetchEmailBlasts();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('post_edit_requests')
        .select(`
          *,
          profiles!post_edit_requests_requested_by_fkey(full_name, email),
          post_assignments(assignment_name, recurrence_type, site:sites(name), organization:organizations(name))
        `)
        .order('requested_at', { ascending: false });

      if (error) throw error;

      const rows = data || [];

      // Batch-fetch primary organizations for all unique requesters in one query
      const uniqueUserIds = [...new Set(rows.map(r => r.requested_by))];
      let orgByUserId: Record<string, { id?: string; name: string }> = {};

      if (uniqueUserIds.length > 0) {
        const { data: orgData } = await supabase
          .from('user_organizations')
          .select('user_id, organization:organizations(id, name)')
          .in('user_id', uniqueUserIds)
          .eq('is_primary', true);

        if (orgData) {
          orgData.forEach(row => {
            orgByUserId[row.user_id] = (row.organization as any) || null;
          });
        }
      }

      const requestsWithOrg = rows.map(req => ({
        ...req,
        user_organization: orgByUserId[req.requested_by] || null,
      })) as EditRequest[];

      setRequests(requestsWithOrg);
    } catch (error: any) {
      toast.error('Failed to load requests: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupportRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('support_requests')
        .select(`
          *,
          organizations(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data || [];

      // Batch-fetch profiles for all unique user_ids in one query
      const uniqueUserIds = [...new Set(rows.map(r => r.user_id))];
      let profileByUserId: Record<string, { full_name: string | null; email: string }> = {};

      if (uniqueUserIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', uniqueUserIds);

        if (profileData) {
          profileData.forEach(p => { profileByUserId[p.id] = { full_name: p.full_name, email: p.email }; });
        }
      }

      setSupportRequests(rows.map(req => ({
        ...req,
        profiles: profileByUserId[req.user_id] || null,
      })) as SupportRequest[]);
    } catch (error: any) {
      console.error('Failed to load support requests:', error);
    }
  };

  const fetchSponsorshipRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('email_sponsorships')
        .select(`
          *,
          sites(name),
          organizations(name)
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const rows = data || [];

      // Batch-fetch profiles for all unique client_ids in one query
      const uniqueClientIds = [...new Set(rows.map(r => r.client_id).filter(Boolean))] as string[];
      let profileByClientId: Record<string, { full_name: string | null; email: string }> = {};

      if (uniqueClientIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', uniqueClientIds);

        if (profileData) {
          profileData.forEach(p => { profileByClientId[p.id] = { full_name: p.full_name, email: p.email }; });
        }
      }

      setSponsorshipRequests(rows.map(sp => ({
        ...sp,
        profiles: sp.client_id ? (profileByClientId[sp.client_id] || null) : null,
      })) as SponsorshipRequest[]);
    } catch (error: any) {
      console.error('Failed to load sponsorship requests:', error);
    }
  };

  const fetchEmailBlasts = async () => {
    try {
      const { data, error } = await supabase
        .from('email_blasts')
        .select('*, sites:site_id(name)')
        .in('status', ['submitted', 'published'])
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const rows = data || [];

      // Batch-fetch profiles for client_ids
      const uniqueClientIds = [...new Set(rows.map(r => r.client_id).filter(Boolean))] as string[];
      let profileByClientId: Record<string, { full_name: string | null; email: string }> = {};

      if (uniqueClientIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', uniqueClientIds);

        if (profileData) {
          profileData.forEach(p => { profileByClientId[p.id] = { full_name: p.full_name, email: p.email }; });
        }
      }

      // Batch-fetch org names
      const uniqueOrgIds = [...new Set(rows.map(r => r.organization_id).filter(Boolean))] as string[];
      let orgById: Record<string, { name: string }> = {};

      if (uniqueOrgIds.length > 0) {
        const { data: orgData } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', uniqueOrgIds);

        if (orgData) {
          orgData.forEach(o => { orgById[o.id] = { name: o.name }; });
        }
      }

      setEmailBlasts(rows.map(b => ({
        ...b,
        profiles: b.client_id ? (profileByClientId[b.client_id] || null) : null,
        organizations: b.organization_id ? (orgById[b.organization_id] || null) : null,
      })));
    } catch (error: any) {
      console.error('Failed to load email blasts:', error);
    }
  };

  // Update pending count
  useEffect(() => {
    const pendingEditCount = requests.filter(r => r.status === 'pending').length;
    const pendingSupportCount = supportRequests.filter(r => r.status === 'pending').length;
    const pendingSponsorshipCount = sponsorshipRequests.filter(r => r.status === 'pending').length;
    const pendingBlastCount = emailBlasts.filter(r => r.status === 'submitted').length;
    onPendingCountChange?.(pendingEditCount + pendingSupportCount + pendingSponsorshipCount + pendingBlastCount);
  }, [requests, supportRequests, sponsorshipRequests, emailBlasts, onPendingCountChange]);

  // Open preview and fetch WordPress URL
  const openPreview = async (request: EditRequest) => {
    setPreviewRequest(request);
    setPreviewWordpressUrl(null);
    
    try {
      const { data } = await supabase
        .from('posts')
        .select('wordpress_post_url')
        .eq('id', request.post_id)
        .single();
      
      setPreviewWordpressUrl(data?.wordpress_post_url || null);
    } catch (error) {
      console.error('Failed to fetch WordPress URL:', error);
    }
  };

  const handleApprove = async (request: EditRequest) => {
    setProcessingId(request.id);
    try {
      const { error: updateError } = await supabase
        .from('posts')
        .update({
          headline: request.new_headline,
          content: request.new_content,
          author_name: request.new_author_name ?? undefined,
          author_bio: request.new_author_bio ?? undefined,
          author_photo_url: request.new_author_photo_url ?? undefined,
          logo_url: request.new_logo_url ?? undefined,
          logo_link_url: request.new_logo_link_url ?? undefined,
          logo_author_name: request.new_logo_author_name ?? undefined,
          cta_button_text: request.new_cta_button_text ?? undefined,
          cta_button_url: request.new_cta_button_url ?? undefined,
          featured_image_url: request.new_featured_image_url,
          featured_image_id: request.new_featured_image_id ?? null,
          gallery_images: request.new_gallery_images,
          youtube_url: request.new_youtube_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.post_id);

      if (updateError) throw updateError;

      // Resolve org for audit log
      let auditOrgId: string | null = null;
      if (request.assignment_id) {
        const { data: assignmentRow } = await supabase
          .from('post_assignments')
          .select('organization_id')
          .eq('id', request.assignment_id)
          .maybeSingle();
        auditOrgId = (assignmentRow as any)?.organization_id ?? null;
      }

      if (auditOrgId) {
        void recordAudit({
          organizationId: auditOrgId,
          action: 'post.edited',
          entityType: 'post',
          entityId: request.post_id,
          summary: `Approved edit request for "${request.new_headline || request.old_headline || 'post'}"`,
          before: {
            headline: request.old_headline,
            content: request.old_content,
            author_name: request.old_author_name,
            author_bio: request.old_author_bio,
            author_photo_url: request.old_author_photo_url,
            logo_url: request.old_logo_url,
            logo_link_url: request.old_logo_link_url,
            logo_author_name: request.old_logo_author_name,
            cta_button_text: request.old_cta_button_text,
            cta_button_url: request.old_cta_button_url,
            featured_image_url: request.old_featured_image_url,
            youtube_url: request.old_youtube_url,
          },
          after: {
            headline: request.new_headline,
            content: request.new_content,
            author_name: request.new_author_name,
            author_bio: request.new_author_bio,
            author_photo_url: request.new_author_photo_url,
            logo_url: request.new_logo_url,
            logo_link_url: request.new_logo_link_url,
            logo_author_name: request.new_logo_author_name,
            cta_button_text: request.new_cta_button_text,
            cta_button_url: request.new_cta_button_url,
            featured_image_url: request.new_featured_image_url,
            youtube_url: request.new_youtube_url,
          },
          metadata: { edit_request_id: request.id },
        });
      }

      const { data: post } = await supabase
        .from('posts')
        .select('assignment_ids, wordpress_post_id, wordpress_site_id')
        .eq('id', request.post_id)
        .single();

      let wpUpdateSuccess = true;
      let wpError: string | null = null;
      let adminRequestCreated = false;

      if (post?.wordpress_post_id) {
        let siteId = post.wordpress_site_id ?? null;

        if (!siteId && post.assignment_ids && post.assignment_ids.length > 0) {
          const { data: assignment } = await supabase
            .from('post_assignments')
            .select('site_id')
            .eq('id', post.assignment_ids[0])
            .single();
          siteId = assignment?.site_id ?? null;
        }

        const { error: wpErr } = await supabase.functions.invoke('publish-to-wordpress', {
          body: {
            mode: 'update',
            post_id: request.post_id,
            site_id: siteId,
          }
        });

        if (wpErr) {
          wpUpdateSuccess = false;
          wpError = wpErr.message;

          const errorContext = (wpErr as any)?.context;
          if (errorContext && typeof errorContext.json === 'function') {
            try {
              const errorPayload = await errorContext.json();
              adminRequestCreated = Boolean(errorPayload?.admin_request_created);
              wpError = errorPayload?.error || wpError;

              if (adminRequestCreated) {
                wpError = `${wpError} (Admin follow-up request created${errorPayload?.admin_request_id ? `: ${errorPayload.admin_request_id}` : ''})`;
              }
            } catch (parseError) {
              console.error('Failed to parse WordPress sync error payload:', parseError);
            }
          }
        }
      }

      const { error: reviewError } = await supabase
        .from('post_edit_requests')
        .update({
          status: 'approved',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
          wordpress_updated: wpUpdateSuccess,
          wordpress_update_error: wpError
        })
        .eq('id', request.id);

      if (reviewError) throw reviewError;

      try {
        await supabase.functions.invoke('send-user-notification', {
          body: {
            type: 'edit_request_approved',
            userId: request.requested_by,
            data: {
              post_headline: request.new_headline,
              reviewed_at: format(new Date(), 'MMMM d, yyyy h:mm a'),
              review_notes: reviewNotes || null,
            }
          }
        });
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }

      if (wpUpdateSuccess) {
        toast.success('Edit approved and synced to WordPress');
      } else if (adminRequestCreated) {
        toast.warning('Edit approved locally; an admin follow-up request was created for WordPress sync');
      } else {
        toast.warning('Edit approved locally, but WordPress sync failed');
      }

      setReviewNotes('');
      fetchRequests();
    } catch (error: any) {
      toast.error('Failed to approve edit: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const request = requests.find(r => r.id === requestId);
      
      const { error } = await supabase
        .from('post_edit_requests')
        .update({
          status: 'rejected',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null
        })
        .eq('id', requestId);

      if (error) throw error;

      // Audit the rejection decision
      if (request && request.assignment_id) {
        const { data: assignmentRow } = await supabase
          .from('post_assignments')
          .select('organization_id')
          .eq('id', request.assignment_id)
          .maybeSingle();
        const auditOrgId = (assignmentRow as any)?.organization_id ?? null;
        if (auditOrgId) {
          const isDateChange = request.request_type === 'date_change';
          void recordAudit({
            organizationId: auditOrgId,
            action: isDateChange ? 'post.date_change_rejected' : 'post.edit_request_rejected',
            entityType: 'post',
            entityId: request.post_id,
            summary: `Rejected ${isDateChange ? 'date change' : 'edit'} request for "${request.old_headline || request.new_headline || 'post'}"`,
            metadata: {
              edit_request_id: request.id,
              review_notes: reviewNotes || null,
            },
          });
        }
      }


      if (request) {
        try {
          const notificationType = request.request_type === 'date_change' 
            ? 'date_change_rejected' 
            : 'edit_request_rejected';
          
          await supabase.functions.invoke('send-user-notification', {
            body: {
              type: notificationType,
              userId: request.requested_by,
              data: {
                post_headline: request.old_headline || request.new_headline,
                assignment_name: request.post_assignments?.assignment_name || 'Assignment',
                old_date: request.old_due_date ? format(parseISO(request.old_due_date), 'MMMM d, yyyy') : '',
                new_date: request.new_due_date ? format(parseISO(request.new_due_date), 'MMMM d, yyyy') : '',
                reviewed_at: format(new Date(), 'MMMM d, yyyy h:mm a'),
                review_notes: reviewNotes || null,
              }
            }
          });
        } catch (notifyError) {
          console.error('Failed to send rejection notification:', notifyError);
        }
      }

      toast.success('Request rejected');
      setReviewNotes('');
      fetchRequests();
    } catch (error: any) {
      toast.error('Failed to reject request: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAcknowledgeEditRequest = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase
        .from('post_edit_requests')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user!.id,
        })
        .eq('id', requestId);
      if (error) throw error;
      toast.success('Marked as done');
      fetchRequests();
    } catch (error: any) {
      toast.error('Failed to mark as done: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveDateChange = async (request: EditRequest) => {
    if (!request.assignment_id || !request.new_due_date) {
      toast.error('Missing assignment or date information');
      return;
    }

    setProcessingId(request.id);
    try {
      const { data: assignment, error: assignmentError } = await supabase
        .from('post_assignments')
        .select('recurrence_type')
        .eq('id', request.assignment_id)
        .single();

      if (assignmentError) throw assignmentError;

      const isRecurring = assignment?.recurrence_type !== 'one_time';

      if (isRecurring && request.instance_date) {
        const { error: instanceError } = await supabase
          .from('assignment_instances')
          .upsert({
            assignment_id: request.assignment_id,
            instance_date: request.instance_date,
            overridden_due_date: request.new_due_date,
          }, {
            onConflict: 'assignment_id,instance_date'
          });

        if (instanceError) throw instanceError;
      } else {
        const { error: updateError } = await supabase
          .from('post_assignments')
          .update({ due_date: request.new_due_date })
          .eq('id', request.assignment_id);

        if (updateError) throw updateError;
      }

      const { error: reviewError } = await supabase
        .from('post_edit_requests')
        .update({
          status: 'approved',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null,
        })
        .eq('id', request.id);

      if (reviewError) throw reviewError;

      try {
        await supabase.functions.invoke('send-user-notification', {
          body: {
            type: 'date_change_approved',
            userId: request.requested_by,
            data: {
              assignment_name: request.post_assignments?.assignment_name || 'Assignment',
              old_date: request.old_due_date ? format(parseISO(request.old_due_date), 'MMMM d, yyyy') : '',
              new_date: request.new_due_date ? format(parseISO(request.new_due_date), 'MMMM d, yyyy') : '',
              reviewed_at: format(new Date(), 'MMMM d, yyyy h:mm a'),
              review_notes: reviewNotes || null,
            }
          }
        });
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }

      toast.success('Date change approved');
      setReviewNotes('');
      fetchRequests();
    } catch (error: any) {
      toast.error('Failed to approve date change: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAcknowledgeAuthorBioDefault = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase
        .from('post_edit_requests')
        .update({
          status: 'approved',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: 'Acknowledged'
        })
        .eq('id', requestId);

      if (error) throw error;
      toast.success('Author bio default acknowledged');
      fetchRequests();
    } catch (error: any) {
      toast.error('Failed to acknowledge: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveSupportRequest = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase
        .from('support_requests')
        .update({
          status: 'resolved',
          resolved_by: user!.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes || null
        })
        .eq('id', requestId);

      if (error) throw error;
      toast.success('Request marked as resolved');
      setResolutionNotes('');
      fetchSupportRequests();
    } catch (error: any) {
      toast.error('Failed to resolve request: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const getRequestTypeBadge = (request: EditRequest | SupportRequest | SponsorshipRequest) => {
    if ('banner_image_url' in request) {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          <Image className="h-3 w-3 mr-1" />
          Sponsorship
        </Badge>
      );
    }
    if ('request_type' in request) {
      switch (request.request_type) {
        case 'date_change':
          return (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <CalendarClock className="h-3 w-3 mr-1" />
              Date Change
            </Badge>
          );
        case 'author_bio_default':
          return (
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              <User className="h-3 w-3 mr-1" />
              Author Bio
            </Badge>
          );
        default:
          return (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <FileEdit className="h-3 w-3 mr-1" />
              Edit
            </Badge>
          );
      }
    } else {
      if (request.request_category === 'email_blast_manual') {
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            <Mail className="h-3 w-3 mr-1" />
            Schedule Email Blast
          </Badge>
        );
      }
      if (request.request_category === 'design') {
        return (
          <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
            <Palette className="h-3 w-3 mr-1" />
            Design
          </Badge>
        );
      }
      if (request.request_category === 'change_request') {
        return (
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
            <MessageSquare className="h-3 w-3 mr-1" />
            Change Request
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
          <HelpCircle className="h-3 w-3 mr-1" />
          Support
        </Badge>
      );
    }
  };

  const getUserName = (request: EditRequest | SupportRequest | SponsorshipRequest): string => {
    if ('profiles' in request && request.profiles) {
      return request.profiles.full_name || request.profiles.email;
    }
    return 'Unknown User';
  };

  const getOrganizationName = (request: EditRequest | SupportRequest | SponsorshipRequest): string | null => {
    if ('user_organization' in request && (request as any).user_organization) {
      return (request as any).user_organization.name;
    }
    if ('organizations' in request && (request as any).organizations) {
      return (request as any).organizations.name;
    }
    if ('post_assignments' in request && (request as any).post_assignments?.organization) {
      return ((request as any).post_assignments.organization as any).name;
    }
    return null;
  };

  // Truncated field component
  const TruncatedField = ({ 
    label, 
    content, 
    maxLength = 100,
    type = 'text',
    designSpecs,
    images
  }: { 
    label: string; 
    content: string | null; 
    maxLength?: number;
    type?: 'text' | 'design_specs';
    designSpecs?: any;
    images?: string[];
  }) => {
    if (!content && type !== 'design_specs') return null;
    const needsTruncation = content && content.length > maxLength;
    
    return (
      <div 
        className={`${(needsTruncation || type === 'design_specs') ? 'cursor-pointer hover:bg-muted/50 rounded p-2 -m-2' : ''}`}
        onClick={() => {
          if (needsTruncation || type === 'design_specs') {
            setDetailDialog({
              open: true,
              title: label,
              content,
              type,
              designSpecs,
              images,
            });
          }
        }}
      >
        <p className="text-sm font-semibold mb-1">{label}:</p>
        <p className="text-sm text-muted-foreground">
          {needsTruncation ? content.slice(0, maxLength) + '...' : content}
          {(needsTruncation || type === 'design_specs') && (
            <span className="text-primary underline ml-1">View more</span>
          )}
        </p>
      </div>
    );
  };

  // Sponsorship approve/reject handlers
  const handleApproveSponsorship = async (sponsorship: SponsorshipRequest) => {
    setProcessingId(sponsorship.id);
    try {
      const { error } = await supabase
        .from('email_sponsorships')
        .update({
          status: 'approved',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: sponsorshipReviewNotes || null,
        })
        .eq('id', sponsorship.id);

      if (error) throw error;

      // Also mark linked assignment as completed
      if (sponsorship.assignment_id) {
        await supabase
          .from('post_assignments')
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq('id', sponsorship.assignment_id);
      }

      if (sponsorship.organization_id) {
        void recordAudit({
          organizationId: sponsorship.organization_id,
          action: 'sponsorship.approved',
          entityType: 'email_sponsorship',
          entityId: sponsorship.id,
          summary: `Approved sponsorship${(sponsorship as any).sponsor_name ? ` "${(sponsorship as any).sponsor_name}"` : ''}`,
          before: { status: (sponsorship as any).status },
          after: { status: 'approved' },
          metadata: sponsorshipReviewNotes ? { review_notes: sponsorshipReviewNotes } : {},
        });
      }

      toast.success('Sponsorship approved');
      setSponsorshipReviewNotes('');
      fetchSponsorshipRequests();
    } catch (error: any) {
      toast.error('Failed to approve sponsorship: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSponsorship = async (sponsorship: SponsorshipRequest) => {
    setProcessingId(sponsorship.id);
    try {
      const { error } = await supabase
        .from('email_sponsorships')
        .update({
          status: 'rejected',
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: sponsorshipReviewNotes || null,
        })
        .eq('id', sponsorship.id);

      if (error) throw error;

      if (sponsorship.organization_id) {
        void recordAudit({
          organizationId: sponsorship.organization_id,
          action: 'sponsorship.rejected',
          entityType: 'email_sponsorship',
          entityId: sponsorship.id,
          summary: `Rejected sponsorship${(sponsorship as any).sponsor_name ? ` "${(sponsorship as any).sponsor_name}"` : ''}`,
          before: { status: (sponsorship as any).status },
          after: { status: 'rejected' },
          metadata: sponsorshipReviewNotes ? { review_notes: sponsorshipReviewNotes } : {},
        });
      }

      toast.success('Sponsorship rejected');
      setSponsorshipReviewNotes('');
      fetchSponsorshipRequests();
    } catch (error: any) {
      toast.error('Failed to reject sponsorship: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkBlastPublished = async (blastId: string) => {
    setProcessingId(blastId);
    try {
      const { data: before } = await supabase
        .from('email_blasts')
        .select('id, title, status, organization_id, scheduled_date')
        .eq('id', blastId)
        .single();

      const { error } = await supabase
        .from('email_blasts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', blastId);

      if (error) throw error;

      if (before?.organization_id) {
        void recordAudit({
          organizationId: before.organization_id,
          action: 'blast.marked_done',
          entityType: 'email_blast',
          entityId: blastId,
          summary: `Marked blast "${before.title ?? blastId.slice(0, 8)}" as done`,
          before: { status: before.status },
          after: { status: 'published' },
        });
      }

      toast.success('Email blast marked as done');
      fetchEmailBlasts();
    } catch (error: any) {
      toast.error('Failed to update email blast: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleResetBlast = async (blastId: string) => {
    setProcessingId(blastId);
    try {
      // Get blast to find assignment_id before deleting
      const { data: blast } = await supabase
        .from('email_blasts')
        .select('id, title, assignment_id, organization_id, status, scheduled_date')
        .eq('id', blastId)
        .single();

      const { error } = await supabase
        .from('email_blasts')
        .delete()
        .eq('id', blastId);

      if (error) throw error;

      // If the assignment was marked completed, reset it
      if (blast?.assignment_id) {
        await supabase
          .from('post_assignments')
          .update({
            is_completed: false,
            completed_at: null,
          })
          .eq('id', blast.assignment_id);
      }

      if (blast?.organization_id) {
        void recordAudit({
          organizationId: blast.organization_id,
          action: 'blast.reset',
          entityType: 'email_blast',
          entityId: blastId,
          summary: `Reset blast "${blast.title ?? blastId.slice(0, 8)}" — client can resubmit`,
          before: { status: blast.status, title: blast.title, scheduled_date: blast.scheduled_date },
        });
      }

      toast.success('Blast reset — client can now resubmit');
      fetchEmailBlasts();
      setSelectedGridItem(null);
    } catch (error: any) {
      toast.error('Failed to reset blast: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Unified request type
  type UnifiedRequest = 
    | { type: 'edit'; data: EditRequest; date: Date; key: string }
    | { type: 'support'; data: SupportRequest; date: Date; key: string }
    | { type: 'sponsorship'; data: SponsorshipRequest; date: Date; key: string }
    | { type: 'email_blast'; data: any; date: Date; key: string };

  const pendingRequests = requests.filter(r =>
    r.status === 'pending' ||
    (r.status === 'approved' && !r.acknowledged_at && r.request_type !== 'date_change')
  );
  const approvedRequests = requests.filter(r =>
    r.status === 'approved' && (r.request_type === 'date_change' || !!r.acknowledged_at)
  );
  const rejectedRequests = requests.filter(r => r.status === 'rejected');
  const pendingSupportRequests = supportRequests.filter(r => r.status === 'pending');
  const resolvedSupportRequests = supportRequests.filter(r => r.status === 'resolved');
  const pendingSponsorships = sponsorshipRequests.filter(r => r.status === 'pending');
  const approvedSponsorships = sponsorshipRequests.filter(r => r.status === 'approved');
  const rejectedSponsorships = sponsorshipRequests.filter(r => r.status === 'rejected');
  const submittedBlasts = emailBlasts.filter(r => r.status === 'submitted');
  const publishedBlasts = emailBlasts.filter(r => r.status === 'published');

  // Merge all pending
  const allPendingRequests: UnifiedRequest[] = [
    ...pendingRequests.map(r => ({ 
      type: 'edit' as const, 
      data: r, 
      date: new Date(r.status === 'approved' && r.reviewed_at ? r.reviewed_at : r.requested_at),
      key: `edit-${r.id}`
    })),
    ...pendingSupportRequests.map(r => ({ 
      type: 'support' as const, 
      data: r, 
      date: new Date(r.created_at),
      key: `support-${r.id}`
    })),
    ...pendingSponsorships.map(r => ({
      type: 'sponsorship' as const,
      data: r,
      date: new Date(r.submitted_at || r.week_start_date),
      key: `sponsorship-${r.id}`
    })),
    ...submittedBlasts.map(r => ({
      type: 'email_blast' as const,
      data: r,
      date: new Date(r.submitted_at || r.created_at),
      key: `blast-${r.id}`
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Merge all resolved/approved
  const allResolvedRequests: UnifiedRequest[] = [
    ...approvedRequests.map(r => ({ 
      type: 'edit' as const, 
      data: r, 
      date: new Date(r.reviewed_at || r.requested_at),
      key: `edit-${r.id}`
    })),
    ...resolvedSupportRequests.map(r => ({ 
      type: 'support' as const, 
      data: r, 
      date: new Date(r.resolved_at || r.created_at),
      key: `support-${r.id}`
    })),
    ...approvedSponsorships.map(r => ({
      type: 'sponsorship' as const,
      data: r,
      date: new Date(r.reviewed_at || r.submitted_at || r.week_start_date),
      key: `sponsorship-${r.id}`
    })),
    ...publishedBlasts.map(r => ({
      type: 'email_blast' as const,
      data: r,
      date: new Date(r.published_at || r.submitted_at || r.created_at),
      key: `blast-${r.id}`
    }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Sort helper
  const sortRequests = (items: UnifiedRequest[], sort: { field: SortField; direction: SortDirection }) => {
    return [...items].sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sort.field) {
        case 'date':
          aVal = a.date.getTime();
          bVal = b.date.getTime();
          break;
        case 'type':
          aVal = a.type === 'edit' ? (a.data as EditRequest).request_type : a.type === 'sponsorship' ? 'sponsorship' : (a.data as SupportRequest).request_category;
          bVal = b.type === 'edit' ? (b.data as EditRequest).request_type : b.type === 'sponsorship' ? 'sponsorship' : (b.data as SupportRequest).request_category;
          break;
        case 'user':
          aVal = getUserName(a.data as any);
          bVal = getUserName(b.data as any);
          break;
        case 'organization':
          aVal = getOrganizationName(a.data as any) || '';
          bVal = getOrganizationName(b.data as any) || '';
          break;
        case 'status':
          aVal = a.data.status;
          bVal = b.data.status;
          break;
        default:
          return 0;
      }
      
      if (sort.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
  };

  // Paginated and sorted resolved/rejected
  const sortedResolved = sortRequests(allResolvedRequests, resolvedSort);
  const paginatedResolved = sortedResolved.slice((resolvedPage - 1) * ITEMS_PER_PAGE, resolvedPage * ITEMS_PER_PAGE);
  const resolvedTotalPages = Math.ceil(sortedResolved.length / ITEMS_PER_PAGE);

  const rejectedUnified: UnifiedRequest[] = [
    ...rejectedRequests.map(r => ({
      type: 'edit' as const,
      data: r,
      date: new Date(r.reviewed_at || r.requested_at),
      key: `edit-${r.id}`
    })),
    ...rejectedSponsorships.map(r => ({
      type: 'sponsorship' as const,
      data: r,
      date: new Date(r.reviewed_at || r.submitted_at || r.week_start_date),
      key: `sponsorship-${r.id}`
    }))
  ];
  const sortedRejected = sortRequests(rejectedUnified, rejectedSort);
  const paginatedRejected = sortedRejected.slice((rejectedPage - 1) * ITEMS_PER_PAGE, rejectedPage * ITEMS_PER_PAGE);
  const rejectedTotalPages = Math.ceil(sortedRejected.length / ITEMS_PER_PAGE);

  const renderDiff = (oldValue: string | null, newValue: string | null, label: string) => {
    if (oldValue === newValue) return null;

    return (
      <div className="space-y-2">
        <Label className="font-semibold">{label}</Label>
        {oldValue && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-muted-foreground line-through">{oldValue}</p>
          </div>
        )}
        {newValue && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
            <p className="text-sm">{newValue}</p>
          </div>
        )}
      </div>
    );
  };

  const getSponsorshipUserName = (sp: SponsorshipRequest): string => {
    return sp.profiles?.full_name || sp.profiles?.email || 'Unknown User';
  };

  const getSponsorshipOrgName = (sp: SponsorshipRequest): string | null => {
    return sp.organizations?.name || null;
  };

  const renderPendingCard = (unified: UnifiedRequest) => {
    if (unified.type === 'email_blast') {
      const blast = unified.data;
      const userName = blast.profiles?.full_name || blast.profiles?.email || 'Unknown User';
      const orgName = blast.organizations?.name || null;
      const siteName = blast.sites?.name || null;

      return (
        <Card key={unified.key}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    <Mail className="h-3 w-3 mr-1" />
                    Schedule Email Blast
                  </Badge>
                  {siteName && (
                    <Badge variant="secondary" className="text-xs">
                      {siteName}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg mt-2">
                  {blast.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                  <UserLink userId={blast.client_id} name={userName} />
                  <OrgLink orgId={blast.organization_id} name={orgName} />
                  {blast.submitted_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(blast.submitted_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewBlastId(blast.id)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={processingId === blast.id}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Mark as Done
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark as Done?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark "{blast.title}" as done and move it to resolved items.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleMarkBlastPublished(blast.id)}>
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processingId === blast.id}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset for Resubmission?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete the submitted content for "{blast.title}" and allow the client to resubmit fresh. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleResetBlast(blast.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Reset Blast
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {blast.main_image_url && (
                <div className="flex-shrink-0">
                  <a href={blast.main_image_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={blast.main_image_url}
                      alt="Blast image"
                      className="w-24 h-24 object-cover rounded-lg border hover:opacity-80 transition-opacity"
                    />
                  </a>
                  <DownloadButton
                    url={blast.main_image_url}
                    filename={`blast-${blast.id}.jpg`}
                    className="mt-1 w-full"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div>
                  <p className="text-sm font-semibold mb-1">Subject Line:</p>
                  <p className="text-sm text-muted-foreground">{blast.subject_line}</p>
                </div>
                {blast.scheduled_date && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Scheduled Date:</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(blast.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (unified.type === 'sponsorship') {
      const sp = unified.data as SponsorshipRequest;
      const userName = getSponsorshipUserName(sp);
      const orgName = getSponsorshipOrgName(sp);
      const weekDate = sp.week_start_date ? format(new Date(sp.week_start_date + 'T00:00:00'), 'MMM d, yyyy') : '';

      return (
        <Card key={unified.key}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                    <Image className="h-3 w-3 mr-1" />
                    Sponsorship
                  </Badge>
                  {sp.sites?.name && (
                    <Badge variant="secondary" className="text-xs">
                      {sp.sites.name}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg mt-2">
                  Email Sponsorship - Week of {weekDate}
                </CardTitle>
                <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                  <UserLink userId={sp.client_id} name={userName} />
                  <OrgLink orgId={sp.organization_id} name={orgName} />
                  {sp.submitted_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(sp.submitted_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Badge variant="secondary">Pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Banner image */}
            <div>
              <p className="text-sm font-semibold mb-2">Banner Image:</p>
              <div className="relative">
                <img
                  src={sp.banner_image_url}
                  alt="Sponsorship banner"
                  className="w-full max-w-md rounded border"
                />
                <div className="mt-2">
                  <DownloadButton url={sp.banner_image_url} filename={`sponsorship-banner-${sp.id}.jpg`} />
                </div>
              </div>
            </div>

            {/* Click URL */}
            <div>
              <p className="text-sm font-semibold mb-1">Click URL:</p>
              <a
                href={sp.click_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
              >
                {sp.click_url}
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Review Notes (optional)</Label>
                <Textarea
                  value={sponsorshipReviewNotes}
                  onChange={(e) => setSponsorshipReviewNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={processingId === sp.id}>
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject Sponsorship</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to reject this email sponsorship submission?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleRejectSponsorship(sp)}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={processingId === sp.id}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve Sponsorship</AlertDialogTitle>
                      <AlertDialogDescription>
                        Approve this email sponsorship for the week of {weekDate}?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleApproveSponsorship(sp)}>
                        Approve
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    const orgName = getOrganizationName(unified.data);
    const userName = getUserName(unified.data);

    if (unified.type === 'support') {
      const request = unified.data as SupportRequest;
      const isDesignRequest = request.request_category === 'design';
      const isManualBlast = request.request_category === 'email_blast_manual';
      const isChangeRequest = request.request_category === 'change_request';
      const designSpecs = request.design_specs as any;
      const screenshots = (request.screenshot_urls || []) as string[];

      return (
        <Card key={unified.key}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getRequestTypeBadge(request)}
                  {isDesignRequest && request.design_type && (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {request.design_type.replace('_', ' ')}
                    </Badge>
                  )}
                  {isManualBlast && designSpecs?.site_name && (
                    <Badge variant="secondary" className="text-xs">
                      {designSpecs.site_name}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-lg mt-2">
                  {isManualBlast
                    ? `Email Blast: ${designSpecs?.title || 'Untitled'}`
                    : isChangeRequest
                      ? `Change Request — ${designSpecs?.related_type === 'email_blast' ? 'Email Blast' : 'Email Sponsorship'}: ${designSpecs?.related_name || 'Untitled'}`
                    : isDesignRequest
                      ? `${request.design_type === 'email_blast' ? 'Email Blast' : request.design_type === 'email_sponsorship' ? 'Email Sponsorship' : request.design_type === 'display_ad' ? 'Display Ad' : 'Design'} Design Request`
                      : 'Support Request'}
                </CardTitle>
                <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                  <UserLink userId={request.user_id} name={userName} />
                  <OrgLink orgId={request.organization_id} name={orgName} />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </CardDescription>
              </div>
              <Badge variant="secondary">Pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isManualBlast && designSpecs && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold mb-1">Subject Line:</p>
                    <p className="text-sm text-muted-foreground">{designSpecs.subject_line}</p>
                  </div>
                  {designSpecs.scheduled_date && (
                    <div>
                      <p className="text-sm font-semibold mb-1">Scheduled Date:</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(designSpecs.scheduled_date + 'T00:00:00'), 'MMM d, yyyy')}
                      </p>
                    </div>
                  )}
                </div>
                {designSpecs.click_url && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Click URL:</p>
                    <a
                      href={designSpecs.click_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                    >
                      {designSpecs.click_url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </div>
                )}
                {designSpecs.main_image_url && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Main Image:</p>
                    <img
                      src={designSpecs.main_image_url}
                      alt="Blast main image"
                      className="w-full max-w-md rounded border"
                    />
                    <div className="mt-2">
                      <DownloadButton url={designSpecs.main_image_url} filename={`blast-image-${request.id}.jpg`} />
                    </div>
                  </div>
                )}
              </>
            )}

            {!isDesignRequest && !isManualBlast && !isChangeRequest && request.description && (
              <TruncatedField label="Description" content={request.description} maxLength={150} />
            )}

            {isChangeRequest && designSpecs && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-1">Requested change:</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {designSpecs.change_description || request.description}
                  </p>
                </div>
                {designSpecs.new_click_url && (
                  <div>
                    <p className="text-sm font-semibold mb-1">New click URL:</p>
                    <a
                      href={designSpecs.new_click_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                    >
                      {designSpecs.new_click_url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    {designSpecs.current_click_url && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Current: <span className="break-all">{designSpecs.current_click_url}</span>
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {designSpecs.new_creative_url && (
                    <div>
                      <p className="text-sm font-semibold mb-2">New creative:</p>
                      <img
                        src={designSpecs.new_creative_url}
                        alt="Requested new creative"
                        className="w-full rounded border"
                      />
                      <div className="mt-2">
                        <DownloadButton url={designSpecs.new_creative_url} filename={`change-${request.id}.jpg`} />
                      </div>
                    </div>
                  )}
                  {designSpecs.current_creative_url && (
                    <div>
                      <p className="text-sm font-semibold mb-2 text-muted-foreground">Current creative:</p>
                      <img
                        src={designSpecs.current_creative_url}
                        alt="Current creative"
                        className="w-full rounded border opacity-80"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {isDesignRequest && designSpecs && (
              <TruncatedField 
                label="Request Details"
                content={designSpecs.adCopy || designSpecs.ad_copy || designSpecs.visualDirection || designSpecs.visual_direction || 'View specifications'}
                type="design_specs"
                designSpecs={designSpecs}
              />
            )}

            {screenshots.length > 0 && !isManualBlast && (
              <div>
                <div 
                  className="cursor-pointer hover:bg-muted/50 rounded p-2 -m-2"
                  onClick={() => setDetailDialog({
                    open: true,
                    title: 'Attached Screenshots',
                    content: null,
                    type: 'text',
                    images: screenshots,
                  })}
                >
                  <p className="text-sm font-semibold mb-1">Screenshots: {screenshots.length} attached</p>
                  <span className="text-sm text-primary underline">View images</span>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {screenshots.map((url, idx) => (
                    <DownloadButton key={idx} url={url} filename={`screenshot-${idx + 1}.jpg`} />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Resolution Notes (optional)</Label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Add notes about how this was resolved..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button 
                  onClick={() => handleResolveSupportRequest(request.id)}
                  disabled={processingId === request.id}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark Resolved
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Edit request
    const request = unified.data as EditRequest;
    
    if (request.request_type === 'date_change') {
      return (
        <Card key={unified.key}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getRequestTypeBadge(request)}
                </div>
                <CardTitle className="text-xl mt-2">
                  {request.post_assignments?.assignment_name || 'Assignment'}
                </CardTitle>
                <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                  <UserLink userId={request.requested_by} name={userName} />
                  <OrgLink orgId={request.user_organization?.id} name={orgName} />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(request.requested_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </CardDescription>
              </div>
              <Badge variant="secondary">Pending</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Current Date</p>
                <p className="font-semibold text-destructive">
                  {request.old_due_date ? format(parseISO(request.old_due_date), 'EEE, MMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Requested Date</p>
                <p className="font-semibold text-green-600">
                  {request.new_due_date ? format(parseISO(request.new_due_date), 'EEE, MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>

            {request.request_reason && (
              <TruncatedField label="Reason for change" content={request.request_reason} maxLength={150} />
            )}

            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Review Notes (optional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={processingId === request.id}>
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject Date Change Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to reject this date change request?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleReject(request.id)}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={processingId === request.id}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve Date Change</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will update the assignment's due date.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleApproveDateChange(request)}>
                        Approve
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Edit or author bio request
    return (
      <Card key={unified.key}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {getRequestTypeBadge(request)}
                {request.post_assignments?.site?.name && (
                  <Badge variant="secondary" className="text-xs">
                    {request.post_assignments.site.name}
                  </Badge>
                )}
              </div>
              <CardTitle className="text-xl mt-2">{request.old_headline || request.new_headline}</CardTitle>
              <CardDescription className="flex items-center gap-4 text-sm flex-wrap">
                <UserLink userId={request.requested_by} name={userName} />
                <OrgLink orgId={request.user_organization?.id} name={orgName} />
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(request.requested_at), 'MMM d, yyyy h:mm a')}
                </span>
              </CardDescription>
            </div>
            {request.status === 'approved' ? (
              <Badge className="bg-green-600 hover:bg-green-600">Approved — awaiting acknowledgement</Badge>
            ) : (
              <Badge variant="secondary">Pending</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {request.request_reason && (
            <TruncatedField label="Reason for late edit" content={request.request_reason} maxLength={150} />
          )}

          {request.additional_request_data?.additionalChanges && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <p className="text-sm font-semibold mb-1 text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Additional Changes Requested
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">{request.additional_request_data.additionalChanges}</p>
            </div>
          )}

          <div className="space-y-4">
            {renderDiff(request.old_headline, request.new_headline, 'Headline')}
            {renderDiff(request.old_author_name, request.new_author_name, 'Author Name')}
            {renderDiff(request.old_author_bio, request.new_author_bio, 'Author Bio')}
            {renderDiff(request.old_logo_author_name, request.new_logo_author_name, 'Sponsor Name')}
            {renderDiff(request.old_logo_url, request.new_logo_url, 'Sponsor Logo URL')}
            {renderDiff(request.old_logo_link_url, request.new_logo_link_url, 'Sponsor Link URL')}
            {renderDiff(request.old_cta_button_text, request.new_cta_button_text, 'CTA Button Text')}
            {renderDiff(request.old_cta_button_url, request.new_cta_button_url, 'CTA Button URL')}
            {/* Author photo diff */}
            {request.old_author_photo_url !== request.new_author_photo_url && (
              <div className="space-y-2">
                <Label className="font-semibold">Author Photo</Label>
                <div className="flex gap-4 items-start">
                  {request.old_author_photo_url && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Before</p>
                      <img src={request.old_author_photo_url} alt="Old author" className="w-16 h-16 rounded-full object-cover border-2 border-destructive/30" />
                    </div>
                  )}
                  {request.new_author_photo_url && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">After</p>
                      <img src={request.new_author_photo_url} alt="New author" className="w-16 h-16 rounded-full object-cover border-2 border-green-500/30" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <Button variant="outline" onClick={() => openPreview(request)}>
              <Eye className="h-4 w-4 mr-2" />
              View Proposed Post
            </Button>
          </div>

          {request.status === 'approved' ? (
            <div className="space-y-3 pt-4 border-t">
              <div className="rounded-md border p-3 bg-muted/40 space-y-1 text-sm">
                <div className="font-medium">
                  {request.wordpress_updated
                    ? 'Approved and synced to WordPress.'
                    : request.wordpress_update_error
                      ? 'Approved locally, WordPress sync failed.'
                      : 'Approved.'}
                </div>
                {request.reviewed_at && (
                  <div className="text-muted-foreground text-xs">
                    Reviewed {format(new Date(request.reviewed_at), 'MMM d, yyyy h:mm a')}
                  </div>
                )}
                {request.wordpress_update_error && (
                  <div className="text-destructive text-xs break-words">
                    {request.wordpress_update_error}
                  </div>
                )}
                {request.review_notes && (
                  <div className="text-muted-foreground text-xs">Notes: {request.review_notes}</div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => handleAcknowledgeEditRequest(request.id)}
                  disabled={processingId === request.id}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Mark as Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label>Review Notes (optional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={processingId === request.id}>
                      <X className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject Edit Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to reject this edit request?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleReject(request.id)}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={processingId === request.id}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve Edit Request</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will update the post and sync changes to WordPress. The task stays in this list until you mark it as done.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleApprove(request)}>
                        Approve & Publish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    );
  };

  const SortableHeader = ({ 
    field, 
    label, 
    sort, 
    onSort 
  }: { 
    field: SortField; 
    label: string; 
    sort: { field: SortField; direction: SortDirection };
    onSort: (field: SortField) => void;
  }) => (
    <TableHead 
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sort.field === field && (
          sort.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </TableHead>
  );

  const handleSort = (
    field: SortField, 
    currentSort: { field: SortField; direction: SortDirection },
    setSort: (sort: { field: SortField; direction: SortDirection }) => void
  ) => {
    if (currentSort.field === field) {
      setSort({ field, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ field, direction: 'desc' });
    }
  };

  const renderGridTable = (
    items: UnifiedRequest[], 
    sort: { field: SortField; direction: SortDirection },
    setSort: (sort: { field: SortField; direction: SortDirection }) => void,
    page: number,
    setPage: (page: number) => void,
    totalPages: number
  ) => (
    <div className="space-y-4">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader field="date" label="Date" sort={sort} onSort={(f) => handleSort(f, sort, setSort)} />
              <SortableHeader field="type" label="Type" sort={sort} onSort={(f) => handleSort(f, sort, setSort)} />
              <SortableHeader field="user" label="User" sort={sort} onSort={(f) => handleSort(f, sort, setSort)} />
              <SortableHeader field="organization" label="Organization" sort={sort} onSort={(f) => handleSort(f, sort, setSort)} />
              <SortableHeader field="status" label="Status" sort={sort} onSort={(f) => handleSort(f, sort, setSort)} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow 
                key={item.key}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedGridItem(item)}
              >
                <TableCell>{format(item.date, 'MMM d, yyyy')}</TableCell>
                <TableCell>{getRequestTypeBadge(item.data)}</TableCell>
                <TableCell>{getUserName(item.data)}</TableCell>
                <TableCell>{getOrganizationName(item.data) || '-'}</TableCell>
                <TableCell>
                  <Badge variant={item.data.status === 'approved' || item.data.status === 'resolved' ? 'default' : 'destructive'}>
                    {item.data.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setPage(Math.max(1, page - 1))}
                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setPage(pageNum)}
                    isActive={page === pageNum}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending
            {allPendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {allPendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Approved/Resolved
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {allPendingRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Check className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No pending requests</h3>
                <p className="text-muted-foreground">All requests have been reviewed</p>
              </CardContent>
            </Card>
          ) : (
            allPendingRequests.map(renderPendingCard)
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4">
          {allResolvedRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No approved or resolved requests yet</p>
              </CardContent>
            </Card>
          ) : (
            renderGridTable(paginatedResolved, resolvedSort, setResolvedSort, resolvedPage, setResolvedPage, resolvedTotalPages)
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejectedRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No rejected requests</p>
              </CardContent>
            </Card>
          ) : (
            renderGridTable(paginatedRejected, rejectedSort, setRejectedSort, rejectedPage, setRejectedPage, rejectedTotalPages)
          )}
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!previewRequest} onOpenChange={(open) => !open && setPreviewRequest(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-start justify-between gap-4">
            <DialogTitle>Proposed Post Content</DialogTitle>
            {previewWordpressUrl && (
              <a href={previewWordpressUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on WordPress
                </Button>
              </a>
            )}
          </DialogHeader>
          {previewRequest && (
            <div className="space-y-6">
              {previewRequest.new_featured_image_url && (
                <img 
                  src={getImageUrl(previewRequest.new_featured_image_url) || ''} 
                  alt="Featured" 
                  className="w-full rounded-lg object-cover max-h-96"
                />
              )}
              <h1 className="text-3xl font-bold">{previewRequest.new_headline}</h1>
              <div 
                className="prose prose-sm sm:prose lg:prose-lg max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: previewRequest.new_content || '' }}
              />
              {previewRequest.new_gallery_images && previewRequest.new_gallery_images.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-semibold">Gallery Images</Label>
                  <div className="grid grid-cols-3 gap-4">
                    {previewRequest.new_gallery_images
                      .filter((img: any) => getImageUrl(img) !== getImageUrl(previewRequest.new_featured_image_url))
                      .map((img: any, idx: number) => {
                        const url = getImageUrl(img);
                        if (!url) return null;
                        return (
                          <img key={idx} src={url} alt={`Gallery ${idx + 1}`} className="rounded-lg object-cover aspect-video" />
                        );
                      })}
                  </div>
                </div>
              )}
              {previewRequest.new_youtube_url && getYouTubeId(previewRequest.new_youtube_url) && (
                <div className="space-y-2">
                  <Label className="font-semibold">YouTube Video</Label>
                  <div className="aspect-video w-full">
                    <iframe
                      src={`https://www.youtube.com/embed/${getYouTubeId(previewRequest.new_youtube_url)}`}
                      className="w-full h-full rounded-lg"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {/* Author / Sponsor / CTA diffs */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Field Changes</h3>
                {renderDiff(previewRequest.old_author_name, previewRequest.new_author_name, 'Author Name')}
                {renderDiff(previewRequest.old_author_bio, previewRequest.new_author_bio, 'Author Bio')}
                {previewRequest.old_author_photo_url !== previewRequest.new_author_photo_url && (
                  <div className="space-y-2">
                    <Label className="font-semibold">Author Photo</Label>
                    <div className="flex gap-4 items-start">
                      {previewRequest.old_author_photo_url && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">Before</p>
                          <img src={previewRequest.old_author_photo_url} alt="Old" className="w-16 h-16 rounded-full object-cover border-2 border-destructive/30" />
                        </div>
                      )}
                      {previewRequest.new_author_photo_url && (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-1">After</p>
                          <img src={previewRequest.new_author_photo_url} alt="New" className="w-16 h-16 rounded-full object-cover border-2 border-green-500/30" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {renderDiff(previewRequest.old_logo_author_name, previewRequest.new_logo_author_name, 'Sponsor Name')}
                {renderDiff(previewRequest.old_logo_url, previewRequest.new_logo_url, 'Sponsor Logo URL')}
                {renderDiff(previewRequest.old_logo_link_url, previewRequest.new_logo_link_url, 'Sponsor Link URL')}
                {renderDiff(previewRequest.old_cta_button_text, previewRequest.new_cta_button_text, 'CTA Button Text')}
                {renderDiff(previewRequest.old_cta_button_url, previewRequest.new_cta_button_url, 'CTA Button URL')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog for truncated fields */}
      <RequestDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog(prev => ({ ...prev, open }))}
        title={detailDialog.title}
        content={detailDialog.content}
        type={detailDialog.type}
        designSpecs={detailDialog.designSpecs}
        images={detailDialog.images}
      />

      {/* Grid item detail dialog */}
      <Dialog open={!!selectedGridItem} onOpenChange={() => setSelectedGridItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedGridItem && getRequestTypeBadge(selectedGridItem.data)}
              Request Details
            </DialogTitle>
          </DialogHeader>
          {selectedGridItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">User</p>
                  <p>{getUserName(selectedGridItem.data)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Organization</p>
                  <p>{getOrganizationName(selectedGridItem.data) || '-'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date</p>
                  <p>{format(selectedGridItem.date, 'MMMM d, yyyy h:mm a')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <Badge variant={selectedGridItem.data.status === 'rejected' ? 'destructive' : 'default'}>
                    {selectedGridItem.data.status}
                  </Badge>
                </div>
              </div>

              {selectedGridItem.type === 'edit' && (
                <>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Headline</p>
                    <p>{(selectedGridItem.data as EditRequest).old_headline || (selectedGridItem.data as EditRequest).new_headline}</p>
                  </div>
                  {(selectedGridItem.data as EditRequest).review_notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Review Notes</p>
                      <p className="text-sm">{(selectedGridItem.data as EditRequest).review_notes}</p>
                    </div>
                  )}
                </>
              )}

              {selectedGridItem.type === 'support' && (() => {
                const sr = selectedGridItem.data as SupportRequest;
                const isDesignRequest = sr.request_category === 'design';
                const isManualBlast = sr.request_category === 'email_blast_manual';
                const isChangeRequest = sr.request_category === 'change_request';
                const designSpecs = (sr.design_specs as any) || {};
                const screenshots = (sr.screenshot_urls || []) as string[];

                // Pretty labels for known design_specs keys
                const SPEC_LABELS: Record<string, string> = {
                  subject_line: 'Subject Line',
                  scheduled_date: 'Scheduled Date',
                  click_url: 'Click URL',
                  cta_url: 'CTA URL',
                  cta_text: 'CTA Text',
                  headline: 'Headline',
                  title: 'Title',
                  ad_copy: 'Ad Copy',
                  adCopy: 'Ad Copy',
                  visual_direction: 'Visual Direction',
                  visualDirection: 'Visual Direction',
                  target_audience: 'Target Audience',
                  targetAudience: 'Target Audience',
                  dimensions: 'Dimensions',
                  ad_size: 'Ad Size',
                  site_name: 'Site',
                  notes: 'Notes',
                  change_description: 'Requested Change',
                  new_click_url: 'New Click URL',
                  current_click_url: 'Current Click URL',
                  related_name: 'Item',
                  related_type: 'Type',
                };
                const skipKeys = new Set(['main_image_url', 'banner_image_url', 'secondary_image_url', 'new_creative_url', 'current_creative_url', 'related_id']);
                const formatSpecValue = (key: string, val: any) => {
                  if (val == null || val === '') return null;
                  if (key === 'scheduled_date' && typeof val === 'string') {
                    try { return format(new Date(val + 'T00:00:00'), 'MMM d, yyyy'); } catch { return val; }
                  }
                  if (typeof val === 'object') return JSON.stringify(val, null, 2);
                  return String(val);
                };
                const isUrlKey = (k: string) => /url$/i.test(k);

                return (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {getRequestTypeBadge(sr)}
                      {isDesignRequest && sr.design_type && (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {sr.design_type.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>

                    {sr.description && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Description</p>
                        <p className="text-sm whitespace-pre-wrap">{sr.description}</p>
                      </div>
                    )}

                    {(isDesignRequest || isManualBlast || isChangeRequest) && designSpecs && Object.keys(designSpecs).length > 0 && (
                      <div className="space-y-2 rounded border p-3 bg-muted/30">
                        <p className="text-sm font-semibold">Request Details</p>
                        <div className="space-y-2">
                          {Object.entries(designSpecs)
                            .filter(([k, v]) => !skipKeys.has(k) && v != null && v !== '')
                            .map(([k, v]) => {
                              const label = SPEC_LABELS[k] || k.replace(/_/g, ' ');
                              const val = formatSpecValue(k, v);
                              if (!val) return null;
                              return (
                                <div key={k}>
                                  <p className="text-xs font-medium text-muted-foreground capitalize">{label}</p>
                                  {isUrlKey(k) && typeof v === 'string' ? (
                                    <a
                                      href={v}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-primary hover:underline break-all inline-flex items-center gap-1"
                                    >
                                      {v}
                                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                    </a>
                                  ) : (
                                    <p className="text-sm whitespace-pre-wrap break-words">{val}</p>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {(designSpecs.main_image_url || designSpecs.banner_image_url) && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Image</p>
                        <img
                          src={designSpecs.main_image_url || designSpecs.banner_image_url}
                          alt="Request image"
                          className="w-full max-w-md rounded border"
                        />
                        <div className="mt-2">
                          <DownloadButton
                            url={designSpecs.main_image_url || designSpecs.banner_image_url}
                            filename={`request-image-${sr.id}.jpg`}
                          />
                        </div>
                      </div>
                    )}

                    {isChangeRequest && designSpecs.new_creative_url && (
                      <div>
                        <p className="text-sm font-semibold mb-2">New creative</p>
                        <img
                          src={designSpecs.new_creative_url}
                          alt="Requested new creative"
                          className="w-full max-w-md rounded border"
                        />
                        <div className="mt-2">
                          <DownloadButton url={designSpecs.new_creative_url} filename={`change-${sr.id}.jpg`} />
                        </div>
                      </div>
                    )}

                    {isChangeRequest && designSpecs.current_creative_url && (
                      <div>
                        <p className="text-sm font-semibold mb-2 text-muted-foreground">Current creative</p>
                        <img
                          src={designSpecs.current_creative_url}
                          alt="Current creative"
                          className="w-full max-w-md rounded border opacity-80"
                        />
                      </div>
                    )}

                    {screenshots.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Screenshots ({screenshots.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {screenshots.map((url, idx) => (
                            <div key={idx} className="space-y-1">
                              <a href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Screenshot ${idx + 1}`} className="w-full rounded border hover:opacity-90" />
                              </a>
                              <DownloadButton url={url} filename={`screenshot-${idx + 1}.jpg`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {sr.resolution_notes && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Resolution Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{sr.resolution_notes}</p>
                      </div>
                    )}
                  </>
                );
              })()}

              {selectedGridItem.type === 'email_blast' && (() => {
                const blast = selectedGridItem.data;
                const scheduledDate = blast.scheduled_date ? new Date(blast.scheduled_date + 'T00:00:00') : null;
                const isFuture = scheduledDate && scheduledDate >= new Date(new Date().toDateString());
                return (
                  <>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Title</p>
                      <p>{blast.title}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Subject Line</p>
                      <p className="text-sm">{blast.subject_line}</p>
                    </div>
                    {blast.scheduled_date && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Scheduled Date</p>
                        <p className="text-sm">{format(new Date(blast.scheduled_date + 'T00:00:00'), 'MMMM d, yyyy')}</p>
                      </div>
                    )}
                    {isFuture && (
                      <div className="pt-2 border-t">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={processingId === blast.id}
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset for Resubmission
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reset for Resubmission?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete the submitted content for "{blast.title}" and allow the client to resubmit fresh. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleResetBlast(blast.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Reset Blast
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Blast Preview Dialog */}
      <EmailBlastPreview
        open={!!previewBlastId}
        onOpenChange={(open) => { if (!open) setPreviewBlastId(null); }}
        blastId={previewBlastId || ''}
      />
    </div>
  );
}
