import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Hash, Lock, Send } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getAppBaseUrl, getCleanCurrentUrl } from '@/lib/utils';
import { SiteDialog } from '@/components/SiteDialog';
import { ColumnTemplateDialog } from '@/components/ColumnTemplateDialog';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiKeysManager } from '@/components/ApiKeysManager';
import { W9SettingsCard } from '@/components/admin/W9SettingsCard';
import { RichTextEditor } from '@/components/RichTextEditor';
import { DEFAULT_GUIDE_CONTENT } from '@/lib/onboardingGuide';

const EVENT_TYPES = [
  { key: 'post_submitted', label: 'Post Submitted', emoji: '📝', description: 'When a client submits a new post' },
  { key: 'post_edited', label: 'Post Edited', emoji: '✏️', description: 'When a client edits a post directly' },
  { key: 'edit_request_submitted', label: 'Edit Request', emoji: '🔔', description: 'When a client submits an edit request' },
  { key: 'date_change_requested', label: 'Date Change', emoji: '📅', description: 'When a client requests a new date' },
  { key: 'support_request', label: 'Support Request', emoji: '🆘', description: 'When a client submits a support request' },
  { key: 'email_blast_submitted', label: 'Email Blast', emoji: '📧', description: 'When a client submits an email blast' },
  { key: 'sponsorship_submitted', label: 'Sponsorship', emoji: '🎯', description: 'When a client submits a sponsorship' },
  { key: 'ad_submitted', label: 'Ad Submitted', emoji: '🖼️', description: 'When a client submits display ad creative' },
] as const;

type SlackEventConfig = { enabled: boolean; channel: string };
type SlackConfig = Record<string, SlackEventConfig>;
type SlackChannel = { id: string; name: string; is_private: boolean };

export default function AdminSettings() {
  const { isSuperAdmin, user } = useAuth();
  const [sites, setSites] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<any>(null);
  const [deletingSiteId, setDeletingSiteId] = useState<string | null>(null);
  const [columnTemplateDialogOpen, setColumnTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [columnTemplates, setColumnTemplates] = useState<any[]>([]);

  // Webhook settings state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [reminderEmail, setReminderEmail] = useState('');
  const [noActiveAdsTarget, setNoActiveAdsTarget] = useState('admins');
  const [savingNoActiveAds, setSavingNoActiveAds] = useState(false);
  const [testingPostSubmitted, setTestingPostSubmitted] = useState(false);
  const [testingPostEdited, setTestingPostEdited] = useState(false);
  const [testingEditRequest, setTestingEditRequest] = useState(false);
  const [testingDateChange, setTestingDateChange] = useState(false);

  // Slack settings state
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackConfig, setSlackConfig] = useState<SlackConfig>(() => {
    const defaults: SlackConfig = {};
    EVENT_TYPES.forEach(e => { defaults[e.key] = { enabled: false, channel: '' }; });
    return defaults;
  });
  const [loadingSlackChannels, setLoadingSlackChannels] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlackEvent, setTestingSlackEvent] = useState<string | null>(null);

  // Test email state
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; status?: number; error?: string; message?: string } | null>(null);

  // Unscheduled assignments report
  const [unscheduledRecipients, setUnscheduledRecipients] = useState('');
  const [savingUnscheduled, setSavingUnscheduled] = useState(false);
  const [sendingUnscheduledNow, setSendingUnscheduledNow] = useState(false);

  // Welcome email state (default on; empty body = standard template in create-user)
  const [welcomeEmailEnabled, setWelcomeEmailEnabled] = useState(true);
  const [welcomeEmailBody, setWelcomeEmailBody] = useState('');
  const [savingWelcomeEmail, setSavingWelcomeEmail] = useState(false);

  // Onboarding (welcome card + Getting Started guide) — both default off
  const [welcomeCardEnabled, setWelcomeCardEnabled] = useState(false);
  const [guideEnabled, setGuideEnabled] = useState(false);
  const [guideContent, setGuideContent] = useState('');
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  useEffect(() => {
    if (user?.email) setTestEmailTo(user.email);
  }, [user?.email]);
  useEffect(() => {
    fetchData();
    fetchWebhookSettings();
    fetchSlackConfig();
    fetchSlackChannels();
    fetchWelcomeEmailSettings();
    fetchOnboardingSettings();
  }, []);

  const fetchData = async () => {
    try {
      const [sitesRes, orgsRes, templatesRes] = await Promise.all([
        supabase.from('sites').select('*').order('name'),
        supabase.from('organizations').select('*').order('name'),
        supabase.from('column_templates').select(`
          *,
          organization:organizations(name)
        `).order('name'),
      ]);

      if (sitesRes.error) throw sitesRes.error;
      if (orgsRes.error) throw orgsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      setSites(sitesRes.data || []);
      setOrganizations(orgsRes.data || []);
      setColumnTemplates(templatesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['zapier_webhook_url', 'display_ad_reminder_email', 'no_active_ads_notification_target', 'unscheduled_assignments_recipients']);

      if (error) throw error;
      if (data) {
        for (const row of data) {
          const val = row.value as string;
          const cleaned = val === '""' ? '' : val;
          if (row.key === 'zapier_webhook_url') setWebhookUrl(cleaned);
          if (row.key === 'display_ad_reminder_email') setReminderEmail(cleaned);
          if (row.key === 'no_active_ads_notification_target') setNoActiveAdsTarget(cleaned || 'admins');
          if (row.key === 'unscheduled_assignments_recipients') {
            // Stored as JSON array of emails
            const v = row.value as any;
            if (Array.isArray(v)) setUnscheduledRecipients(v.join(', '));
            else if (typeof v === 'string') setUnscheduledRecipients(v.replace(/^"|"$/g, ''));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching webhook settings:', error);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      const { error } = await supabase
        .from('admin_settings')
        .update({ value: webhookUrl || '""' })
        .eq('key', 'zapier_webhook_url');

      if (error) throw error;
      toast.success('Webhook URL saved successfully');
    } catch (error) {
      console.error('Error saving webhook:', error);
      toast.error('Failed to save webhook URL');
    }
  };

  const handleTestPostSubmittedWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTestingPostSubmitted(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const { error } = await supabase.functions.invoke('notify-admins', {
        body: {
          event_type: 'post_submitted',
          post_id: 'test-post-id-12345',
          post_headline: 'Test Post - Complete Webhook Field Demo',
          user_id: currentUser?.user?.id || 'test-user-id',
          user_name: 'Test User',
          user_email: currentUser?.user?.email || 'test@example.com',
          organization_id: 'test-org-id',
          organization_name: 'Test Organization',
          publication_date: new Date().toISOString().split('T')[0],
          admin_link: `${getAppBaseUrl()}/admin/assignments`,
          timestamp: new Date().toISOString(),
          additional_data: {
            test_mode: true,
            message: 'This is a test notification for POST SUBMITTED event',
            source: 'client_submit',
            site_name: 'Test Site',
            site_id: 'test-site-id',
          }
        }
      });

      if (error) throw error;
      toast.success('Test "Post Submitted" notification sent!');
    } catch (error: any) {
      console.error('Test webhook error:', error);
      toast.error('Failed to send test notification: ' + error.message);
    } finally {
      setTestingPostSubmitted(false);
    }
  };

  const handleTestPostEditedWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTestingPostEdited(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const { error } = await supabase.functions.invoke('notify-admins', {
        body: {
          event_type: 'post_edited',
          post_id: 'test-post-id-67890',
          post_headline: 'Test Post - Direct Edit Example',
          user_id: currentUser?.user?.id || 'test-user-id',
          user_name: 'Test User',
          user_email: currentUser?.user?.email || 'test@example.com',
          organization_id: 'test-org-id',
          organization_name: 'Test Organization',
          publication_date: new Date().toISOString().split('T')[0],
          admin_link: `${getAppBaseUrl()}/admin/assignments`,
          timestamp: new Date().toISOString(),
          additional_data: {
            test_mode: true,
            message: 'This is a test notification for POST EDITED event',
            direct_edit: true,
            edited_before_deadline: true,
          }
        }
      });

      if (error) throw error;
      toast.success('Test "Post Edited" notification sent!');
    } catch (error: any) {
      console.error('Test webhook error:', error);
      toast.error('Failed to send test notification: ' + error.message);
    } finally {
      setTestingPostEdited(false);
    }
  };

  const handleTestEditRequestWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTestingEditRequest(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const { error } = await supabase.functions.invoke('notify-admins', {
        body: {
          event_type: 'edit_request_submitted',
          post_id: 'test-post-id-11111',
          post_headline: 'Test Post - Edit Request Example',
          user_id: currentUser?.user?.id || 'test-user-id',
          user_name: 'Test User',
          user_email: currentUser?.user?.email || 'test@example.com',
          organization_id: 'test-org-id',
          organization_name: 'Test Organization',
          publication_date: new Date().toISOString().split('T')[0],
          admin_link: `${getAppBaseUrl()}/admin/tasks`,
          timestamp: new Date().toISOString(),
          additional_data: {
            test_mode: true,
            message: 'This is a test notification for EDIT REQUEST event',
            request_reason: 'Sample edit request reason',
            past_deadline: true,
            requires_admin_approval: true,
          }
        }
      });

      if (error) throw error;
      toast.success('Test "Edit Request" notification sent!');
    } catch (error: any) {
      console.error('Test webhook error:', error);
      toast.error('Failed to send test notification: ' + error.message);
    } finally {
      setTestingEditRequest(false);
    }
  };

  const handleTestDateChangeWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setTestingDateChange(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      
      const { error } = await supabase.functions.invoke('notify-admins', {
        body: {
          event_type: 'date_change_requested',
          post_id: '00000000-0000-0000-0000-000000000000',
          post_headline: 'Weekly Column - Test Assignment',
          user_id: currentUser?.user?.id || 'test-user-id',
          user_name: 'Test User',
          user_email: currentUser?.user?.email || 'test@example.com',
          organization_id: 'test-org-id',
          organization_name: 'Test Organization',
          publication_date: '2025-01-22',
          admin_link: `${getAppBaseUrl()}/admin/tasks`,
          timestamp: new Date().toISOString(),
          additional_data: {
            test_mode: true,
            message: 'This is a test notification for DATE CHANGE REQUEST event',
            request_type: 'date_change',
            assignment_id: 'test-assignment-456',
            assignment_name: 'Weekly Column - Test Assignment',
            old_due_date: '2025-01-15',
            new_due_date: '2025-01-22',
            request_reason: 'Client is traveling and won\'t be available for the original date.',
            instance_date: null
          }
        }
      });

      if (error) throw error;
      toast.success('Test "Date Change Request" notification sent!');
    } catch (error: any) {
      console.error('Test webhook error:', error);
      toast.error('Failed to send test notification: ' + error.message);
    } finally {
      setTestingDateChange(false);
    }
  };

  const fetchWelcomeEmailSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['welcome_email_enabled', 'welcome_email_body']);

      if (error) throw error;
      if (data) {
        for (const row of data) {
          if (row.key === 'welcome_email_enabled') setWelcomeEmailEnabled(!(row.value === false || row.value === 'false'));
          if (row.key === 'welcome_email_body') setWelcomeEmailBody(typeof row.value === 'string' ? row.value : '');
        }
      }
    } catch (error) {
      console.error('Error fetching welcome email settings:', error);
    }
  };

  const handleSaveWelcomeEmail = async () => {
    setSavingWelcomeEmail(true);
    try {
      for (const { key, value, desc } of [
        { key: 'welcome_email_enabled', value: welcomeEmailEnabled as any, desc: 'Whether welcome emails are sent to new users' },
        { key: 'welcome_email_body', value: welcomeEmailBody as any, desc: 'Body text for welcome emails sent to new users' },
      ]) {
        const { data: existing } = await supabase
          .from('admin_settings')
          .select('id')
          .eq('key', key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('admin_settings')
            .update({ value })
            .eq('key', key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('admin_settings')
            .insert({ key, value, description: desc });
          if (error) throw error;
        }
      }
      toast.success('Welcome email settings saved');
    } catch (error) {
      console.error('Error saving welcome email settings:', error);
      toast.error('Failed to save welcome email settings');
    } finally {
      setSavingWelcomeEmail(false);
    }
  };

  const fetchOnboardingSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['onboarding_welcome_card_enabled', 'onboarding_guide_enabled', 'onboarding_guide_content']);

      if (error) throw error;
      let foundContent = false;
      if (data) {
        for (const row of data) {
          if (row.key === 'onboarding_welcome_card_enabled') setWelcomeCardEnabled(row.value === true || row.value === 'true');
          if (row.key === 'onboarding_guide_enabled') setGuideEnabled(row.value === true || row.value === 'true');
          if (row.key === 'onboarding_guide_content') {
            foundContent = true;
            setGuideContent(typeof row.value === 'string' ? row.value : '');
          }
        }
      }
      // Seed the editor with the default guide on first use (no saved content yet)
      if (!foundContent) setGuideContent(DEFAULT_GUIDE_CONTENT);
    } catch (error) {
      console.error('Error fetching onboarding settings:', error);
    }
  };

  const handleSaveOnboarding = async () => {
    setSavingOnboarding(true);
    try {
      for (const { key, value, desc } of [
        { key: 'onboarding_welcome_card_enabled', value: welcomeCardEnabled as any, desc: 'Show the first-login welcome card to new clients' },
        { key: 'onboarding_guide_enabled', value: guideEnabled as any, desc: 'Show the Getting Started guide to clients' },
        { key: 'onboarding_guide_content', value: guideContent as any, desc: 'HTML content for the client Getting Started guide' },
      ]) {
        const { data: existing } = await supabase
          .from('admin_settings')
          .select('id')
          .eq('key', key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('admin_settings')
            .update({ value })
            .eq('key', key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('admin_settings')
            .insert({ key, value, description: desc });
          if (error) throw error;
        }
      }
      toast.success('Onboarding settings saved');
    } catch (error) {
      console.error('Error saving onboarding settings:', error);
      toast.error('Failed to save onboarding settings');
    } finally {
      setSavingOnboarding(false);
    }
  };

  const parseEmails = (raw: string): string[] => {
    return raw
      .split(/[\s,;\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  const handleSaveUnscheduledRecipients = async () => {
    const emails = parseEmails(unscheduledRecipients);
    const invalid = emails.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (invalid.length > 0) {
      toast.error(`Invalid email(s): ${invalid.join(', ')}`);
      return;
    }
    setSavingUnscheduled(true);
    try {
      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('key', 'unscheduled_assignments_recipients')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('admin_settings')
          .update({ value: emails as any })
          .eq('key', 'unscheduled_assignments_recipients');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_settings')
          .insert({
            key: 'unscheduled_assignments_recipients',
            value: emails as any,
            description: 'Override recipients for the monthly unscheduled assignments report. Empty = all admins.',
          });
        if (error) throw error;
      }
      toast.success(emails.length === 0
        ? 'Saved. Report will be sent to all admins.'
        : `Saved ${emails.length} recipient${emails.length === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error('Error saving unscheduled recipients:', error);
      toast.error('Failed to save recipients');
    } finally {
      setSavingUnscheduled(false);
    }
  };

  const handleSendUnscheduledNow = async () => {
    setSendingUnscheduledNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-unscheduled-assignments', {
        body: { force: true },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast.info('Report already sent today. Use again tomorrow or wait for the 1st of next month.');
      } else if ((data?.qualifying ?? 0) === 0) {
        toast.success('No unscheduled assignments found — nothing to send.');
      } else {
        toast.success(`Sent report (${data?.qualifying} assignment${data?.qualifying === 1 ? '' : 's'}) to ${data?.emailsSent} recipient${data?.emailsSent === 1 ? '' : 's'}.`);
      }
    } catch (error: any) {
      console.error('Error sending unscheduled report:', error);
      toast.error('Failed to send report: ' + error.message);
    } finally {
      setSendingUnscheduledNow(false);
    }
  };

  const fetchSlackChannels = async () => {
    setLoadingSlackChannels(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-list-channels');
      if (error) throw error;
      setSlackChannels(data?.channels || []);
    } catch (error) {
      console.error('Error fetching Slack channels:', error);
    } finally {
      setLoadingSlackChannels(false);
    }
  };

  const fetchSlackConfig = async () => {
    try {
      const { data } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'slack_notification_config')
        .maybeSingle();

      if (data?.value && typeof data.value === 'object') {
        setSlackConfig(prev => ({ ...prev, ...(data.value as SlackConfig) }));
      }
    } catch (error) {
      console.error('Error fetching Slack config:', error);
    }
  };

  const handleSaveSlackConfig = async () => {
    setSavingSlack(true);
    try {
      const { data: existing } = await supabase
        .from('admin_settings')
        .select('id')
        .eq('key', 'slack_notification_config')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('admin_settings')
          .update({ value: slackConfig as any })
          .eq('key', 'slack_notification_config');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('admin_settings')
          .insert({
            key: 'slack_notification_config',
            value: slackConfig as any,
            description: 'Slack notification settings per event type',
          });
        if (error) throw error;
      }
      toast.success('Slack notification settings saved');
    } catch (error) {
      console.error('Error saving Slack config:', error);
      toast.error('Failed to save Slack settings');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlackEvent = async (eventKey: string) => {
    const cfg = slackConfig[eventKey];
    if (!cfg?.enabled || !cfg?.channel) {
      toast.error('Enable the event and select a channel first');
      return;
    }

    setTestingSlackEvent(eventKey);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      const eventInfo = EVENT_TYPES.find(e => e.key === eventKey);

      const { error } = await supabase.functions.invoke('slack-notify', {
        body: {
          channel: cfg.channel,
          event_type: eventKey,
          event_label: `${eventInfo?.emoji} ${eventInfo?.label} (Test)`,
          user_name: 'Test User',
          user_email: currentUser?.user?.email || 'test@example.com',
          organization_name: 'Test Organization',
          post_headline: 'Test Notification',
          admin_link: `${getAppBaseUrl()}/admin/settings`,
          timestamp: new Date().toISOString(),
          additional_data: {
            test_mode: true,
            ...({
              post_submitted: { assignment_name: 'Sample Assignment', site_name: 'Test Site', has_featured_image: true },
              post_edited: { assignment_name: 'Sample Assignment', site_name: 'Test Site', changes_summary: ['Headline', 'Content'] },
              edit_request_submitted: { assignment_name: 'Sample Assignment', request_reason: 'Updated copy for accuracy' },
              date_change_requested: { assignment_name: 'Sample Assignment', old_due_date: 'March 10, 2026', new_due_date: 'March 17, 2026', request_reason: 'Need more time' },
              support_request: { description: 'Test support request description', page_url: getCleanCurrentUrl() },
              email_blast_submitted: { title: 'Test Blast', subject_line: 'Test Subject Line', site_name: 'Test Site', scheduled_date: 'March 15, 2026' },
              sponsorship_submitted: { site_name: 'Test Site', week_start_date: 'March 15, 2026' },
              ad_submitted: { ad_name: 'Test Ad', campaign_name: 'Test Campaign', site_name: 'Test Site', ad_dimensions: '300x250' },
            } as Record<string, any>)[eventKey] || {},
          },
        }
      });

      if (error) {
        // Parse the edge function error body for specific Slack error messages
        let message = error.message;
        try {
          if (error.context?.body) {
            const body = typeof error.context.body === 'string'
              ? JSON.parse(error.context.body)
              : await error.context.body.json?.();
            if (body?.error) message = body.error;
          }
        } catch {}
        throw new Error(message);
      }
      toast.success(`Test Slack notification sent for "${eventInfo?.label}"`);
    } catch (error: any) {
      console.error('Test Slack error:', error);
      toast.error('Failed to send test: ' + error.message);
    } finally {
    setTestingSlackEvent(null);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTo.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    setSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-email', {
        body: { to: testEmailTo.trim() },
      });

      if (error) throw error;

      setTestEmailResult(data);
      if (data?.success) {
        toast.success('Test email sent successfully!');
      } else {
        toast.error(`SendGrid returned status ${data?.status}`);
      }
    } catch (error: any) {
      console.error('Test email error:', error);
      const result = { success: false, error: error.message };
      setTestEmailResult(result);
      toast.error('Failed to send test email: ' + error.message);
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('id', siteId);

      if (error) throw error;
      toast.success('Site deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting site:', error);
      toast.error('Failed to delete site');
    } finally {
      setDeletingSiteId(null);
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
      fetchData();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    } finally {
      setDeletingTemplateId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage sites, templates, and notifications</p>
        </div>

        <div className="max-w-4xl space-y-6">
          <ChangePasswordCard />
          {isSuperAdmin && <W9SettingsCard />}
        </div>
      </div>

      <Tabs defaultValue={isSuperAdmin ? "sites" : "templates"} className="w-full">
        <TabsList>
          {isSuperAdmin && <TabsTrigger value="sites">Sites</TabsTrigger>}
          <TabsTrigger value="templates">Column Templates</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="notifications">Notifications</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="api-keys">API Keys</TabsTrigger>}
        </TabsList>

        <TabsContent value="sites" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">WordPress Sites</h2>
            <Button onClick={() => {
              setEditingSite(null);
              setSiteDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Site
            </Button>
          </div>

          <div className="space-y-4">
            {sites.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground">No sites configured yet.</p>
              </div>
            ) : (
              sites.map((site) => (
                <div key={site.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{site.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{site.url}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <p className="text-xs text-muted-foreground">
                          Username: {site.wordpress_username || 'Not configured'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Password: {site.wordpress_app_password ? '••••••••' : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {site.is_active ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          Inactive
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSite(site);
                          setSiteDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingSiteId(site.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Column Templates</h2>
            <Button onClick={() => {
              setEditingTemplate(null);
              setColumnTemplateDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Template
            </Button>
          </div>

          <div className="space-y-4">
            {columnTemplates.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-lg">
                <p className="text-muted-foreground">No column templates configured yet.</p>
              </div>
            ) : (
              columnTemplates.map((template) => (
                <div key={template.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-foreground">{template.name}</h3>
                        <Badge variant={template.is_active ? 'default' : 'secondary'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Organization: {template.organization?.name || 'Unknown'}
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Logo:</span>
                          <span>{template.logo_url ? '✓' : '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Author:</span>
                          <span>{template.author_name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Banner:</span>
                          <span>{template.banner_image_url ? '✓' : '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Intro:</span>
                          <span>{template.intro_paragraph ? '✓' : '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Featured Image:</span>
                          <span>{template.featured_image_url ? '✓' : '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTemplate(template);
                          setColumnTemplateDialogOpen(true);
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
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">Webhook Notifications</h2>
            <p className="text-muted-foreground mb-6">
              Send notifications to Zapier when posts are submitted or edited. 
              Configure your Zap to receive these notifications via email, Slack, SMS, or other integrations.
            </p>
            
            <div className="space-y-4">
              {/* Webhook URL Input */}
              <div>
                <Label htmlFor="webhook-url">Zapier Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="mt-2"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Create a Zap with a "Catch Hook" trigger in Zapier, then paste the webhook URL here.
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="space-y-4">
                <Button onClick={handleSaveWebhook}>
                  Save Webhook URL
                </Button>
                
                {/* Test Buttons for Each Event Type */}
                <div className="border border-border rounded-lg p-4 mt-4">
                  <h3 className="font-semibold mb-3">Test Webhook Events</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send test notifications to verify your Zapier integration is working correctly.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      variant="outline" 
                      onClick={handleTestPostSubmittedWebhook}
                      disabled={!webhookUrl || testingPostSubmitted}
                      className="border-green-500/50 text-green-600 hover:bg-green-500/10 hover:text-green-600"
                    >
                      <span className="mr-2">📝</span>
                      {testingPostSubmitted ? 'Sending...' : 'Test Post Submitted'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleTestPostEditedWebhook}
                      disabled={!webhookUrl || testingPostEdited}
                      className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10 hover:text-blue-600"
                    >
                      <span className="mr-2">✏️</span>
                      {testingPostEdited ? 'Sending...' : 'Test Post Edited'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleTestEditRequestWebhook}
                      disabled={!webhookUrl || testingEditRequest}
                      className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600"
                    >
                      <span className="mr-2">🔔</span>
                      {testingEditRequest ? 'Sending...' : 'Test Edit Request'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleTestDateChangeWebhook}
                      disabled={!webhookUrl || testingDateChange}
                      className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                    >
                      <span className="mr-2">📅</span>
                      {testingDateChange ? 'Sending...' : 'Test Date Change'}
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Event Type Descriptions */}
              <div className="mt-6 border border-border rounded-lg p-4">
                <h3 className="font-semibold mb-3">Event Types</h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">📝</span>
                    <div>
                      <strong>Post Submitted:</strong> When a client submits a new post or column
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">✏️</span>
                    <div>
                      <strong>Post Edited:</strong> When a client edits a post directly (before deadline)
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500">🔔</span>
                    <div>
                      <strong>Edit Request:</strong> When a client submits an edit request for review (after deadline)
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500">📅</span>
                    <div>
                      <strong>Date Change Request:</strong> When a client requests a new publication date
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            {/* Display Ad Reminder Email */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Display Ad Campaign Reminders</h2>
              <p className="text-muted-foreground mb-6">
                Receive email reminders when display ad campaigns are approaching their end date.
                The reminder lead time varies by campaign duration (1 week for short campaigns, 2 weeks for medium, 1 month for long).
              </p>
              <div>
                <Label htmlFor="reminder-email">Reminder Email Address</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="reminder-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={reminderEmail}
                    onChange={(e) => setReminderEmail(e.target.value)}
                  />
                  <Button onClick={async () => {
                    try {
                      const { error } = await supabase
                        .from('admin_settings')
                        .update({ value: reminderEmail || '""' })
                        .eq('key', 'display_ad_reminder_email');
                      if (error) throw error;
                      toast.success('Reminder email saved successfully');
                    } catch (error) {
                      console.error('Error saving reminder email:', error);
                      toast.error('Failed to save reminder email');
                    }
                  }}>
                    Save
                  </Button>
                </div>
              </div>
            </div>

            {/* Weekly No Active Ads Report */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Weekly No Active Ads Report</h2>
              <p className="text-muted-foreground mb-6">
                Every Monday morning, the system checks all active display ad campaigns and identifies those with no active ad placements.
                Choose who should receive the weekly report.
              </p>
              <div className="space-y-4">
                <RadioGroup value={noActiveAdsTarget} onValueChange={setNoActiveAdsTarget}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="admins" id="target-admins" />
                    <Label htmlFor="target-admins">Admins Only</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="clients" id="target-clients" />
                    <Label htmlFor="target-clients">Clients Only</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="target-both" />
                    <Label htmlFor="target-both">Both Admins & Clients</Label>
                  </div>
                </RadioGroup>
                <Button
                  disabled={savingNoActiveAds}
                  onClick={async () => {
                    setSavingNoActiveAds(true);
                    try {
                      const { data: existing } = await supabase
                        .from('admin_settings')
                        .select('id')
                        .eq('key', 'no_active_ads_notification_target')
                        .single();

                      if (existing) {
                        const { error } = await supabase
                          .from('admin_settings')
                          .update({ value: noActiveAdsTarget })
                          .eq('key', 'no_active_ads_notification_target');
                        if (error) throw error;
                      } else {
                        const { error } = await supabase
                          .from('admin_settings')
                          .insert({
                            key: 'no_active_ads_notification_target',
                            value: noActiveAdsTarget,
                            description: 'Who receives the weekly no-active-ads report: admins, clients, or both',
                          });
                        if (error) throw error;
                      }
                      toast.success('Notification preference saved');
                    } catch (error) {
                      console.error('Error saving no-active-ads preference:', error);
                      toast.error('Failed to save preference');
                    } finally {
                      setSavingNoActiveAds(false);
                    }
                  }}
                >
                  {savingNoActiveAds ? 'Saving...' : 'Save Preference'}
                </Button>
              </div>
            </div>

            {/* Monthly Unscheduled Assignments Report */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Monthly Unscheduled Assignments Report</h2>
              <p className="text-muted-foreground mb-6">
                On the 1st of every month, the system emails a report of all one-time assignments
                that don't yet have a publication date. By default, every admin receives it.
                You can override the recipients below — leave blank to keep the default.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="unscheduled-recipients">Recipient Email Addresses</Label>
                  <Input
                    id="unscheduled-recipients"
                    type="text"
                    placeholder="alice@example.com, bob@example.com"
                    value={unscheduledRecipients}
                    onChange={(e) => setUnscheduledRecipients(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Separate multiple addresses with commas. Leave empty to send to all admins.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSaveUnscheduledRecipients} disabled={savingUnscheduled}>
                    {savingUnscheduled ? 'Saving...' : 'Save Recipients'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSendUnscheduledNow}
                    disabled={sendingUnscheduledNow}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {sendingUnscheduledNow ? 'Sending...' : 'Send Report Now'}
                  </Button>
                </div>
              </div>
            </div>


            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Slack Notifications</h2>
              <p className="text-muted-foreground mb-6">
                Send notifications to Slack channels when events occur. Configure which events trigger notifications and which channel receives them.
              </p>

              <div className="space-y-4">
                {EVENT_TYPES.map((event) => {
                  const cfg = slackConfig[event.key] || { enabled: false, channel: '' };
                  return (
                    <div key={event.key} className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg">
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={(checked) =>
                            setSlackConfig(prev => ({
                              ...prev,
                              [event.key]: { ...prev[event.key], enabled: checked },
                            }))
                          }
                        />
                        <span className="text-lg">{event.emoji}</span>
                        <span className="text-sm font-medium">{event.label}</span>
                      </div>

                      <div className="flex-1">
                        <Select
                          value={cfg.channel || 'none'}
                          onValueChange={(val) =>
                            setSlackConfig(prev => ({
                              ...prev,
                              [event.key]: { ...prev[event.key], channel: val === 'none' ? '' : val },
                            }))
                          }
                          disabled={!cfg.enabled}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={loadingSlackChannels ? 'Loading channels...' : 'Select channel'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No channel</SelectItem>
                            {slackChannels.map(ch => (
                              <SelectItem key={ch.id} value={ch.id}>
                                <span className="flex items-center gap-1.5">
                                  {ch.is_private ? <Lock className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                                  {ch.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!cfg.enabled || !cfg.channel || testingSlackEvent === event.key}
                        onClick={() => handleTestSlackEvent(event.key)}
                      >
                        {testingSlackEvent === event.key ? 'Sending...' : 'Test'}
                      </Button>
                    </div>
                  );
                })}

                <div className="flex gap-3 pt-2">
                  <Button onClick={handleSaveSlackConfig} disabled={savingSlack}>
                    {savingSlack ? 'Saving...' : 'Save Slack Settings'}
                  </Button>
                  <Button variant="outline" onClick={fetchSlackChannels} disabled={loadingSlackChannels}>
                    {loadingSlackChannels ? 'Loading...' : 'Refresh Channels'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Welcome Email */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Welcome Email</h2>
              <p className="text-muted-foreground mb-6">
                Automatically send a welcome email to new users when their account is created.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={welcomeEmailEnabled}
                    onCheckedChange={setWelcomeEmailEnabled}
                  />
                  <Label>Send welcome email to new users</Label>
                </div>
                <div>
                  <Label htmlFor="welcome-email-body">Email Body</Label>
                  <textarea
                    id="welcome-email-body"
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2"
                    value={welcomeEmailBody}
                    onChange={(e) => setWelcomeEmailBody(e.target.value)}
                    placeholder="Leave empty to use the standard template, which includes a one-click account setup button."
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Sent automatically when a new user is created. Leave the body empty to use the standard template (includes a one-click account setup button). Available variables: <code className="bg-muted px-1 rounded">{'{{full_name}}'}</code>, <code className="bg-muted px-1 rounded">{'{{email}}'}</code>, <code className="bg-muted px-1 rounded">{'{{portal_url}}'}</code>, <code className="bg-muted px-1 rounded">{'{{setup_link}}'}</code>
                  </p>
                </div>
                <Button onClick={handleSaveWelcomeEmail} disabled={savingWelcomeEmail}>
                  {savingWelcomeEmail ? 'Saving...' : 'Save Welcome Email Settings'}
                </Button>
              </div>
            </div>

            {/* Onboarding (welcome card + Getting Started guide) */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Client Onboarding</h2>
              <p className="text-muted-foreground mb-6">
                Optional in-portal onboarding for clients. Both are off by default.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <Switch checked={welcomeCardEnabled} onCheckedChange={setWelcomeCardEnabled} />
                  <Label>Show the first-login welcome card on a new client's dashboard</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={guideEnabled} onCheckedChange={setGuideEnabled} />
                  <Label>Show the Getting Started guide to clients</Label>
                </div>
                <div>
                  <Label>Getting Started guide content</Label>
                  <p className="text-sm text-muted-foreground mt-1 mb-2">
                    Shown to clients at /client/guide when the guide is enabled. Keep it text-focused; large embedded images bloat the stored content.
                  </p>
                  <RichTextEditor content={guideContent} onChange={setGuideContent} />
                </div>
                <Button onClick={handleSaveOnboarding} disabled={savingOnboarding}>
                  {savingOnboarding ? 'Saving...' : 'Save Onboarding Settings'}
                </Button>
              </div>
            </div>

            {/* Test Email */}
            <div className="border-t border-border pt-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">Test Email (SendGrid)</h2>
              <p className="text-muted-foreground mb-6">
                Send a test email to verify that the SendGrid API key is configured correctly and emails can be delivered.
              </p>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="test-email-to">Recipient Email</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="test-email-to"
                      type="email"
                      placeholder="admin@example.com"
                      value={testEmailTo}
                      onChange={(e) => setTestEmailTo(e.target.value)}
                    />
                    <Button
                      onClick={handleSendTestEmail}
                      disabled={sendingTestEmail || !testEmailTo.trim()}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {sendingTestEmail ? 'Sending...' : 'Send Test'}
                    </Button>
                  </div>
                </div>

                {testEmailResult && (
                  <div className={`p-4 rounded-lg border ${testEmailResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
                    <p className={`font-medium ${testEmailResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                      {testEmailResult.success ? '✅ Email sent successfully' : `❌ Failed (Status: ${testEmailResult.status || 'unknown'})`}
                    </p>
                    {testEmailResult.error && (
                      <pre className="mt-2 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap break-all bg-red-100 dark:bg-red-900/30 p-3 rounded">
                        {testEmailResult.error}
                      </pre>
                    )}
                    {testEmailResult.success && (
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Check your inbox for the test email from content@lnn.co
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="api-keys" className="mt-6">
            <ApiKeysManager />
          </TabsContent>
        )}
      </Tabs>

      <SiteDialog
        open={siteDialogOpen}
        onOpenChange={setSiteDialogOpen}
        onSuccess={fetchData}
        editingSite={editingSite}
      />

      <ColumnTemplateDialog
        open={columnTemplateDialogOpen}
        onOpenChange={setColumnTemplateDialogOpen}
        onSuccess={fetchData}
        editingTemplate={editingTemplate}
        organizations={organizations}
      />

      <AlertDialog open={!!deletingSiteId} onOpenChange={() => setDeletingSiteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this site and all associated assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingSiteId && handleDeleteSite(deletingSiteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}
