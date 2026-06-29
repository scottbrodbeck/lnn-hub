import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';

const safeFormat = (value: unknown, fmt: string, fallback = '—'): string => {
  if (!value) return fallback;
  const d = new Date(value as any);
  return isNaN(d.getTime()) ? fallback : format(d, fmt);
};
import { Users, FileText, Mail, Image, Calendar, ExternalLink, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UserManagementDialog } from '@/components/UserManagementDialog';
import { AuditLogTab } from './AuditLogTab';

const formatRecurrenceType = (type: string): string => {
  switch (type) {
    case 'one_time':
      return 'One-time';
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Biweekly';
    case 'monthly':
      return 'Monthly';
    default:
      return type;
  }
};

interface OrganizationDetailPanelProps {
  organization: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUser?: (user: any) => void;
}

export function OrganizationDetailPanel({ organization, open, onOpenChange, onSelectUser }: OrganizationDetailPanelProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [emailBlasts, setEmailBlasts] = useState<any[]>([]);
  const [emailSponsorships, setEmailSponsorships] = useState<any[]>([]);
  const [displayCampaigns, setDisplayCampaigns] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [completedAssignments, setCompletedAssignments] = useState<any[]>([]);
  const [blastAssignments, setBlastAssignments] = useState<any[]>([]);
  const [completedBlastAssignments, setCompletedBlastAssignments] = useState<any[]>([]);
  const [sponsorshipAssignments, setSponsorshipAssignments] = useState<any[]>([]);
  const [completedSponsorshipAssignments, setCompletedSponsorshipAssignments] = useState<any[]>([]);
  const [salesRep, setSalesRep] = useState<{ id: string; full_name: string | null; email: string } | null>(null);

  useEffect(() => {
    if (organization?.id && open) {
      fetchOrganizationData(organization.id);
    }
  }, [organization?.id, open]);

  const fetchOrganizationData = async (orgId: string) => {
    setLoading(true);
    try {
      // Fetch sales rep profile (if any)
      const repId = (organization as any)?.sales_rep_user_id ?? null;
      if (repId) {
        const { data: rep } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', repId)
          .maybeSingle();
        setSalesRep(rep ?? null);
      } else {
        setSalesRep(null);
      }

      // Fetch users in this organization
      const { data: userOrgs } = await supabase
        .from('user_organizations')
        .select(`
          user_id,
          is_primary,
          profiles:user_id(id, full_name, email, is_active)
        `)
        .eq('organization_id', orgId);

      const orgUsers = userOrgs?.map(uo => ({
        ...uo.profiles,
        is_primary: uo.is_primary
      })) || [];
      setUsers(orgUsers);

      // Get user IDs for post query
      const userIds = orgUsers.map(u => u.id);

      // Fetch recent posts by users in this org
      if (userIds.length > 0) {
        const { data: postsData } = await supabase
          .from('posts')
          .select('id, headline, status, published_at, wordpress_post_url, created_at')
          .in('client_id', userIds)
          .order('created_at', { ascending: false })
          .limit(10);
        setPosts(postsData || []);
      } else {
        setPosts([]);
      }

      // Fetch email blasts
      const { data: blastsData } = await supabase
        .from('email_blasts')
        .select('id, title, status, scheduled_date, published_at')
        .eq('organization_id', orgId)
        .order('scheduled_date', { ascending: false })
        .limit(10);
      setEmailBlasts(blastsData || []);

      // Fetch email sponsorships
      const { data: sponsorshipsData } = await supabase
        .from('email_sponsorships')
        .select('id, week_start_date, status, banner_image_url')
        .eq('organization_id', orgId)
        .order('week_start_date', { ascending: false })
        .limit(10);
      setEmailSponsorships(sponsorshipsData || []);

      // Fetch display ad campaigns
      const { data: campaignsData } = await supabase
        .from('display_ad_campaigns')
        .select('id, name, start_date, end_date, is_active, ad_type')
        .eq('organization_id', orgId)
        .order('start_date', { ascending: false })
        .limit(10);
      setDisplayCampaigns(campaignsData || []);

      // Fetch active post assignments (no limit)
      const { data: activeAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          recurrence_type,
          content_category,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('is_completed', false)
        .neq('content_category', 'email_sponsorship')
        .neq('content_category', 'email_blast')
        .order('due_date', { ascending: true });
      setAssignments(activeAssignmentsData || []);

      // Fetch recently completed post assignments
      const { data: completedAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          recurrence_type,
          content_category,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('is_completed', true)
        .neq('content_category', 'email_sponsorship')
        .neq('content_category', 'email_blast')
        .order('due_date', { ascending: false })
        .limit(10);
      setCompletedAssignments(completedAssignmentsData || []);

      // Fetch active email blast assignments (no limit)
      const { data: blastAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('content_category', 'email_blast')
        .eq('is_completed', false)
        .order('due_date', { ascending: true });
      setBlastAssignments(blastAssignmentsData || []);

      // Fetch recently completed email blast assignments
      const { data: completedBlastAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('content_category', 'email_blast')
        .eq('is_completed', true)
        .order('due_date', { ascending: false })
        .limit(10);
      setCompletedBlastAssignments(completedBlastAssignmentsData || []);

      // Fetch active email sponsorship assignments (no limit)
      const { data: sponsorshipAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('content_category', 'email_sponsorship')
        .eq('is_completed', false)
        .order('due_date', { ascending: true });
      setSponsorshipAssignments(sponsorshipAssignmentsData || []);

      // Fetch recently completed email sponsorship assignments
      const { data: completedSponsorshipAssignmentsData } = await supabase
        .from('post_assignments')
        .select(`
          id, 
          assignment_name, 
          due_date, 
          is_completed,
          site:sites(name)
        `)
        .eq('organization_id', orgId)
        .eq('content_category', 'email_sponsorship')
        .eq('is_completed', true)
        .order('due_date', { ascending: false })
        .limit(10);
      setCompletedSponsorshipAssignments(completedSponsorshipAssignmentsData || []);

    } catch (error) {
      console.error('Error fetching organization data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!organization) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
      case 'sent':
      case 'approved':
        return <Badge className="bg-green-600 text-primary-foreground">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[calc(100vw-256px)] sm:!max-w-[calc(100vw-256px)]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {organization.name}
            <Badge variant={organization.is_active ? 'default' : 'secondary'}>
              {organization.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overview */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">OVERVIEW</h3>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Client Code</span>
                    <span className="font-mono">{organization.client_code}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{safeFormat(organization.created_at, 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sales Rep</span>
                    <span>{salesRep ? (salesRep.full_name ?? salesRep.email) : <span className="text-muted-foreground italic">Unassigned</span>}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Users */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    USERS ({users.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowAddUser(true)}
                  >
                    <UserPlus className="h-3 w-3 mr-1" />
                    Add User
                  </Button>
                </div>
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users in this organization</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((user) => (
                      <div 
                        key={user.id} 
                        className="flex items-start justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => onSelectUser?.(user)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{user.full_name || 'Unnamed'}</span>
                          {user.is_primary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}
                          <div className="text-muted-foreground text-xs truncate">{user.email}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {user.email && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Copy email"
                              title="Copy email"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const text = user.email as string;
                                let ok = false;
                                try {
                                  if (navigator.clipboard && window.isSecureContext) {
                                    await navigator.clipboard.writeText(text);
                                    ok = true;
                                  }
                                } catch {
                                  ok = false;
                                }
                                if (!ok) {
                                  try {
                                    const ta = document.createElement('textarea');
                                    ta.value = text;
                                    ta.style.position = 'fixed';
                                    ta.style.opacity = '0';
                                    document.body.appendChild(ta);
                                    ta.focus();
                                    ta.select();
                                    ok = document.execCommand('copy');
                                    document.body.removeChild(ta);
                                  } catch {
                                    ok = false;
                                  }
                                }
                                if (ok) toast.success('Email copied');
                                else toast.error('Failed to copy');
                              }}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Post Assignments */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  POST ASSIGNMENTS ({assignments.length + completedAssignments.length})
                </h3>
                {assignments.length === 0 && completedAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No post assignments yet</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {assignments.map((assignment) => (
                      <div 
                        key={assignment.id} 
                        className="flex items-start justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{assignment.assignment_name}</span>
                          <div className="text-muted-foreground text-xs">
                            {assignment.site?.name} • {formatRecurrenceType(assignment.recurrence_type)}
                          </div>
                        </div>
                        <Badge variant="outline">Active</Badge>
                      </div>
                    ))}
                    {completedAssignments.length > 0 && (
                      <>
                        <div className="text-xs font-semibold text-muted-foreground pt-2 pb-1">
                          RECENTLY COMPLETED ({completedAssignments.length})
                        </div>
                        {completedAssignments.map((assignment) => (
                          <div 
                            key={assignment.id} 
                            className="flex items-start justify-between text-sm bg-muted/30 rounded p-2 cursor-pointer hover:bg-muted transition-colors opacity-75"
                            onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                          >
                            <div className="flex-1 min-w-0">
                              <span className="font-medium block">{assignment.assignment_name}</span>
                              <div className="text-muted-foreground text-xs">
                                {assignment.site?.name} • {formatRecurrenceType(assignment.recurrence_type)}
                              </div>
                            </div>
                            <Badge>Complete</Badge>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {assignments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/assignments?org=${organization.id}&status=current`)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    View all active Post Assignments →
                  </button>
                )}
              </div>

              <Separator />

              {/* Recent Posts */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  RECENT POSTS ({posts.length})
                </h3>
                {posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No posts yet</p>
                ) : (
                  <div className="space-y-2">
                    {posts.map((post) => (
                      <div key={post.id} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{post.headline}</span>
                            {post.wordpress_post_url && (
                              <a 
                                href={post.wordpress_post_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {post.published_at 
                              ? safeFormat(post.published_at, 'MMM d, yyyy')
                              : safeFormat(post.created_at, 'MMM d, yyyy')}
                          </div>
                        </div>
                        {getStatusBadge(post.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Email Blasts */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  EMAIL BLASTS ({emailBlasts.length + blastAssignments.length + completedBlastAssignments.length})
                </h3>
                {emailBlasts.length === 0 && blastAssignments.length === 0 && completedBlastAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No email blasts yet</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {blastAssignments.map((assignment) => (
                      <div 
                        key={`blast-assign-${assignment.id}`} 
                        className="flex items-start justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{assignment.assignment_name}</span>
                          <div className="text-muted-foreground text-xs">
                            {assignment.site?.name} • Due {assignment.due_date ? safeFormat(assignment.due_date, 'MMM d, yyyy') : 'TBD'}
                          </div>
                        </div>
                        <Badge variant="outline">Assigned</Badge>
                      </div>
                    ))}
                    {completedBlastAssignments.map((assignment) => (
                      <div 
                        key={`blast-done-${assignment.id}`} 
                        className="flex items-start justify-between text-sm bg-muted/30 rounded p-2 cursor-pointer hover:bg-muted transition-colors opacity-75"
                        onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{assignment.assignment_name}</span>
                          <div className="text-muted-foreground text-xs">
                            {assignment.site?.name} • Due {assignment.due_date ? safeFormat(assignment.due_date, 'MMM d, yyyy') : 'TBD'}
                          </div>
                        </div>
                        <Badge>Complete</Badge>
                      </div>
                    ))}
                    {emailBlasts.map((blast) => (
                      <div 
                        key={blast.id} 
                        className="flex items-center justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate('/admin/tasks')}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{blast.title}</span>
                          <div className="text-muted-foreground text-xs">
                            {blast.scheduled_date ? safeFormat(blast.scheduled_date, 'MMM d, yyyy') : 'Not scheduled'}
                          </div>
                        </div>
                        {getStatusBadge(blast.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Email Sponsorships */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  EMAIL SPONSORSHIPS ({emailSponsorships.length + sponsorshipAssignments.length + completedSponsorshipAssignments.length})
                </h3>
                {emailSponsorships.length === 0 && sponsorshipAssignments.length === 0 && completedSponsorshipAssignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No email sponsorships yet</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {sponsorshipAssignments.map((assignment) => (
                      <div 
                        key={`assign-${assignment.id}`} 
                        className="flex items-start justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{assignment.assignment_name}</span>
                          <div className="text-muted-foreground text-xs">
                            {assignment.site?.name} • Due {assignment.due_date ? safeFormat(assignment.due_date, 'MMM d, yyyy') : 'TBD'}
                          </div>
                        </div>
                        <Badge variant="outline">Assigned</Badge>
                      </div>
                    ))}
                    {completedSponsorshipAssignments.map((assignment) => (
                      <div 
                        key={`spons-done-${assignment.id}`} 
                        className="flex items-start justify-between text-sm bg-muted/30 rounded p-2 cursor-pointer hover:bg-muted transition-colors opacity-75"
                        onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block">{assignment.assignment_name}</span>
                          <div className="text-muted-foreground text-xs">
                            {assignment.site?.name} • Due {assignment.due_date ? safeFormat(assignment.due_date, 'MMM d, yyyy') : 'TBD'}
                          </div>
                        </div>
                        <Badge>Complete</Badge>
                      </div>
                    ))}
                    {emailSponsorships.map((sponsorship) => (
                      <div 
                        key={sponsorship.id} 
                        className="flex items-center justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate('/admin/tasks')}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">Week of {safeFormat(sponsorship.week_start_date, 'MMM d, yyyy')}</span>
                        </div>
                        {getStatusBadge(sponsorship.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Display Ads */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Image className="h-4 w-4" />
                  DISPLAY AD CAMPAIGNS ({displayCampaigns.length})
                </h3>
                {displayCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No display ad campaigns yet</p>
                ) : (
                  <div className="space-y-2">
                    {displayCampaigns.map((campaign) => (
                      <div 
                        key={campaign.id} 
                        className="flex items-center justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => navigate(`/admin/display-ads?campaign=${campaign.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{campaign.name}</span>
                          <div className="text-muted-foreground text-xs">
                            {safeFormat(campaign.start_date, 'MMM d')} - {campaign.end_date ? safeFormat(campaign.end_date, 'MMM d, yyyy') : 'Ongoing'}
                          </div>
                        </div>
                        {(() => {
                          // "Active" must reflect the campaign's end_date — the is_active
                          // DB flag is not auto-cleared when end_date passes. Mirror the
                          // logic used in AdminDisplayAds and the client-side views.
                          const isOngoing = !campaign.end_date || campaign.end_date === '2999-12-31';
                          const isActive = campaign.is_active && (isOngoing || new Date(campaign.end_date) > new Date());
                          return (
                            <Badge variant={isActive ? 'default' : 'secondary'}>
                              {isActive ? 'Active' : 'Ended'}
                            </Badge>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Audit log */}
              <AuditLogTab organizationId={organization.id} />
            </div>
          )}
        </ScrollArea>
      </SheetContent>
      <UserManagementDialog
        open={showAddUser}
        onOpenChange={setShowAddUser}
        onSuccess={() => fetchOrganizationData(organization.id)}
        preselectedOrganizationId={organization.id}
      />
    </Sheet>
  );
}
