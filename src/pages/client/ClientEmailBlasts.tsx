import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Calendar, Globe, Loader2, FileEdit, Eye, Send, Megaphone, Image, Search, ArrowUpDown, ChevronLeft, ChevronRight, Palette, MessageSquarePlus } from 'lucide-react';
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns';
import { EmailBlastStats } from '@/components/EmailBlastStats';
import { EmailBlastPreview } from '@/components/EmailBlastPreview';
import { EmailSponsorshipPreview } from '@/components/EmailSponsorshipPreview';
import { DesignRequestDialog } from '@/components/DesignRequestDialog';
import { ChangeRequestDialog, type ChangeRequestTarget } from '@/components/ChangeRequestDialog';
import { useEmailMarketingViewState, type EmailTab, type SortOption } from '@/hooks/useEmailMarketingViewState';

// Assignment-based interfaces that include optional submission data
interface EmailBlastAssignment {
  id: string;
  assignment_name: string;
  due_date: string | null;
  site_id: string;
  site?: { name: string };
  submission?: {
    id: string;
    title: string;
    subject_line: string;
    main_image_url: string;
    status: string;
    scheduled_date: string | null;
    submitted_at: string | null;
    published_at: string | null;
    beehiiv_post_url: string | null;
    mailchimp_campaign_id: string | null;
    mailchimp_campaign_url: string | null;
  } | null;
}

interface EmailSponsorshipAssignment {
  id: string;
  assignment_name: string;
  due_date: string | null;
  site_id: string;
  site?: { name: string };
  submission?: {
    id: string;
    banner_image_url: string;
    click_url: string;
    status: string;
    week_start_date: string;
    submission_deadline: string;
    submitted_at: string | null;
    review_notes: string | null;
  } | null;
}

type UnifiedItem =
  | { type: 'blast'; data: EmailBlastAssignment }
  | { type: 'sponsorship'; data: EmailSponsorshipAssignment };

const ITEMS_PER_PAGE = 10;

// --- Helpers ---

function isActionNeeded(item: UnifiedItem): boolean {
  if (item.type === 'blast') {
    const status = item.data.submission?.status;
    return !status || status === 'draft';
  }
  const status = item.data.submission?.status;
  return !status || status === 'pending' || status === 'rejected';
}

function isCompleted(item: UnifiedItem): boolean {
  if (item.type === 'blast') {
    return item.data.submission?.status === 'submitted' || item.data.submission?.status === 'published';
  }
  return item.data.submission?.status === 'approved' || item.data.submission?.status === 'published';
}

function getItemName(item: UnifiedItem): string {
  if (item.type === 'blast') {
    return item.data.submission?.title || item.data.assignment_name;
  }
  return item.data.assignment_name;
}

function getItemDueDate(item: UnifiedItem): string | null {
  return item.data.due_date;
}

function getSearchableText(item: UnifiedItem): string {
  const parts = [item.data.assignment_name];
  if (item.type === 'blast' && item.data.submission) {
    parts.push(item.data.submission.title, item.data.submission.subject_line);
  }
  return parts.join(' ').toLowerCase();
}

function compareBySortOption(a: UnifiedItem, b: UnifiedItem, sort: SortOption): number {
  switch (sort) {
    case 'due_date_asc': {
      const aDate = getItemDueDate(a) || '';
      const bDate = getItemDueDate(b) || '';
      return aDate.localeCompare(bDate);
    }
    case 'due_date_desc': {
      const aDate = getItemDueDate(a) || '';
      const bDate = getItemDueDate(b) || '';
      return bDate.localeCompare(aDate);
    }
    case 'name_asc':
      return getItemName(a).localeCompare(getItemName(b));
    case 'name_desc':
      return getItemName(b).localeCompare(getItemName(a));
    default:
      return 0;
  }
}

export default function ClientEmailBlasts() {
  const { activeOrganizationId } = useAuth();
  const navigate = useNavigate();

  const [blastAssignments, setBlastAssignments] = useState<EmailBlastAssignment[]>([]);
  const [sponsorshipAssignments, setSponsorshipAssignments] = useState<EmailSponsorshipAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [previewBlastId, setPreviewBlastId] = useState<string | null>(null);
  const [previewSponsorshipId, setPreviewSponsorshipId] = useState<string | null>(null);
  const [submittedPage, setSubmittedPage] = useState(1);
  const [showDesignRequest, setShowDesignRequest] = useState(false);
  const [changeRequestTarget, setChangeRequestTarget] = useState<ChangeRequestTarget | null>(null);

  const {
    activeTab,
    setActiveTab,
    currentSort,
    updateSortForTab,
    searchTerm,
    setSearchTerm,
  } = useEmailMarketingViewState();

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (activeOrganizationId) loadData();
  }, [activeOrganizationId]);

  // Reset pagination when tab/search/sort changes
  useEffect(() => {
    setSubmittedPage(1);
  }, [activeTab, debouncedSearch, currentSort]);

  // --- Data loading (unchanged business logic) ---
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [blastAssignmentsRes, sponsorshipAssignmentsRes] = await Promise.all([
        supabase
          .from('post_assignments')
          .select('id, assignment_name, due_date, site_id, site:sites_public(name)')
          .eq('organization_id', activeOrganizationId)
          .eq('content_category', 'email_blast')
          .order('due_date', { ascending: true }),
        supabase
          .from('post_assignments')
          .select('id, assignment_name, due_date, site_id, site:sites_public(name)')
          .eq('organization_id', activeOrganizationId)
          .eq('content_category', 'email_sponsorship')
          .order('due_date', { ascending: true }),
      ]);

      if (blastAssignmentsRes.error) throw blastAssignmentsRes.error;
      if (sponsorshipAssignmentsRes.error) throw sponsorshipAssignmentsRes.error;

      const blastAssignmentIds = (blastAssignmentsRes.data || []).map(a => a.id);
      const sponsorshipAssignmentIds = (sponsorshipAssignmentsRes.data || []).map(a => a.id);

      const [blastsRes, sponsorshipsRes] = await Promise.all([
        blastAssignmentIds.length > 0
          ? supabase
              .from('email_blasts')
              .select('id, assignment_id, title, subject_line, main_image_url, status, scheduled_date, submitted_at, published_at, beehiiv_post_url, mailchimp_campaign_id, mailchimp_campaign_url')
              .in('assignment_id', blastAssignmentIds)
          : Promise.resolve({ data: [], error: null }),
        sponsorshipAssignmentIds.length > 0
          ? supabase
              .from('email_sponsorships')
              .select('id, assignment_id, banner_image_url, click_url, status, week_start_date, submission_deadline, submitted_at, review_notes')
              .in('assignment_id', sponsorshipAssignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (blastsRes.error) throw blastsRes.error;
      if (sponsorshipsRes.error) throw sponsorshipsRes.error;

      const blastsMap = new Map((blastsRes.data || []).map(b => [b.assignment_id, b]));
      const sponsorshipsMap = new Map((sponsorshipsRes.data || []).map(s => [s.assignment_id, s]));

      const formattedBlasts: EmailBlastAssignment[] = (blastAssignmentsRes.data || []).map(a => {
        const sub = blastsMap.get(a.id);
        return {
          id: a.id,
          assignment_name: a.assignment_name,
          due_date: a.due_date,
          site_id: a.site_id,
          site: Array.isArray(a.site) ? a.site[0] : a.site,
          submission: sub ? {
            id: sub.id, title: sub.title, subject_line: sub.subject_line,
            main_image_url: sub.main_image_url, status: sub.status,
            scheduled_date: sub.scheduled_date, submitted_at: sub.submitted_at,
            published_at: sub.published_at, beehiiv_post_url: sub.beehiiv_post_url,
            mailchimp_campaign_id: sub.mailchimp_campaign_id, mailchimp_campaign_url: sub.mailchimp_campaign_url,
          } : null,
        };
      });

      const formattedSponsorships: EmailSponsorshipAssignment[] = (sponsorshipAssignmentsRes.data || []).map(a => {
        const sub = sponsorshipsMap.get(a.id);
        return {
          id: a.id,
          assignment_name: a.assignment_name,
          due_date: a.due_date,
          site_id: a.site_id,
          site: Array.isArray(a.site) ? a.site[0] : a.site,
          submission: sub ? {
            id: sub.id, banner_image_url: sub.banner_image_url, click_url: sub.click_url,
            status: sub.status, week_start_date: sub.week_start_date,
            submission_deadline: sub.submission_deadline, submitted_at: sub.submitted_at,
            review_notes: sub.review_notes,
          } : null,
        };
      });

      setBlastAssignments(formattedBlasts);
      setSponsorshipAssignments(formattedSponsorships);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Unified items ---
  const allItems: UnifiedItem[] = useMemo(() => [
    ...blastAssignments.map(data => ({ type: 'blast' as const, data })),
    ...sponsorshipAssignments.map(data => ({ type: 'sponsorship' as const, data })),
  ], [blastAssignments, sponsorshipAssignments]);

  // --- Filtering + sorting pipeline ---
  const filteredAndSorted = useMemo(() => {
    // 1. Tab filter
    let items = allItems;
    if (activeTab === 'blasts') items = items.filter(i => i.type === 'blast');
    if (activeTab === 'sponsorships') items = items.filter(i => i.type === 'sponsorship');
    if (activeTab === 'submitted') items = items.filter(isCompleted);

    // 2. Search filter
    if (debouncedSearch) {
      items = items.filter(i => getSearchableText(i).includes(debouncedSearch));
    }

    // 3. Smart sort
    if (activeTab === 'submitted') {
      return [...items].sort((a, b) => compareBySortOption(a, b, currentSort));
    }

    // For non-submitted tabs: action-needed first, then completed
    const needsAction = items.filter(isActionNeeded);
    const completed = items.filter(isCompleted);
    needsAction.sort((a, b) => compareBySortOption(a, b, currentSort));
    completed.sort((a, b) => compareBySortOption(a, b, currentSort));
    return [...needsAction, ...completed];
  }, [allItems, activeTab, debouncedSearch, currentSort]);

  // Tab counts
  const counts = useMemo(() => {
    const search = debouncedSearch;
    const matchSearch = (i: UnifiedItem) => !search || getSearchableText(i).includes(search);
    return {
      all: allItems.filter(matchSearch).length,
      blasts: allItems.filter(i => i.type === 'blast' && matchSearch(i)).length,
      sponsorships: allItems.filter(i => i.type === 'sponsorship' && matchSearch(i)).length,
      submitted: allItems.filter(i => isCompleted(i) && matchSearch(i)).length,
    };
  }, [allItems, debouncedSearch]);

  // Pagination for submitted tab
  const paginatedItems = useMemo(() => {
    if (activeTab !== 'submitted') return filteredAndSorted;
    const start = (submittedPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSorted.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSorted, activeTab, submittedPage]);

  const totalSubmittedPages = Math.max(1, Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE));

  // --- Badge / indicator helpers (unchanged) ---
  const getBlastStatusBadge = (assignment: EmailBlastAssignment) => {
    if (!assignment.submission) return <Badge variant="outline">Not Started</Badge>;
    const status = assignment.submission.status;
    if (status === 'draft') return <Badge variant="secondary">Draft</Badge>;
    if (status === 'submitted') return <Badge variant="default">Submitted</Badge>;
    if (status === 'published') return <Badge className="bg-green-500 hover:bg-green-600">Published</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const getSponsorshipStatusBadge = (assignment: EmailSponsorshipAssignment) => {
    if (!assignment.submission) return <Badge variant="outline">Not Started</Badge>;
    const status = assignment.submission.status;
    if (status === 'pending') return <Badge variant="secondary">Pending Approval</Badge>;
    if (status === 'approved') return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
    if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
    if (status === 'published') return <Badge className="bg-green-500 hover:bg-green-600">Published</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const getDeadlineIndicator = (deadline: string | null, hasSubmission: boolean, submissionStatus?: string) => {
    if (!deadline) return null;
    if (hasSubmission && submissionStatus !== 'draft' && submissionStatus !== 'pending' && submissionStatus !== 'rejected') return null;
    const date = parseISO(deadline);
    if (isPast(date) && !isToday(date)) return <span className="text-destructive text-xs font-medium">Overdue</span>;
    if (isToday(date)) return <span className="text-amber-600 dark:text-amber-500 text-xs font-medium">Due today</span>;
    if (isTomorrow(date)) return <span className="text-amber-600 dark:text-amber-500 text-xs font-medium">Due tomorrow</span>;
    return null;
  };

  // --- Card renderers (unchanged) ---
  const renderBlastCard = (assignment: EmailBlastAssignment) => {
    const submission = assignment.submission;
    const title = submission?.title || assignment.assignment_name;
    const subjectLine = submission?.subject_line;
    const imageUrl = submission?.main_image_url;
    const scheduledDate = submission?.scheduled_date || assignment.due_date;

    return (
      <Card key={assignment.id} className="overflow-hidden border-l-4 border-l-blue-500">
        <div className="flex bg-blue-50/30 dark:bg-blue-950/20">
          {imageUrl && (
            <div className="w-24 h-24 flex-shrink-0">
              <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{title}</h3>
                {subjectLine && <p className="text-sm text-muted-foreground truncate">{subjectLine}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">
                    <Megaphone className="h-3 w-3 mr-1" />Blast
                  </Badge>
                  {getBlastStatusBadge(assignment)}
                </div>
                {getDeadlineIndicator(scheduledDate, !!submission, submission?.status)}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {scheduledDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(parseISO(scheduledDate), 'MMM d, yyyy')}</span>
                </div>
              )}
              {assignment.site?.name && (
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3" /><span>{assignment.site.name}</span>
                </div>
              )}
            </div>
            {submission?.status === 'published' && (
              <div className="mt-2">
                <EmailBlastStats
                  blastId={submission.id}
                  siteId={assignment.site_id}
                  isPublished={true}
                  platform={submission.mailchimp_campaign_id ? 'mailchimp' : 'beehiiv'}
                  compact={true}
                />
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {!submission && (
                <Button variant="default" size="sm" onClick={() => navigate(`/client/submit-blast?assignment=${assignment.id}`)}>
                  <Send className="h-3 w-3 mr-1" />Submit
                </Button>
              )}
              {submission?.status === 'draft' && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/client/submit-blast?draft=${submission.id}`)}>
                  <FileEdit className="h-3 w-3 mr-1" />Edit
                </Button>
              )}
              {submission && (
                <Button variant="ghost" size="sm" onClick={() => setPreviewBlastId(submission.id)}>
                  <Eye className="h-3 w-3 mr-1" />View
                </Button>
              )}
              {(submission?.beehiiv_post_url || submission?.mailchimp_campaign_url) && (
                <Button variant="outline" size="sm" onClick={() => window.open((submission.beehiiv_post_url || submission.mailchimp_campaign_url)!, '_blank')}>
                  <Eye className="h-3 w-3 mr-1" />View in {submission.beehiiv_post_url ? 'Beehiiv' : 'Mailchimp'}
                </Button>
              )}
              {(submission?.status === 'submitted' || submission?.status === 'published') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangeRequestTarget({
                    type: 'email_blast',
                    entityId: submission.id,
                    name: title,
                    currentImageUrl: submission.main_image_url,
                  })}
                >
                  <MessageSquarePlus className="h-3 w-3 mr-1" />Request changes
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderSponsorshipCard = (assignment: EmailSponsorshipAssignment) => {
    const submission = assignment.submission;
    const weekDate = submission?.week_start_date || assignment.due_date;
    const deadline = submission?.submission_deadline || assignment.due_date;

    return (
      <Card key={assignment.id} className="overflow-hidden border-l-4 border-l-purple-500">
        <div className="flex flex-col bg-purple-50/30 dark:bg-purple-950/20">
          {submission?.banner_image_url && (
            <div className="w-full h-[52.5px] bg-muted overflow-hidden">
              <img src={submission.banner_image_url} alt="Sponsorship banner" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground">
                  {weekDate ? `Week of ${format(parseISO(weekDate), 'MMM d, yyyy')}` : assignment.assignment_name}
                </h3>
                <p className="text-sm text-muted-foreground truncate">{assignment.assignment_name}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900/50 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300">
                    <Image className="h-3 w-3 mr-1" />Sponsorship
                  </Badge>
                  {getSponsorshipStatusBadge(assignment)}
                </div>
                {getDeadlineIndicator(deadline, !!submission, submission?.status)}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {deadline && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Deadline: {format(parseISO(deadline), 'MMM d')}</span>
                </div>
              )}
              {assignment.site?.name && (
                <div className="flex items-center gap-1">
                  <Globe className="h-3 w-3" /><span>{assignment.site.name}</span>
                </div>
              )}
            </div>
            {submission?.status === 'rejected' && submission.review_notes && (
              <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                <strong>Reason:</strong> {submission.review_notes}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {!submission && (
                <Button variant="default" size="sm" onClick={() => navigate(`/client/submit-sponsorship?assignment=${assignment.id}`)}>
                  <Send className="h-3 w-3 mr-1" />Submit
                </Button>
              )}
              {submission?.status === 'pending' && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/client/submit-sponsorship?draft=${submission.id}`)}>
                  <FileEdit className="h-3 w-3 mr-1" />Edit
                </Button>
              )}
              {submission?.status === 'rejected' && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/client/submit-sponsorship?draft=${submission.id}`)}>
                  <FileEdit className="h-3 w-3 mr-1" />Resubmit
                </Button>
              )}
              {submission && (
                <Button variant="ghost" size="sm" onClick={() => setPreviewSponsorshipId(submission.id)}>
                  <Eye className="h-3 w-3 mr-1" />View
                </Button>
              )}
              {(submission?.status === 'approved' || submission?.status === 'published') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChangeRequestTarget({
                    type: 'email_sponsorship',
                    entityId: submission.id,
                    name: weekDate ? `Week of ${format(parseISO(weekDate), 'MMM d, yyyy')}` : assignment.assignment_name,
                    currentClickUrl: submission.click_url,
                    currentImageUrl: submission.banner_image_url,
                  })}
                >
                  <MessageSquarePlus className="h-3 w-3 mr-1" />Request changes
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  const renderItem = (item: UnifiedItem) => {
    if (item.type === 'blast') return renderBlastCard(item.data);
    return renderSponsorshipCard(item.data);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as EmailTab);
  };

  const handleSortChange = (value: string) => {
    updateSortForTab(activeTab, value as SortOption);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Marketing</h1>
          <p className="text-muted-foreground mt-1">Manage your email blasts and sponsorship banners</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDesignRequest(true)}>
          <Palette className="h-4 w-4 mr-2" />
          Request Design
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : blastAssignments.length === 0 && sponsorshipAssignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No email marketing content</h3>
            <p className="text-muted-foreground text-center mt-1 max-w-sm">
              Email blasts and sponsorships will appear here once you have assignments.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Recent ({counts.all})</TabsTrigger>
            <TabsTrigger value="blasts">Blasts ({counts.blasts})</TabsTrigger>
            <TabsTrigger value="sponsorships">Sponsorships ({counts.sponsorships})</TabsTrigger>
            <TabsTrigger value="submitted">Submitted ({counts.submitted})</TabsTrigger>
          </TabsList>

          {/* Search + Sort bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, or subject..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={currentSort} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[200px]">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_date_asc">Date (oldest first)</SelectItem>
                <SelectItem value="due_date_desc">Date (newest first)</SelectItem>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Single content area for all tabs */}
          {['all', 'blasts', 'sponsorships', 'submitted'].map(tab => (
            <TabsContent key={tab} value={tab}>
              <div className="space-y-3">
                {(activeTab === 'submitted' ? paginatedItems : filteredAndSorted).length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {debouncedSearch
                        ? 'No items match your search'
                        : tab === 'submitted'
                          ? 'No submitted items yet'
                          : 'No items in this category'}
                    </CardContent>
                  </Card>
                ) : (
                  (activeTab === 'submitted' ? paginatedItems : filteredAndSorted).map(renderItem)
                )}

                {/* Pagination for submitted tab */}
                {activeTab === 'submitted' && totalSubmittedPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={submittedPage <= 1}
                      onClick={() => setSubmittedPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {submittedPage} of {totalSubmittedPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={submittedPage >= totalSubmittedPages}
                      onClick={() => setSubmittedPage(p => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Preview Dialogs */}
      <EmailBlastPreview
        open={!!previewBlastId}
        onOpenChange={(open) => !open && setPreviewBlastId(null)}
        blastId={previewBlastId || ''}
      />
      <EmailSponsorshipPreview
        open={!!previewSponsorshipId}
        onOpenChange={(open) => !open && setPreviewSponsorshipId(null)}
        sponsorshipId={previewSponsorshipId || ''}
      />
      <DesignRequestDialog
        open={showDesignRequest}
        onOpenChange={setShowDesignRequest}
        defaultType="email_blast"
      />
      <ChangeRequestDialog
        open={!!changeRequestTarget}
        onOpenChange={(o) => !o && setChangeRequestTarget(null)}
        target={changeRequestTarget}
      />
    </div>
  );
}
