import { useState, useEffect, useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ColumnTemplateDialog } from '@/components/ColumnTemplateDialog';
import { SponsorManagementDialog } from '@/components/SponsorManagementDialog';
import { SponsorSelector } from '@/components/SponsorSelector';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useSponsors, Sponsor } from '@/hooks/useSponsors';
import { toast } from 'sonner';
import { Save, Plus, Pencil, Trash2, FileText, User, Upload, X, Loader2 } from 'lucide-react';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { W9DownloadCard } from '@/components/client/W9DownloadCard';

export default function ClientSettings() {
  const { user, activeOrganizationId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [defaultSponsorId, setDefaultSponsorId] = useState<string | null>(null);
  const [isDefaultSponsorSaving, setIsDefaultSponsorSaving] = useState(false);
  const [columnTemplates, setColumnTemplates] = useState<any[]>([]);
  
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Sponsor management
  const { sponsors, isLoading: isLoadingSponsors, createSponsor, updateSponsor, deleteSponsor } = useSponsors(activeOrganizationId);
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [deletingSponsorId, setDeletingSponsorId] = useState<string | null>(null);
  const [isSponsorSaving, setIsSponsorSaving] = useState(false);
  const [isDeletingSponsor, setIsDeletingSponsor] = useState(false);
  
  // Profile information
  const [fullName, setFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  
  // Notification preferences
  const [emailNewAssignments, setEmailNewAssignments] = useState(true);
  const [emailDueReminders, setEmailDueReminders] = useState(true);
  const [emailEditApprovals, setEmailEditApprovals] = useState(true);
  // Stat emails: toggle reflects "receiving" (ON); stored inverted as exclude_from_stat_emails.
  const [statEmailsEnabled, setStatEmailsEnabled] = useState(true);
  // Admin-controlled; loaded so client saves preserve it rather than reset to default.
  const [excludeFromCreativeEmails, setExcludeFromCreativeEmails] = useState(false);
  const [defaultCommentsEnabled, setDefaultCommentsEnabled] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  
  // Author bio defaults
  const [defaultAuthorName, setDefaultAuthorName] = useState('');
  const [defaultAuthorBio, setDefaultAuthorBio] = useState('');
  const [defaultAuthorPhotoUrl, setDefaultAuthorPhotoUrl] = useState<string | null>(null);
  const [isAuthorBioSaving, setIsAuthorBioSaving] = useState(false);
  const [isAuthorPhotoUploading, setIsAuthorPhotoUploading] = useState(false);
  const authorPhotoInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, getProcessedUrl } = useImageProcessing();
  const currentDefaultSponsor = sponsors.find((sponsor) => sponsor.id === defaultSponsorId) ?? null;

  useEffect(() => {
    if (user) {
      loadDefaults();
      loadNotificationPreferences();
    }
  }, [user, activeOrganizationId]);

  useEffect(() => {
    if (user && activeOrganizationId) {
      fetchColumnTemplates();
    }
  }, [user, activeOrganizationId]);

  useEffect(() => {
    if (!isLoadingSponsors && defaultSponsorId && !sponsors.some((sponsor) => sponsor.id === defaultSponsorId)) {
      setDefaultSponsorId(null);
    }
  }, [defaultSponsorId, isLoadingSponsors, sponsors]);

  const loadDefaults = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const [{ data: profileData, error: profileError }, organizationResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, email, default_author_bio, default_author_photo_url, default_author_name')
          .eq('id', user.id)
          .single(),
        activeOrganizationId
          ? supabase
              .from('organizations')
              .select('default_sponsor_id')
              .eq('id', activeOrganizationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      
      if (profileError) throw profileError;
      if (organizationResult.error) throw organizationResult.error;
      
      if (profileData) {
        setFullName(profileData.full_name || '');
        setUserEmail(profileData.email || user.email || '');
        setDefaultAuthorName((profileData as any).default_author_name || '');
        setDefaultAuthorBio(profileData.default_author_bio || '');
        setDefaultAuthorPhotoUrl(profileData.default_author_photo_url || null);
      }

      setDefaultSponsorId(organizationResult.data?.default_sponsor_id ?? null);
    } catch (error: any) {
      console.error('Failed to load defaults:', error);
      toast.error('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsProfileSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName || null })
        .eq('id', user.id);
      
      if (error) throw error;
      
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsProfileSaving(false);
    }
  };

  const fetchColumnTemplates = async () => {
    if (!user || !activeOrganizationId) return;

    try {
      const { data: templates, error: templatesError } = await supabase
        .from('column_templates')
        .select('*')
        .eq('organization_id', activeOrganizationId)
        .order('name');

      if (templatesError) throw templatesError;
      setColumnTemplates(templates || []);
    } catch (error) {
      console.error('Error fetching column templates:', error);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('column_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      toast.success('Template deleted successfully');
      fetchColumnTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const loadNotificationPreferences = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setEmailNewAssignments(data.email_new_assignments);
        setEmailDueReminders(data.email_due_reminders);
        setEmailEditApprovals(data.email_edit_approvals);
        setStatEmailsEnabled(!(data.exclude_from_stat_emails ?? false));
        setExcludeFromCreativeEmails(data.exclude_from_creative_emails ?? false);
        setDefaultCommentsEnabled(data.default_comments_enabled ?? false);
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  };

  const saveNotificationPreferences = async (field: string, value: boolean) => {
    if (!user) return;

    setPrefsLoading(true);
    try {
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          email_new_assignments: field === 'email_new_assignments' ? value : emailNewAssignments,
          email_due_reminders: field === 'email_due_reminders' ? value : emailDueReminders,
          email_edit_approvals: field === 'email_edit_approvals' ? value : emailEditApprovals,
          // Toggle is "receiving"; store inverted. Stat emails are sent by an
          // external automation that reads exclude_from_stat_emails via client-lookup.
          exclude_from_stat_emails: field === 'stat_emails_enabled' ? !value : !statEmailsEnabled,
          // Admin-controlled; carried through so a client save doesn't reset it.
          exclude_from_creative_emails: excludeFromCreativeEmails,
          default_comments_enabled: field === 'default_comments_enabled' ? value : defaultCommentsEnabled,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Preferences updated');
    } catch (error: any) {
      console.error('Failed to save preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setPrefsLoading(false);
    }
  };

  const handleSaveDefaultSponsor = async () => {
    if (!activeOrganizationId) return;

    setIsDefaultSponsorSaving(true);
    try {
      const { error } = await supabase.rpc('set_my_default_sponsor', {
        _organization_id: activeOrganizationId,
        _sponsor_id: defaultSponsorId,
      });

      if (error) throw error;
      toast.success('Default sponsor saved');
    } catch (error: any) {
      console.error('Failed to save default sponsor:', error);
      toast.error('Failed to save default sponsor');
    } finally {
      setIsDefaultSponsorSaving(false);
    }
  };

  const handleAuthorPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB');
      return;
    }

    setIsAuthorPhotoUploading(true);
    try {
      const result = await uploadImage(file);
      
      // Poll until the background optimizer marks the record as ready
      let finalUrl = result.tempUrl;
      for (let i = 0; i < 30; i++) {
        const { url, status } = await getProcessedUrl(result.recordId);
        if (status === 'ready') {
          finalUrl = url;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setDefaultAuthorPhotoUrl(finalUrl);
      toast.success('Author photo uploaded');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsAuthorPhotoUploading(false);
      if (authorPhotoInputRef.current) {
        authorPhotoInputRef.current.value = '';
      }
    }
  };

  const handleSaveAuthorBioDefaults = async () => {
    if (!user) return;
    
    setIsAuthorBioSaving(true);
    try {
      // First fetch old values to compare
      const { data: oldData } = await supabase
        .from('profiles')
        .select('default_author_bio, default_author_photo_url, default_author_name')
        .eq('id', user.id)
        .single();

      const oldAuthorName = (oldData as any)?.default_author_name;
      const isNewDefault = !oldAuthorName && !oldData?.default_author_bio && !oldData?.default_author_photo_url;
      const hasChanges = 
        oldAuthorName !== defaultAuthorName ||
        oldData?.default_author_bio !== defaultAuthorBio ||
        oldData?.default_author_photo_url !== defaultAuthorPhotoUrl;

      // Save the new values
      const { error } = await supabase
        .from('profiles')
        .update({
          default_author_name: defaultAuthorName || null,
          default_author_bio: defaultAuthorBio || null,
          default_author_photo_url: defaultAuthorPhotoUrl,
        } as any)
        .eq('id', user.id);
      
      if (error) throw error;

      // Create admin request if new or changed
      if (isNewDefault || hasChanges) {
        const isComplete = defaultAuthorName || defaultAuthorBio || defaultAuthorPhotoUrl;
        if (isComplete) {
          await supabase.from('post_edit_requests').insert({
            post_id: '00000000-0000-0000-0000-000000000000',
            request_type: 'author_bio_default',
            requested_by: user.id,
            request_reason: isNewDefault 
              ? 'New default author bio created' 
              : 'Default author bio updated',
            status: 'pending',
            old_author_name: oldAuthorName || null,
            new_author_name: defaultAuthorName || null,
            additional_request_data: {
              old_author_bio: oldData?.default_author_bio || null,
              new_author_bio: defaultAuthorBio || null,
              old_author_photo_url: oldData?.default_author_photo_url || null,
              new_author_photo_url: defaultAuthorPhotoUrl || null,
            }
          });
        }
      }
      
      toast.success('Author bio defaults saved successfully');
    } catch (error: any) {
      console.error('Failed to save author bio defaults:', error);
      toast.error('Failed to save settings');
    } finally {
      setIsAuthorBioSaving(false);
    }
  };

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your preferences</p>
      </header>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="full-name" className="text-sm font-medium">
                    Full Name
                  </Label>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    value={userEmail}
                    disabled
                    className="mt-1.5 bg-muted"
                  />
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Contact an administrator to change your email address
                  </p>
                </div>

                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isProfileSaving}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isProfileSaving ? 'Saving...' : 'Save Profile'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <W9DownloadCard />

        <ChangePasswordCard />

        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>
              Choose which email notifications you'd like to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="new-assignments">New Assignments</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when you're assigned a new post
                </p>
              </div>
              <Switch
                id="new-assignments"
                checked={emailNewAssignments}
                onCheckedChange={(checked) => {
                  setEmailNewAssignments(checked);
                  saveNotificationPreferences('email_new_assignments', checked);
                }}
                disabled={prefsLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="due-reminders">Due Tomorrow Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Get reminded about posts due the next day
                </p>
              </div>
              <Switch
                id="due-reminders"
                checked={emailDueReminders}
                onCheckedChange={(checked) => {
                  setEmailDueReminders(checked);
                  saveNotificationPreferences('email_due_reminders', checked);
                }}
                disabled={prefsLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-approvals">Edit Request Approvals</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when your edit requests are approved
                </p>
              </div>
              <Switch
                id="edit-approvals"
                checked={emailEditApprovals}
                onCheckedChange={(checked) => {
                  setEmailEditApprovals(checked);
                  saveNotificationPreferences('email_edit_approvals', checked);
                }}
                disabled={prefsLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="stat-emails">Performance &amp; stat emails</Label>
                <p className="text-sm text-muted-foreground">
                  Receive emails with performance stats for your sponsored posts. Turn off to stop receiving them.
                </p>
              </div>
              <Switch
                id="stat-emails"
                checked={statEmailsEnabled}
                onCheckedChange={(checked) => {
                  setStatEmailsEnabled(checked);
                  saveNotificationPreferences('stat_emails_enabled', checked);
                }}
                disabled={prefsLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Post Defaults</CardTitle>
            <CardDescription>
              Set default values that will be pre-filled when creating new posts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="default-comments">Enable Comments by Default</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, comments will be turned on by default for new posts
                </p>
              </div>
              <Switch
                id="default-comments"
                checked={defaultCommentsEnabled}
                onCheckedChange={(checked) => {
                  setDefaultCommentsEnabled(checked);
                  saveNotificationPreferences('default_comments_enabled', checked);
                }}
                disabled={prefsLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Sponsor</CardTitle>
            <CardDescription>
              Choose the reusable sponsor that should be auto-filled on new posts for your active organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!activeOrganizationId ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>You need to be assigned to an organization to manage sponsor defaults</p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : sponsors.length === 0 ? (
              <div className="space-y-4 text-center py-4 text-muted-foreground">
                <div>
                  <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No sponsors available yet</p>
                  <p className="text-sm mt-1">Create your first sponsor, then set it as the default for new posts.</p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setEditingSponsor(null);
                    setSponsorDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Sponsor
                </Button>
              </div>
            ) : (
              <>
                <SponsorSelector
                  sponsors={sponsors}
                  selectedSponsorId={defaultSponsorId}
                  onSelectSponsor={setDefaultSponsorId}
                  onCreateNew={() => {
                    setEditingSponsor(null);
                    setSponsorDialogOpen(true);
                  }}
                  isLoading={isLoadingSponsors}
                />

                {currentDefaultSponsor && (
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={currentDefaultSponsor.logo_url}
                        alt={currentDefaultSponsor.name}
                        className="h-12 w-auto max-w-[96px] rounded border border-border object-contain bg-muted/30 p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">{currentDefaultSponsor.name}</p>
                          <Badge variant="default">Default</Badge>
                        </div>
                        {currentDefaultSponsor.link_url && (
                          <p className="truncate text-xs text-muted-foreground">{currentDefaultSponsor.link_url}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleSaveDefaultSponsor}
                  disabled={isDefaultSponsorSaving}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isDefaultSponsorSaving ? 'Saving...' : 'Save Default Sponsor'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Author Bio</CardTitle>
            <CardDescription>
              Set your default author information that will be pre-filled when submitting posts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="author-name-default" className="text-sm font-medium">
                    Author Name
                  </Label>
                  <Input
                    id="author-name-default"
                    value={defaultAuthorName}
                    onChange={(e) => setDefaultAuthorName(e.target.value)}
                    placeholder="Enter author name"
                    className="mt-1.5"
                  />
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Appears at the bottom of your post
                  </p>
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted">
                      {isAuthorPhotoUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : defaultAuthorPhotoUrl ? (
                        <img
                          src={defaultAuthorPhotoUrl}
                          alt="Author"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => authorPhotoInputRef.current?.click()}
                        disabled={isAuthorPhotoUploading}
                        className="text-xs"
                      >
                        <Upload className="mr-1 h-3 w-3" />
                        Upload
                      </Button>
                      {defaultAuthorPhotoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultAuthorPhotoUrl(null)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          <X className="mr-1 h-3 w-3" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={authorPhotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAuthorPhotoUpload}
                      className="hidden"
                    />
                  </div>

                  <div className="flex-1">
                    <Label htmlFor="default-author-bio" className="text-sm font-medium">
                      Author Bio
                    </Label>
                    <Textarea
                      id="default-author-bio"
                      placeholder="A brief one-paragraph bio..."
                      value={defaultAuthorBio}
                      onChange={(e) => setDefaultAuthorBio(e.target.value.replace(/[\r\n]+/g, ' '))}
                      className="mt-1.5 min-h-[100px] resize-none"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      One paragraph only. Line breaks will be removed.
                    </p>
                  </div>
                </div>

                <Button 
                  onClick={handleSaveAuthorBioDefaults} 
                  disabled={isAuthorBioSaving}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isAuthorBioSaving ? 'Saving...' : 'Save Author Bio Defaults'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sponsors</CardTitle>
                <CardDescription>
                  Manage reusable sponsor logos and organization names for posts
                </CardDescription>
              </div>
              {activeOrganizationId && (
                <Button
                  onClick={() => { setEditingSponsor(null); setSponsorDialogOpen(true); }}
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Sponsor
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!activeOrganizationId ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>You need to be assigned to an organization to manage sponsors</p>
              </div>
            ) : isLoadingSponsors ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : sponsors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No sponsors yet</p>
                <p className="text-sm mt-1">Create a sponsor to quickly add logos and organization names to posts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sponsors.map((sponsor) => (
                  <div key={sponsor.id} className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-accent/50">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <img src={sponsor.logo_url} alt={sponsor.name} className="h-10 w-auto max-w-[80px] flex-shrink-0 rounded border border-border object-contain bg-muted/30 p-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate font-medium text-foreground">{sponsor.name}</h4>
                          {defaultSponsorId === sponsor.id && <Badge variant="default">Default</Badge>}
                        </div>
                        {sponsor.link_url && (
                          <p className="truncate text-xs text-muted-foreground">{sponsor.link_url}</p>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingSponsor(sponsor); setSponsorDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingSponsorId(sponsor.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Column Templates</CardTitle>
                <CardDescription>
                  Create reusable templates for column posts with pre-filled content and styling
                </CardDescription>
              </div>
              {activeOrganizationId && (
                <Button 
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateDialogOpen(true);
                  }}
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Template
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!activeOrganizationId ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>You need to be assigned to an organization to create templates</p>
              </div>
            ) : columnTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No column templates yet</p>
                <p className="text-sm mt-1">Create a template to quickly pre-fill post content</p>
              </div>
            ) : (
              <div className="space-y-3">
                {columnTemplates.map((template) => (
                  <div 
                    key={template.id} 
                    className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground">{template.name}</h4>
                        <Badge variant={template.is_active ? 'default' : 'secondary'} className="text-xs">
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                        {template.logo_url && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-500">✓</span> Logo
                          </span>
                        )}
                        {template.author_name && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-500">✓</span> Author: {template.author_name}
                          </span>
                        )}
                        {template.banner_image_url && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-500">✓</span> Banner
                          </span>
                        )}
                        {template.intro_paragraph && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-500">✓</span> Intro
                          </span>
                        )}
                        {template.featured_image_url && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600 dark:text-green-500">✓</span> Featured Image
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTemplate(template);
                          setTemplateDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingTemplateId(template.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {activeOrganizationId && (
        <ColumnTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          onSuccess={fetchColumnTemplates}
          editingTemplate={editingTemplate}
          organizations={[{ id: activeOrganizationId, name: 'Your Organization' }]}
        />
      )}

      <SponsorManagementDialog
        open={sponsorDialogOpen}
        onOpenChange={setSponsorDialogOpen}
        sponsor={editingSponsor}
        onSave={async (data) => {
          setIsSponsorSaving(true);
          try {
            if (editingSponsor) {
              const success = await updateSponsor(editingSponsor.id, data);
              if (success) {
                // Propagate to WordPress
                try {
                  await supabase.functions.invoke('manage-sponsor', {
                    body: { action: 'update', sponsor_id: editingSponsor.id, updates: data }
                  });
                } catch (e) {
                  console.error('WP sync error:', e);
                  toast.warning('Sponsor saved, but WordPress sync may have failed');
                  return true;
                }
                toast.success('Sponsor updated');
                return true;
              }
              toast.error('Failed to update sponsor');
              return false;
            } else if (activeOrganizationId) {
              const sponsor = await createSponsor({
                organization_id: activeOrganizationId,
                name: data.name,
                logo_url: data.logo_url,
                link_url: data.link_url,
                created_by: user?.id,
              });
              if (sponsor) {
                toast.success('Sponsor created');
                return true;
              }
              toast.error('Failed to create sponsor');
              return false;
            }
            return false;
          } finally {
            setIsSponsorSaving(false);
          }
        }}
        isSaving={isSponsorSaving}
      />

      <AlertDialog open={!!deletingTemplateId} onOpenChange={() => setDeletingTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this column template. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTemplateId && handleDeleteTemplate(deletingTemplateId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingSponsorId} onOpenChange={() => setDeletingSponsorId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sponsor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this sponsor and clean up associated data on all WordPress sites. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingSponsor}
              onClick={async () => {
                if (!deletingSponsorId) return;
                setIsDeletingSponsor(true);
                const success = await deleteSponsor(deletingSponsorId);
                if (success) {
                  try {
                    await supabase.functions.invoke('manage-sponsor', {
                      body: { action: 'delete', sponsor_id: deletingSponsorId }
                    });
                  } catch (e) {
                    console.error('WP cleanup error:', e);
                    toast.warning('Sponsor removed, but WordPress cleanup may have failed');
                    setIsDeletingSponsor(false);
                    setDeletingSponsorId(null);
                    return;
                  }
                  toast.success('Sponsor deleted');
                } else {
                  toast.error('Failed to delete sponsor');
                }
                setIsDeletingSponsor(false);
                setDeletingSponsorId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingSponsor ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
