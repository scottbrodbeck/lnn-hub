import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { format, startOfDay, endOfDay } from 'date-fns';
import { Calendar, Building2, Globe, Check, ClipboardList, Mail, Image, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateAllCalendarEvents, GeneratedEvent, AssignmentInstance } from '@/lib/recurrenceUtils';
import { ChecklistDetailDialog, ChecklistItem } from './ChecklistDetailDialog';
import { WordPressScheduleControl, WpPostInfo, ScheduleConflict } from './WordPressScheduleControl';
import { areSocialPostsDefault } from '@/lib/socialPostText';

interface DailyChecklistContentProps {
  onUncheckedCountChange?: (count: number) => void;
}

const getAssignmentStatus = (event: GeneratedEvent): string => {
  if (event.resource.is_completed) return 'completed';
  if (event.resource.submitted_post_id || event.instanceRecord?.submitted_post_id) return 'submitted';
  if (event.resource.started_at || event.instanceRecord?.started_at) return 'in_progress';
  return 'pending';
};

export function DailyChecklistContent({ onUncheckedCountChange }: DailyChecklistContentProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [wpInfoByPostId, setWpInfoByPostId] = useState<Record<string, WpPostInfo>>({});
  const [wpStatusLoading, setWpStatusLoading] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    fetchChecklistItems();
  }, []);

  useEffect(() => {
    const unchecked = items.filter(i => !i.isChecked).length;
    onUncheckedCountChange?.(unchecked);
  }, [items, onUncheckedCountChange]);

  const fetchChecklistItems = async () => {
    try {
      const todayDate = new Date();
      const todayStart = startOfDay(todayDate);
      const todayEnd = endOfDay(todayDate);

      // Fetch all assignments (all categories) with profile info
      const { data: assignments } = await supabase
        .from('post_assignments')
        .select(`
          *,
          site:sites(name, url),
          organization:organizations(name),
          assigned_user:profiles!assigned_to(full_name, email)
        `);

      // Fetch all assignment instances
      const { data: instances } = await supabase
        .from('assignment_instances')
        .select('*');

      // Generate events for today only (across all categories)
      const todayEvents = generateAllCalendarEvents(
        assignments || [],
        todayStart,
        todayEnd,
        (instances || []) as AssignmentInstance[]
      );

      // Partition by content_category
      const websiteEvents = todayEvents.filter(e => e.resource.content_category === 'website');
      const blastEvents = todayEvents.filter(e => e.resource.content_category === 'email_blast');
      const sponsorshipEvents = todayEvents.filter(e => e.resource.content_category === 'email_sponsorship');

      // Get submitted post IDs for fetching post details (website only)
      const submittedPostIds = websiteEvents
        .filter(event => event.resource.submitted_post_id || event.instanceRecord?.submitted_post_id)
        .map(event => event.instanceRecord?.submitted_post_id || event.resource.submitted_post_id)
        .filter(Boolean);

      // Fetch submitted post details
      let postsMap = new Map<string, any>();
      if (submittedPostIds.length > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, headline, status, wordpress_post_url, created_at, wordpress_post_id, wordpress_site_id')
          .in('id', submittedPostIds);
        
        if (posts) {
          posts.forEach(post => postsMap.set(post.id, post));
        }
      }

      // Show all items scheduled for today (including completed/submitted ones)
      // since the daily checklist is for admin review, not just tracking incomplete tasks
      const assignmentItems: ChecklistItem[] = websiteEvents
        .filter(event => !event.resource.is_skipped)
        .map(event => {
          const submittedPostId = event.instanceRecord?.submitted_post_id || event.resource.submitted_post_id;
          const postDetails = submittedPostId ? postsMap.get(submittedPostId) : undefined;
          const startedAt = event.instanceRecord?.started_at || event.resource.started_at;
          
          return {
            id: event.id,
            type: 'assignment' as const,
            title: event.title,
            siteName: (event.resource.site as any)?.name || null,
            organizationName: (event.resource.organization as any)?.name || null,
            status: getAssignmentStatus(event),
            isChecked: false,
            rawData: event,
            dueDate: event.resource.due_date,
            // Assignment-specific fields
            assignedTo: (event.resource.assigned_user as any)?.full_name || null,
            notes: event.resource.notes || null,
            startedAt: startedAt || null,
            recurrenceType: event.resource.recurrence_type,
            submittedPostId: submittedPostId || null,
            postDetails: postDetails || null,
          };
        });

      // Fetch email_blasts by assignment_id for all blast assignments due today
      const blastAssignmentIds = blastEvents.map(e => e.originalId).filter(Boolean);
      let blastsByAssignmentId = new Map<string, any>();
      if (blastAssignmentIds.length > 0) {
        const { data: blastsForAssignments } = await supabase
          .from('email_blasts')
          .select(`
            id, title, status, scheduled_date, subject_line, assignment_id,
            submitted_at, published_at, beehiiv_post_url, mailchimp_campaign_url,
            sites(name, url),
            organizations(name)
          `)
          .in('assignment_id', blastAssignmentIds);
        (blastsForAssignments || []).forEach((b: any) => {
          if (b.assignment_id) blastsByAssignmentId.set(b.assignment_id, b);
        });
      }

      const blastsItems: ChecklistItem[] = blastEvents
        .filter(event => !event.resource.is_skipped)
        .map(event => {
          const blast = blastsByAssignmentId.get(event.originalId);
          if (blast) {
            return {
              id: blast.id,
              type: 'email_blast' as const,
              title: blast.title,
              siteName: (blast.sites as any)?.name || (event.resource.site as any)?.name || null,
              organizationName: (blast.organizations as any)?.name || (event.resource.organization as any)?.name || null,
              status: blast.status,
              isChecked: false,
              rawData: blast,
              subjectLine: blast.subject_line,
              submittedAt: blast.submitted_at,
              publishedAt: blast.published_at,
              beehiivUrl: blast.beehiiv_post_url,
              mailchimpUrl: blast.mailchimp_campaign_url,
              assignmentId: event.originalId,
              hasSubmission: true,
            };
          }
          // Synthesized: blast assignment with no email_blasts row yet
          return {
            id: event.id,
            type: 'email_blast' as const,
            title: event.title,
            siteName: (event.resource.site as any)?.name || null,
            organizationName: (event.resource.organization as any)?.name || null,
            status: 'not_started',
            isChecked: false,
            rawData: event,
            assignmentId: event.originalId,
            hasSubmission: false,
          };
        });

      // Fetch email_sponsorships by assignment_id for all sponsorship assignments due today
      const sponsorshipAssignmentIds = sponsorshipEvents.map(e => e.originalId).filter(Boolean);
      let sponsorshipsByAssignmentId = new Map<string, any>();
      if (sponsorshipAssignmentIds.length > 0) {
        const { data: spsForAssignments } = await supabase
          .from('email_sponsorships')
          .select(`
            id, week_start_date, status, click_url, submitted_at, assignment_id,
            submission_deadline, banner_image_url,
            sites(name),
            organizations(name)
          `)
          .in('assignment_id', sponsorshipAssignmentIds);
        (spsForAssignments || []).forEach((s: any) => {
          if (s.assignment_id) sponsorshipsByAssignmentId.set(s.assignment_id, s);
        });
      }

      const sponsorshipsItems: ChecklistItem[] = sponsorshipEvents
        .filter(event => !event.resource.is_skipped)
        .map(event => {
          const sp = sponsorshipsByAssignmentId.get(event.originalId);
          if (sp) {
            return {
              id: sp.id,
              type: 'email_sponsorship' as const,
              title: `Week of ${format(new Date(sp.week_start_date), 'MMM d, yyyy')}`,
              siteName: (sp.sites as any)?.name || (event.resource.site as any)?.name || null,
              organizationName: (sp.organizations as any)?.name || (event.resource.organization as any)?.name || null,
              status: sp.status,
              isChecked: false,
              rawData: sp,
              submittedAt: sp.submitted_at,
              submissionDeadline: sp.submission_deadline,
              bannerImageUrl: sp.banner_image_url,
              assignmentId: event.originalId,
              hasSubmission: true,
            };
          }
          return {
            id: event.id,
            type: 'email_sponsorship' as const,
            title: event.title,
            siteName: (event.resource.site as any)?.name || null,
            organizationName: (event.resource.organization as any)?.name || null,
            status: 'not_started',
            isChecked: false,
            rawData: event,
            assignmentId: event.originalId,
            hasSubmission: false,
          };
        });


      // Fetch posts whose ASSIGNMENT publishes today (one-time due_date or recurring instance_date),
      // not posts merely *created* today. Social-post task surfaces on the day the post goes live.
      const [oneTimeRes, instanceRes] = await Promise.all([
        supabase
          .from('post_assignments')
          .select('submitted_post_id')
          .eq('content_category', 'website')
          .eq('due_date', today)
          .not('submitted_post_id', 'is', null),
        supabase
          .from('assignment_instances')
          .select('submitted_post_id, assignment_id')
          .eq('instance_date', today)
          .not('submitted_post_id', 'is', null),
      ]);

      // Filter recurring instances down to website assignments
      const instanceAssignmentIds = [
        ...new Set((instanceRes.data || []).map((r: any) => r.assignment_id).filter(Boolean) as string[]),
      ];
      let websiteAssignmentIdSet = new Set<string>();
      if (instanceAssignmentIds.length > 0) {
        const { data: paRows } = await supabase
          .from('post_assignments')
          .select('id')
          .in('id', instanceAssignmentIds)
          .eq('content_category', 'website');
        websiteAssignmentIdSet = new Set((paRows || []).map((r: any) => r.id));
      }

      const todayPostIds = [
        ...new Set([
          ...((oneTimeRes.data || []).map((r: any) => r.submitted_post_id).filter(Boolean) as string[]),
          ...((instanceRes.data || [])
            .filter((r: any) => websiteAssignmentIdSet.has(r.assignment_id))
            .map((r: any) => r.submitted_post_id)
            .filter(Boolean) as string[]),
        ]),
      ];

      const { data: socialPostCandidates } = todayPostIds.length
        ? await supabase
            .from('posts')
            .select(`
              id, headline, content, status, social_posts, wordpress_post_url, published_at, created_at, client_id, wordpress_site_id
            `)
            .in('id', todayPostIds)
            .not('social_posts', 'is', null)
        : { data: [] as any[] };

      const extractPosts = (sp: any): Array<{ text?: string; type?: string; edited?: boolean }> | null => {
        if (!sp) return null;
        if (Array.isArray(sp)) return sp;
        if (typeof sp === 'object' && Array.isArray(sp.posts)) return sp.posts;
        return null;
      };

      const socialPostRows = (socialPostCandidates || []).filter(p => {
        const posts = extractPosts(p.social_posts);
        if (!posts || posts.length === 0) return false;
        return !areSocialPostsDefault(posts, p.headline, p.content);
      });

      let orgByClientId: Record<string, string> = {};
      if (socialPostRows.length > 0) {
        const clientIds = [...new Set(socialPostRows.map(p => p.client_id).filter(Boolean))] as string[];
        if (clientIds.length > 0) {
          const { data: uoData } = await supabase
            .from('user_organizations')
            .select('user_id, organization:organizations(name)')
            .in('user_id', clientIds)
            .eq('is_primary', true);
          (uoData || []).forEach((row: any) => {
            if (row.organization?.name) orgByClientId[row.user_id] = row.organization.name;
          });
        }
      }

      let siteByPostId: Record<string, string> = {};
      if (socialPostRows.length > 0) {
        const siteIds = [...new Set(socialPostRows.map(p => p.wordpress_site_id).filter(Boolean))] as string[];
        if (siteIds.length > 0) {
          const { data: sitesData } = await supabase
            .from('sites')
            .select('id, name')
            .in('id', siteIds);
          const nameById: Record<string, string> = {};
          (sitesData || []).forEach((s: any) => { nameById[s.id] = s.name; });
          socialPostRows.forEach(p => {
            if (p.wordpress_site_id && nameById[p.wordpress_site_id]) {
              siteByPostId[p.id] = nameById[p.wordpress_site_id];
            }
          });
        }
      }

      const socialPostItems: ChecklistItem[] = socialPostRows.map(p => {
        const posts = extractPosts(p.social_posts) || [];
        return {
          id: p.id,
          type: 'social_post' as const,
          title: p.headline || '(untitled)',
          siteName: siteByPostId[p.id] || null,
          organizationName: p.client_id ? (orgByClientId[p.client_id] || null) : null,
          status: 'pending',
          isChecked: false,
          rawData: p,
          socialPosts: posts,
          wordpressPostUrl: p.wordpress_post_url || null,
        };
      });

      // Fetch checked status for all items
      const { data: checkedItems } = await supabase
        .from('admin_daily_checklist')
        .select('*')
        .eq('checklist_date', today);

      const checkedMap = new Map(
        (checkedItems || []).map(c => [`${c.item_type}-${c.item_id}`, true])
      );

      // Mark items as checked
      const allItems = [...assignmentItems, ...blastsItems, ...sponsorshipsItems, ...socialPostItems].map(item => ({
        ...item,
        isChecked: checkedMap.has(`${item.type}-${item.id}`),
      }));

      setItems(allItems);

      // Stream in live WordPress statuses without blocking the checklist render
      const wpPostIds = assignmentItems
        .filter(i => i.postDetails?.wordpress_post_id)
        .map(i => i.postDetails!.id);
      if (wpPostIds.length > 0) {
        void fetchWpStatuses(wpPostIds);
      }
    } catch (error: any) {
      console.error('Failed to fetch checklist items:', error);
      toast.error('Failed to load checklist items');
    } finally {
      setLoading(false);
    }
  };

  const fetchWpStatuses = async (postIds: string[]) => {
    setWpStatusLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('wordpress-post-scheduler', {
        body: { action: 'status', post_ids: postIds },
      });
      if (error) throw error;
      if (data?.results) {
        setWpInfoByPostId(prev => ({ ...prev, ...data.results }));
      }
    } catch (error) {
      console.error('Failed to fetch WordPress statuses:', error);
      setWpInfoByPostId(prev => ({
        ...prev,
        ...Object.fromEntries(postIds.map(id => [
          id,
          { wpStatus: 'error' as const, wpScheduledAtGmt: null, error: 'fetch_failed' },
        ])),
      }));
    } finally {
      setWpStatusLoading(false);
    }
  };

  const handleWpInfoChanged = (postId: string, info: WpPostInfo) => {
    setWpInfoByPostId(prev => ({ ...prev, [postId]: info }));
  };

  const handleWpRefresh = () => {
    const wpPostIds = items
      .filter(i => i.type === 'assignment' && i.postDetails?.wordpress_post_id)
      .map(i => i.postDetails!.id);
    if (wpPostIds.length > 0) {
      void fetchWpStatuses(wpPostIds);
    }
  };

  const handleCheckChange = async (item: ChecklistItem, checked: boolean) => {
    if (!user) return;
    setProcessingId(item.id);

    try {
      if (checked) {
        const { error } = await supabase
          .from('admin_daily_checklist')
          .insert({
            item_type: item.type,
            item_id: item.id,
            checklist_date: today,
            checked_by: user.id,
          });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_daily_checklist')
          .delete()
          .eq('item_type', item.type)
          .eq('item_id', item.id)
          .eq('checklist_date', today);

        if (error) throw error;
      }

      // Propagate completion to linked assignment for email blasts and sponsorships
      if (item.type === 'email_sponsorship' || item.type === 'email_blast') {
        try {
          let assignmentId: string | undefined = item.assignmentId;
          if (!assignmentId && item.hasSubmission !== false) {
            // Existing submission row: look up its assignment_id
            const table = item.type === 'email_sponsorship' ? 'email_sponsorships' : 'email_blasts';
            const { data: record } = await supabase
              .from(table)
              .select('assignment_id')
              .eq('id', item.id)
              .maybeSingle();
            assignmentId = record?.assignment_id || undefined;
          }

          if (assignmentId) {
            await supabase
              .from('post_assignments')
              .update({
                is_completed: checked,
                completed_at: checked ? new Date().toISOString() : null,
              })
              .eq('id', assignmentId);
          }
        } catch (e) {
          console.error('Failed to propagate completion to assignment:', e);
        }
      }


      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, isChecked: checked } : i
      ));
    } catch (error: any) {
      console.error('Failed to update checklist:', error);
      toast.error('Failed to update checklist');
    } finally {
      setProcessingId(null);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'post':
      case 'assignment':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Post</Badge>;
      case 'email_blast':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Email Blast</Badge>;
      case 'email_sponsorship':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Sponsorship</Badge>;
      case 'social_post':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Social Posts</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'not_started':
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Not started</Badge>;
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


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'post':
        return <FileText className="h-4 w-4" />;
      case 'assignment':
        return <ClipboardList className="h-4 w-4" />;
      case 'email_blast':
        return <Mail className="h-4 w-4" />;
      case 'email_sponsorship':
        return <Image className="h-4 w-4" />;
      case 'social_post':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nothing scheduled for today</h3>
          <p className="text-muted-foreground">
            No posts, email blasts, or sponsorships are scheduled for {format(new Date(), 'MMMM d, yyyy')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const checkedCount = items.filter(i => i.isChecked).length;

  // Build an index of posts already scheduled for a given site + minute, so we can
  // warn before double-booking a WordPress timeslot.
  const conflictIndex = useMemo(() => {
    const map = new Map<string, ScheduleConflict[]>();
    for (const it of items) {
      if (it.type !== 'assignment') continue;
      const post = it.postDetails;
      if (!post?.id || !post.wordpress_site_id) continue;
      const wp = wpInfoByPostId[post.id];
      if (!wp || wp.wpStatus !== 'future' || !wp.wpScheduledAtGmt) continue;
      const minute = Math.floor(new Date(wp.wpScheduledAtGmt).getTime() / 60000);
      const key = `${post.wordpress_site_id}|${minute}`;
      const entry: ScheduleConflict = {
        postId: post.id,
        headline: post.headline || it.title,
        siteName: it.siteName || undefined,
        instant: new Date(wp.wpScheduledAtGmt),
      };
      const list = map.get(key);
      if (list) list.push(entry); else map.set(key, [entry]);
    }
    return map;
  }, [items, wpInfoByPostId]);

  const makeFindConflict = (currentPostId: string, siteId: string | undefined | null) => {
    return (instant: Date): ScheduleConflict[] => {
      if (!siteId) return [];
      const minute = Math.floor(instant.getTime() / 60000);
      const list = conflictIndex.get(`${siteId}|${minute}`) || [];
      return list.filter(c => c.postId !== currentPostId);
    };
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </span>
        <span>•</span>
        <span>{items.length} items</span>
        {checkedCount > 0 && (
          <>
            <span>•</span>
            <span className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              {checkedCount} reviewed
            </span>
          </>
        )}
        {items.some(i => i.type === 'assignment' && i.postDetails?.wordpress_post_id) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 ml-auto"
            onClick={handleWpRefresh}
            disabled={wpStatusLoading}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${wpStatusLoading ? 'animate-spin' : ''}`} />
            Refresh WP status
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Done</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>WordPress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow 
                key={`${item.type}-${item.id}`}
                className={`cursor-pointer hover:bg-muted/50 ${item.isChecked ? 'bg-muted/30' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={item.isChecked}
                    disabled={processingId === item.id}
                    onCheckedChange={(checked) => handleCheckChange(item, !!checked)}
                  />
                </TableCell>
                <TableCell>{getTypeBadge(item.type)}</TableCell>
                <TableCell className={`font-medium ${item.isChecked ? 'text-muted-foreground line-through' : ''}`}>
                  {item.title}
                </TableCell>
                <TableCell>
                  {item.siteName && (
                    <span className="flex items-center gap-1 text-sm">
                      <Globe className="h-3 w-3" />
                      {item.siteName}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {item.organizationName && (
                    <span className="flex items-center gap-1 text-sm">
                      <Building2 className="h-3 w-3" />
                      {item.organizationName}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {getStatusBadge(item.status)}
                </TableCell>
                <TableCell
                  onClick={item.type === 'assignment' && item.postDetails?.wordpress_post_id
                    ? (e) => e.stopPropagation()
                    : undefined}
                >
                  {item.type === 'assignment' && item.postDetails?.wordpress_post_id ? (
                    <WordPressScheduleControl
                      compact
                      postId={item.postDetails.id}
                      info={wpInfoByPostId[item.postDetails.id]}
                      onWpInfoChanged={handleWpInfoChanged}
                      findConflict={makeFindConflict(item.postDetails.id, item.postDetails.wordpress_site_id)}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ChecklistDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        wpInfoByPostId={wpInfoByPostId}
        onWpInfoChanged={handleWpInfoChanged}
        findConflict={
          selectedItem?.type === 'assignment' && selectedItem.postDetails?.id
            ? makeFindConflict(selectedItem.postDetails.id, selectedItem.postDetails.wordpress_site_id)
            : undefined
        }
      />
    </div>
  );
}
