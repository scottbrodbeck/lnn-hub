import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { recordAudit } from '@/lib/audit';

const safeFormat = (value: unknown, fmt: string, fallback = '—'): string => {
  if (!value) return fallback;
  const d = new Date(value as any);
  return isNaN(d.getTime()) ? fallback : format(d, fmt);
};
import { Building2, FileText, Mail, Calendar, ExternalLink, Pencil, Trash2, ChevronRight, Loader2 } from 'lucide-react';

const formatRecurrenceType = (type: string): string => {
  switch (type) {
    case 'one_time': return 'One-time';
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Biweekly';
    case 'monthly': return 'Monthly';
    default: return type;
  }
};

interface UserManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingUser?: any;
  preselectedOrganizationId?: string;
  onSelectOrganization?: (org: any) => void;
}

export function UserManagementDialog({ open, onOpenChange, onSuccess, editingUser, preselectedOrganizationId, onSelectOrganization }: UserManagementDialogProps) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resendingWelcome, setResendingWelcome] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [orgEditMode, setOrgEditMode] = useState(false);
  
  // Activity data
  const [userOrgs, setUserOrgs] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'client',
    organizationIds: [] as string[],
    primaryOrganizationId: null as string | null,
    isActive: true,
    defaultAuthorName: '',
    defaultAuthorBio: '',
    defaultAuthorPhotoUrl: '',
    excludeFromCreativeEmails: false,
    excludeFromStatEmails: false,
  });

  const resetForm = (user?: any) => ({
    email: user?.email || '',
    password: '',
    fullName: user?.full_name || '',
    role: user?.roles?.[0]?.role || 'client',
    organizationIds: preselectedOrganizationId && !user ? [preselectedOrganizationId] : [],
    primaryOrganizationId: preselectedOrganizationId && !user ? preselectedOrganizationId : null,
    isActive: user?.is_active ?? true,
    defaultAuthorName: '',
    defaultAuthorBio: '',
    defaultAuthorPhotoUrl: '',
    excludeFromCreativeEmails: false,
    excludeFromStatEmails: false,
  });

  useEffect(() => {
    if (open) {
      fetchOrganizations();
      setFormData(resetForm(editingUser));
      setOrgEditMode(false);
      if (editingUser) {
        fetchUserOrganizations(editingUser.id);
        fetchAuthorDefaults(editingUser.id);
        fetchNotificationPrefs(editingUser.id);
        fetchActivityData(editingUser.id);
      } else {
        setUserOrgs([]);
        setPosts([]);
        setEmailLogs([]);
        setAssignments([]);
      }
    }
  }, [open, editingUser]);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, client_code, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setOrganizations(data || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  };

  const fetchUserOrganizations = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('organization_id, is_primary')
        .eq('user_id', userId);
      if (error) throw error;
      const orgIds = data?.map(d => d.organization_id) || [];
      const primaryOrg = data?.find(d => d.is_primary);
      setFormData(prev => ({
        ...prev,
        organizationIds: orgIds,
        primaryOrganizationId: primaryOrg?.organization_id || (orgIds.length > 0 ? orgIds[0] : null),
      }));
    } catch (error) {
      console.error('Error fetching user organizations:', error);
    }
  };

  const fetchAuthorDefaults = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('default_author_name, default_author_bio, default_author_photo_url')
        .eq('id', userId)
        .single();
      if (error) throw error;
      if (data) {
        setFormData(prev => ({
          ...prev,
          defaultAuthorName: data.default_author_name || '',
          defaultAuthorBio: data.default_author_bio || '',
          defaultAuthorPhotoUrl: data.default_author_photo_url || '',
        }));
      }
    } catch (error) {
      console.error('Error fetching author defaults:', error);
    }
  };

  const fetchNotificationPrefs = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_notification_preferences')
        .select('exclude_from_creative_emails, exclude_from_stat_emails')
        .eq('user_id', userId)
        .maybeSingle();
      setFormData(prev => ({
        ...prev,
        excludeFromCreativeEmails: !!data?.exclude_from_creative_emails,
        excludeFromStatEmails: !!data?.exclude_from_stat_emails,
      }));
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
    }
  };

  const fetchActivityData = async (userId: string) => {
    setActivityLoading(true);
    try {
      const [orgsRes, postsRes, logsRes, assignmentsRes] = await Promise.all([
        supabase.from('user_organizations').select(`
          organization_id, is_primary,
          organizations(id, name, client_code, is_active)
        `).eq('user_id', userId),
        supabase.from('posts').select('id, headline, status, published_at, wordpress_post_url, created_at')
          .eq('client_id', userId).order('created_at', { ascending: false }).limit(10),
        supabase.from('email_notification_logs').select('id, notification_type, subject, status, sent_at')
          .eq('user_id', userId).order('sent_at', { ascending: false }).limit(10),
        supabase.from('post_assignments').select(`
          id, assignment_name, due_date, is_completed, recurrence_type, site:sites(name)
        `).eq('assigned_to', userId).order('due_date', { ascending: false }).limit(10),
      ]);

      setUserOrgs(orgsRes.data?.map(uo => ({ ...uo.organizations, is_primary: uo.is_primary })) || []);
      setPosts(postsRes.data || []);
      setEmailLogs(logsRes.data || []);
      setAssignments(assignmentsRes.data || []);
    } catch (error) {
      console.error('Error fetching activity data:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  const handleOrganizationToggle = (orgId: string, checked: boolean) => {
    setFormData(prev => {
      const newOrgIds = checked
        ? [...prev.organizationIds, orgId]
        : prev.organizationIds.filter(id => id !== orgId);
      let newPrimaryId = prev.primaryOrganizationId;
      if (!checked && prev.primaryOrganizationId === orgId) {
        newPrimaryId = newOrgIds.length > 0 ? newOrgIds[0] : null;
      }
      if (checked && newOrgIds.length === 1) {
        newPrimaryId = orgId;
      }
      return { ...prev, organizationIds: newOrgIds, primaryOrganizationId: newPrimaryId };
    });
  };

  const handleResendWelcome = async () => {
    if (!editingUser) return;
    setResendingWelcome(true);
    try {
      const { data, error } = await supabase.functions.invoke('resend-welcome-email', {
        body: { userId: editingUser.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const welcome = data?.welcomeEmail;
      if (welcome?.status === 'sent') {
        toast.success('Welcome email sent.');
      } else if (welcome?.status === 'skipped') {
        toast.warning(`Not sent: ${welcome.reason || 'welcome emails are turned off in Settings'}.`);
      } else {
        toast.error(`Couldn't send welcome email: ${welcome?.reason || 'unknown error'}.`);
      }
    } catch (err: any) {
      console.error('Error resending welcome email:', err);
      toast.error(err.message || 'Failed to resend welcome email');
    } finally {
      setResendingWelcome(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingUser) {
        const previousRole = editingUser.roles?.[0]?.role ?? null;
        const previousOrgIds: string[] = (editingUser.organizations ?? []).map((o: any) => o.organization_id).filter(Boolean);

        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.fullName,
            email: formData.email,
            organization_id: formData.primaryOrganizationId,
            is_active: formData.isActive,
            default_author_name: formData.defaultAuthorName || null,
            default_author_bio: formData.defaultAuthorBio || null,
            default_author_photo_url: formData.defaultAuthorPhotoUrl || null,
          })
          .eq('id', editingUser.id);
        if (profileError) throw profileError;

        const roleChanged = previousRole !== formData.role;
        if (roleChanged) {
          await supabase.from('user_roles').delete().eq('user_id', editingUser.id);
          const { error: roleError } = await supabase
            .from('user_roles')
            .insert({ user_id: editingUser.id, role: formData.role as any });
          if (roleError) throw roleError;
        }

        await supabase.from('user_organizations').delete().eq('user_id', editingUser.id);
        if (formData.organizationIds.length > 0) {
          const orgInserts = formData.organizationIds.map(orgId => ({
            user_id: editingUser.id,
            organization_id: orgId,
            is_primary: orgId === formData.primaryOrganizationId,
          }));
          const { error: orgError } = await supabase.from('user_organizations').insert(orgInserts);
          if (orgError) throw orgError;
        }

        // Audit: emit per-org events for membership and role changes
        const userLabel = formData.fullName || formData.email || editingUser.id.slice(0, 8);
        const addedOrgs = formData.organizationIds.filter((id) => !previousOrgIds.includes(id));
        const removedOrgs = previousOrgIds.filter((id) => !formData.organizationIds.includes(id));
        for (const orgId of addedOrgs) {
          void recordAudit({
            organizationId: orgId,
            action: 'org.user_added',
            entityType: 'user_organization',
            entityId: editingUser.id,
            summary: `Added ${userLabel} (${formData.role}) to organization`,
            after: { role: formData.role, is_primary: orgId === formData.primaryOrganizationId },
            metadata: { user_id: editingUser.id, email: formData.email },
          });
        }
        for (const orgId of removedOrgs) {
          void recordAudit({
            organizationId: orgId,
            action: 'org.user_removed',
            entityType: 'user_organization',
            entityId: editingUser.id,
            summary: `Removed ${userLabel} from organization`,
            before: { role: previousRole, is_primary: false },
            metadata: { user_id: editingUser.id, email: formData.email },
          });
        }
        if (roleChanged) {
          for (const orgId of formData.organizationIds) {
            if (!addedOrgs.includes(orgId)) {
              void recordAudit({
                organizationId: orgId,
                action: 'org.role_changed',
                entityType: 'user_organization',
                entityId: editingUser.id,
                summary: `Changed ${userLabel}'s role from ${previousRole ?? 'none'} to ${formData.role}`,
                before: { role: previousRole },
                after: { role: formData.role },
                metadata: { user_id: editingUser.id, email: formData.email },
              });
            }
          }
        }

        // Upsert admin-controlled email suppression flags. Read the user's
        // existing per-type prefs first and carry them through, so toggling an
        // admin flag (esp. when no prefs row exists yet) never resets the
        // client's own notification choices to defaults.
        const { data: existingPrefs } = await supabase
          .from('user_notification_preferences')
          .select('email_new_assignments, email_due_reminders, email_edit_approvals, default_comments_enabled')
          .eq('user_id', editingUser.id)
          .maybeSingle();
        const { error: prefsError } = await supabase
          .from('user_notification_preferences')
          .upsert(
            {
              ...(existingPrefs ?? {}),
              user_id: editingUser.id,
              exclude_from_creative_emails: formData.excludeFromCreativeEmails,
              exclude_from_stat_emails: formData.excludeFromStatEmails,
            },
            { onConflict: 'user_id' },
          );
        if (prefsError) throw prefsError;

        toast.success('User updated successfully');
      } else {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            fullName: formData.fullName,
            role: formData.role,
            organizationIds: formData.organizationIds,
            primaryOrganizationId: formData.primaryOrganizationId,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const welcome = data?.welcomeEmail;
        if (welcome?.status === 'sent') {
          toast.success('User created — welcome email sent.');
        } else if (welcome?.status === 'skipped') {
          toast.warning(`User created. Welcome email not sent: ${welcome.reason || 'welcome emails are turned off in Settings'}.`);
        } else if (welcome) {
          toast.warning(`User created, but the welcome email couldn't be sent: ${welcome.reason || 'unknown error'}. You can resend it by editing the user.`);
        } else {
          toast.success('User created successfully');
        }
      }


      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error managing user:', error);
      toast.error(error.message || 'Failed to manage user');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
      case 'sent':
        return <Badge className="bg-green-600 text-primary-foreground">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'success':
        return <Badge className="bg-green-600 text-primary-foreground">Sent</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatNotificationType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:!max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-0 shrink-0">
          <SheetTitle>{editingUser ? 'Edit User' : 'Create New User'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ScrollArea className="flex-1">
            <div className="px-6 pb-6">
              <div className="space-y-4 py-4">
                {/* Core fields */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="John Doe" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="user@example.com" required />
              </div>

              {editingUser && (
                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResendWelcome}
                    disabled={resendingWelcome}
                    className="w-full"
                  >
                    {resendingWelcome ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Resend welcome email
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Sends a fresh 7-day setup link to this user. If it doesn't send, you'll see why.
                  </p>
                </div>
              )}

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" required minLength={6} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingUser && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="isActive">Active Status</Label>
                    <Switch id="isActive" checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
                  </div>
                  <p className="text-sm text-muted-foreground">Inactive users cannot log in to the system</p>
                </div>
              )}

              {/* Organizations section */}
              {editingUser && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        ORGANIZATIONS ({userOrgs.length})
                      </h3>
                      <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setOrgEditMode(!orgEditMode)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        {orgEditMode ? 'Done' : 'Edit'}
                      </Button>
                    </div>

                    {orgEditMode ? (
                      <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                        {organizations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No organizations available</p>
                        ) : (
                          organizations.map((org) => (
                            <div key={org.id} className="flex items-center space-x-3">
                              <Checkbox id={`org-${org.id}`} checked={formData.organizationIds.includes(org.id)} onCheckedChange={(checked) => handleOrganizationToggle(org.id, !!checked)} />
                              <label htmlFor={`org-${org.id}`} className="text-sm flex-1 cursor-pointer">{org.name} ({org.client_code})</label>
                              {formData.organizationIds.includes(org.id) && formData.organizationIds.length > 1 && (
                                <Button type="button" variant={formData.primaryOrganizationId === org.id ? "default" : "outline"} size="sm" className="text-xs h-6" onClick={() => setFormData(prev => ({ ...prev, primaryOrganizationId: org.id }))}>
                                  {formData.primaryOrganizationId === org.id ? 'Primary' : 'Set Primary'}
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      userOrgs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Not a member of any organization</p>
                      ) : (
                        <div className="space-y-2">
                          {userOrgs.map((org) => {
                            const clickable = !!onSelectOrganization;
                            return (
                              <div
                                key={org.id}
                                className={`flex items-center justify-between text-sm bg-muted/50 rounded p-2 ${clickable ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}
                                onClick={clickable ? () => onSelectOrganization!(org) : undefined}
                                role={clickable ? 'button' : undefined}
                              >
                                <div>
                                  <span className="font-medium">{org.name}</span>
                                  {org.is_primary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}
                                  <div className="text-muted-foreground text-xs font-mono">{org.client_code}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!org.is_active && (
                                    <Badge variant="secondary" className="text-xs">Archived</Badge>
                                  )}
                                  {clickable && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                </>
              )}

              {/* Org checkboxes for new users */}
              {!editingUser && formData.role === 'client' && (
                <div className="space-y-2">
                  <Label>Organizations</Label>
                  <p className="text-sm text-muted-foreground mb-2">Select organizations this user can manage content for</p>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    {organizations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No organizations available</p>
                    ) : (
                      organizations.map((org) => (
                        <div key={org.id} className="flex items-center space-x-3">
                          <Checkbox id={`org-new-${org.id}`} checked={formData.organizationIds.includes(org.id)} onCheckedChange={(checked) => handleOrganizationToggle(org.id, !!checked)} />
                          <label htmlFor={`org-new-${org.id}`} className="text-sm flex-1 cursor-pointer">{org.name} ({org.client_code})</label>
                          {formData.organizationIds.includes(org.id) && formData.organizationIds.length > 1 && (
                            <Button type="button" variant={formData.primaryOrganizationId === org.id ? "default" : "outline"} size="sm" className="text-xs h-6" onClick={() => setFormData(prev => ({ ...prev, primaryOrganizationId: org.id }))}>
                              {formData.primaryOrganizationId === org.id ? 'Primary' : 'Set Primary'}
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Author Defaults - only for editing */}
              {editingUser && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-muted-foreground">AUTHOR DEFAULTS</h4>
                    <div className="space-y-2">
                      <Label htmlFor="defaultAuthorName">Author Name</Label>
                      <Input id="defaultAuthorName" value={formData.defaultAuthorName} onChange={(e) => setFormData({ ...formData, defaultAuthorName: e.target.value })} placeholder="Display name for posts" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defaultAuthorBio">Author Bio</Label>
                      <Textarea id="defaultAuthorBio" value={formData.defaultAuthorBio} onChange={(e) => setFormData({ ...formData, defaultAuthorBio: e.target.value })} placeholder="Short author biography" rows={3} />
                    </div>
                    <SingleImageUpload
                      imageUrl={formData.defaultAuthorPhotoUrl || null}
                      onImageChange={(url) => setFormData({ ...formData, defaultAuthorPhotoUrl: url || '' })}
                      label="Author Photo"
                      aspectRatio="banner"
                      className="max-w-[250px]"
                    />
                  </div>
                </>
              )}

              {/* Email Suppression - only for editing */}
              {editingUser && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground">EMAIL SUPPRESSION</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set by admin. The user can still adjust per-notification preferences in their own settings.
                      </p>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="excludeCreativeEmails">No creative emails</Label>
                        <p className="text-xs text-muted-foreground">
                          Suppress assignment, post, sponsorship, blast, and approval emails for this user.
                        </p>
                      </div>
                      <Switch
                        id="excludeCreativeEmails"
                        checked={formData.excludeFromCreativeEmails}
                        onCheckedChange={(checked) => setFormData({ ...formData, excludeFromCreativeEmails: checked })}
                      />
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="excludeStatEmails">No stat emails</Label>
                        <p className="text-xs text-muted-foreground">
                          Suppress performance/reporting emails — sponsored-post stats and expiring ad campaigns. Use this to stop stat emails for a contact (e.g., someone who has left) without deleting their account.
                        </p>
                      </div>
                      <Switch
                        id="excludeStatEmails"
                        checked={formData.excludeFromStatEmails}
                        onCheckedChange={(checked) => setFormData({ ...formData, excludeFromStatEmails: checked })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Activity sections - only when editing */}
              {editingUser && (
                <>
                  <Separator />

                  {activityLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                          <div className="h-20 bg-muted rounded" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-6">
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
                                      <a href={post.wordpress_post_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground text-xs">
                                    {post.published_at ? safeFormat(post.published_at, 'MMM d, yyyy') : safeFormat(post.created_at, 'MMM d, yyyy')}
                                  </div>
                                </div>
                                {getStatusBadge(post.status)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Email Notifications */}
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          EMAIL NOTIFICATIONS ({emailLogs.length})
                        </h3>
                        {emailLogs.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No email notifications sent</p>
                        ) : (
                          <div className="space-y-2">
                            {emailLogs.map((log) => (
                              <div key={log.id} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium truncate block">{log.subject}</span>
                                  <div className="text-muted-foreground text-xs">
                                    {formatNotificationType(log.notification_type)} • {safeFormat(log.sent_at, 'MMM d, yyyy h:mm a')}
                                  </div>
                                </div>
                                {getStatusBadge(log.status)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Assignments */}
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          ASSIGNMENTS ({assignments.length})
                        </h3>
                        {assignments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No assignments</p>
                        ) : (
                          <div className="space-y-2">
                            {assignments.map((assignment) => (
                              <div 
                                key={assignment.id} 
                                className="flex items-center justify-between text-sm bg-muted/50 rounded p-2 cursor-pointer hover:bg-muted transition-colors"
                                onClick={() => navigate(`/admin/assignments?assignment=${assignment.id}`)}
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium truncate block">{assignment.assignment_name}</span>
                                  <div className="text-muted-foreground text-xs">
                                    {assignment.site?.name} • {formatRecurrenceType(assignment.recurrence_type)}
                                  </div>
                                </div>
                                <Badge variant={assignment.is_completed ? 'default' : 'outline'}>
                                  {assignment.is_completed ? 'Complete' : 'Active'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Sticky footer buttons */}
        <div className="shrink-0 border-t px-6 py-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}</Button>
          </div>
          {editingUser && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </Button>
          )}
        </div>
      </form>
      </SheetContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{editingUser?.full_name || editingUser?.email}</strong>? This will remove their account, roles, and organization memberships. Their posts and assignments will be preserved but unlinked. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDeleting(true);
                try {
                  const { data, error } = await supabase.functions.invoke('delete-user', {
                    body: { userId: editingUser.id },
                  });
                  if (error) throw error;
                  if (data?.error) throw new Error(data.error);
                  toast.success('User deleted successfully');
                  onSuccess();
                  onOpenChange(false);
                } catch (error: any) {
                  console.error('Error deleting user:', error);
                  toast.error(error.message || 'Failed to delete user');
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
