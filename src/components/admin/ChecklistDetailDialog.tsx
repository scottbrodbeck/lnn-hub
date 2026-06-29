import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Mail,
  Image,
  Globe,
  Building2,
  Calendar,
  User,
  Clock,
  RefreshCw,
  ExternalLink,
  ClipboardList,
  StickyNote,
  Download,
  MessageSquare,
} from 'lucide-react';
import { WordPressScheduleControl, WpPostInfo, ScheduleConflict } from '@/components/admin/WordPressScheduleControl';

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
    window.open(url, '_blank');
  }
};

interface PostDetails {
  id: string;
  headline: string;
  status: string;
  wordpress_post_url: string | null;
  created_at: string;
  wordpress_post_id: number | null;
  wordpress_site_id: string | null;
}

export interface ChecklistItem {
  id: string;
  type: 'post' | 'email_blast' | 'email_sponsorship' | 'assignment' | 'social_post';
  title: string;
  siteName: string | null;
  organizationName: string | null;
  status: string;
  isChecked: boolean;
  rawData: any;
  dueDate?: string;
  // Assignment-specific
  assignedTo?: string;
  notes?: string;
  startedAt?: string;
  recurrenceType?: string;
  submittedPostId?: string;
  postDetails?: PostDetails;
  // Email blast-specific
  subjectLine?: string;
  submittedAt?: string;
  publishedAt?: string;
  beehiivUrl?: string;
  mailchimpUrl?: string;
  // Email sponsorship-specific
  submissionDeadline?: string;
  bannerImageUrl?: string;
  // Social post-specific
  socialPosts?: Array<{ text?: string; type?: string; edited?: boolean }>;
  wordpressPostUrl?: string | null;
  // Synthesized blast/sponsorship items (no submission row yet)
  assignmentId?: string;
  hasSubmission?: boolean;

}

interface ChecklistDetailDialogProps {
  item: ChecklistItem | null;
  onClose: () => void;
  // Live WordPress status map, owned by DailyChecklistContent (kept out of
  // ChecklistItem so the open dialog stays live as statuses stream in)
  wpInfoByPostId?: Record<string, WpPostInfo>;
  onWpInfoChanged?: (postId: string, info: WpPostInfo) => void;
  findConflict?: (instant: Date) => ScheduleConflict[];
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'post':
      return <FileText className="h-5 w-5" />;
    case 'assignment':
      return <ClipboardList className="h-5 w-5" />;
    case 'email_blast':
      return <Mail className="h-5 w-5" />;
    case 'email_sponsorship':
      return <Image className="h-5 w-5" />;
    case 'social_post':
      return <MessageSquare className="h-5 w-5" />;
    default:
      return null;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary" className="capitalize">Pending</Badge>;
    case 'in_progress':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">In Progress</Badge>;
    case 'submitted':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Submitted</Badge>;
    case 'completed':
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Completed</Badge>;
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'published':
      return <Badge className="bg-green-600">Published</Badge>;
    default:
      return <Badge variant="secondary" className="capitalize">{status}</Badge>;
  }
};

const formatRecurrence = (recurrenceType: string | undefined) => {
  if (!recurrenceType) return null;
  switch (recurrenceType) {
    case 'one_time':
      return 'One-time';
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Biweekly';
    case 'monthly':
      return 'Monthly';
    default:
      return recurrenceType;
  }
};

export function ChecklistDetailDialog({ item, onClose, wpInfoByPostId, onWpInfoChanged, findConflict }: ChecklistDetailDialogProps) {
  if (!item) return null;

  const renderAssignmentDetails = () => (
    <>
      {/* Additional assignment info */}
      {(item.assignedTo || item.recurrenceType || item.notes) && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            {item.assignedTo && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Assigned To</p>
                  <p className="text-sm">{item.assignedTo}</p>
                </div>
              </div>
            )}
            {item.recurrenceType && (
              <div className="flex items-start gap-2">
                <RefreshCw className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Recurrence</p>
                  <p className="text-sm">{formatRecurrence(item.recurrenceType)}</p>
                </div>
              </div>
            )}
            {item.notes && (
              <div className="flex items-start gap-2">
                <StickyNote className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Submission info */}
      {(item.startedAt || item.postDetails) && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            {item.startedAt && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Started At</p>
                  <p className="text-sm">{format(new Date(item.startedAt), 'MMM d, yyyy h:mm a')}</p>
                </div>
              </div>
            )}
            {item.postDetails && (
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Submitted Post</p>
                    <p className="text-sm">{item.postDetails.headline}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.postDetails.created_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                  {item.postDetails.wordpress_post_id && onWpInfoChanged && (
                    <WordPressScheduleControl
                      postId={item.postDetails.id}
                      info={wpInfoByPostId?.[item.postDetails.id]}
                      onWpInfoChanged={onWpInfoChanged}
                      findConflict={findConflict}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  const renderEmailBlastDetails = () => (
    <>
      {(item.subjectLine || item.submittedAt || item.publishedAt) && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            {item.subjectLine && (
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject Line</p>
                  <p className="text-sm">{item.subjectLine}</p>
                </div>
              </div>
            )}
            {item.submittedAt && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Submitted At</p>
                  <p className="text-sm">{format(new Date(item.submittedAt), 'MMM d, yyyy h:mm a')}</p>
                </div>
              </div>
            )}
            {item.publishedAt && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Published At</p>
                  <p className="text-sm">{format(new Date(item.publishedAt), 'MMM d, yyyy h:mm a')}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  const renderEmailSponsorshipDetails = () => (
    <>
      {(item.submittedAt || item.submissionDeadline) && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            {item.submittedAt && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Submitted At</p>
                  <p className="text-sm">{format(new Date(item.submittedAt), 'MMM d, yyyy h:mm a')}</p>
                </div>
              </div>
            )}
            {item.submissionDeadline && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Submission Deadline</p>
                  <p className="text-sm">{format(new Date(item.submissionDeadline), 'MMM d, yyyy')}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {item.rawData?.click_url && (
        <>
          <Separator className="my-4" />
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Click URL</p>
            <a 
              href={item.rawData.click_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {item.rawData.click_url}
            </a>
          </div>
        </>
      )}

      {item.bannerImageUrl && (
        <>
          <Separator className="my-4" />
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Banner Image</p>
            <img 
              src={item.bannerImageUrl} 
              alt="Sponsorship banner" 
              className="w-full max-w-md rounded border"
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => handleImageDownload(item.bannerImageUrl!, `sponsorship-banner.jpg`)}
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </>
      )}
    </>
  );

  const renderSocialPostDetails = () => (
    <>
      <Separator className="my-4" />
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Selected social posts (non-default — please schedule manually)
        </p>
        {(item.socialPosts || []).map((p, i) => (
          <div key={i} className="rounded border border-border bg-muted/30 p-2 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
              {p.type && (
                <Badge variant="outline" className="text-[10px] capitalize">{p.type}</Badge>
              )}
              <Badge variant={p.edited ? 'default' : 'secondary'} className="text-[10px]">
                {p.edited ? 'Edited' : 'Default'}
              </Badge>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{p.text}</p>
          </div>
        ))}
      </div>
    </>
  );

  const renderActionButtons = () => {
    const buttons: React.ReactNode[] = [];

    if (item.type === 'assignment') {
      if (item.postDetails?.wordpress_post_url) {
        buttons.push(
          <Button
            key="wordpress"
            variant="outline"
            size="sm"
            onClick={() => window.open(item.postDetails!.wordpress_post_url!, '_blank')}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View on WordPress
          </Button>
        );
      }
    }

    if (item.type === 'email_blast' && item.beehiivUrl) {
      buttons.push(
        <Button
          key="beehiiv"
          variant="outline"
          size="sm"
          onClick={() => window.open(item.beehiivUrl, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Beehiiv
        </Button>
      );
    }

    if (item.type === 'email_blast' && item.mailchimpUrl) {
      buttons.push(
        <Button
          key="mailchimp"
          variant="outline"
          size="sm"
          onClick={() => window.open(item.mailchimpUrl, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Mailchimp
        </Button>
      );
    }

    if (item.type === 'email_sponsorship' && item.rawData?.click_url) {
      buttons.push(
        <Button
          key="clickurl"
          variant="outline"
          size="sm"
          onClick={() => window.open(item.rawData.click_url, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Click URL
        </Button>
      );
    }

    if (item.type === 'social_post' && item.wordpressPostUrl) {
      buttons.push(
        <Button
          key="wp-social"
          variant="outline"
          size="sm"
          onClick={() => window.open(item.wordpressPostUrl!, '_blank')}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Post
        </Button>
      );
    }

    return buttons.length > 0 ? (
      <DialogFooter className="flex-row gap-2 sm:justify-start">
        {buttons}
      </DialogFooter>
    ) : null;
  };

  return (
    <Dialog open={!!item} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getTypeIcon(item.type)}
            <span className="line-clamp-2">{item.title}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Basic info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Type</p>
              <p className="capitalize">
                {item.type === 'assignment' ? 'Post Assignment' : item.type.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              {getStatusBadge(item.status)}
            </div>
            {item.siteName && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Site</p>
                <p className="flex items-center gap-1 text-sm">
                  <Globe className="h-3 w-3" />
                  {item.siteName}
                </p>
              </div>
            )}
            {item.organizationName && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Organization</p>
                <p className="flex items-center gap-1 text-sm">
                  <Building2 className="h-3 w-3" />
                  {item.organizationName}
                </p>
              </div>
            )}
            {item.dueDate && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Due Date</p>
                <p className="text-sm">{format(new Date(item.dueDate), 'MMM d, yyyy')}</p>
              </div>
            )}
          </div>

          {/* Type-specific details */}
          {item.type === 'assignment' && renderAssignmentDetails()}
          {item.type === 'email_blast' && renderEmailBlastDetails()}
          {item.type === 'email_sponsorship' && renderEmailSponsorshipDetails()}
          {item.type === 'social_post' && renderSocialPostDetails()}
        </div>

        {renderActionButtons()}
      </DialogContent>
    </Dialog>
  );
}
