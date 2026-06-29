import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getAppBaseUrl } from '@/lib/utils';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import { SimpleRichTextEditor } from '@/components/SimpleRichTextEditor';
import { SubjectLineAnalysisDialog } from '@/components/SubjectLineAnalysisDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, ChevronDown, Calendar, Globe, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { getSubjectLineStatus } from '@/lib/subjectLineUtils';

interface Assignment {
  id: string;
  assignment_name: string;
  due_date: string;
  site_id: string;
  site?: {
    id: string;
    name: string;
    url: string;
  };
}

interface BlastFormData {
  title: string;
  subjectLine: string;
  previewText: string;
  mainImageUrl: string | null;
  clickUrl: string;
  headline: string;
  bodyContent: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  secondaryImageUrl: string | null;
}

const DRAFT_STORAGE_KEY = 'submit_blast_autosave';

export default function ClientSubmitBlast() {
  const { user, activeOrganizationId, activeOrganizationName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentIdFromUrl = searchParams.get('assignment');
  const draftId = searchParams.get('draft');

  // Form state
  const [formData, setFormData] = useState<BlastFormData>({
    title: '',
    subjectLine: '',
    previewText: '',
    mainImageUrl: null,
    clickUrl: '',
    headline: '',
    bodyContent: '',
    ctaButtonText: '',
    ctaButtonUrl: '',
    secondaryImageUrl: null,
  });

  // UI state
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(assignmentIdFromUrl);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [sitePlatform, setSitePlatform] = useState<'beehiiv' | 'mailchimp' | 'none'>('beehiiv');

  // Optional sections state
  const [openSections, setOpenSections] = useState({
    headline: false,
    bodyContent: false,
    ctaButton: false,
    secondaryImage: false,
  });

  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);

  // Check the site's email platform when assignment changes
  // (sites_public exposes a computed email_platform so clients never read raw config)
  useEffect(() => {
    const checkPlatform = async () => {
      if (!selectedAssignment?.site_id) {
        setSitePlatform('beehiiv'); // default when no assignment selected
        return;
      }
      try {
        const { data: siteData } = await supabase
          .from('sites_public')
          .select('email_platform')
          .eq('id', selectedAssignment.site_id)
          .single();
        const platform = siteData?.email_platform;
        setSitePlatform(
          platform === 'mailchimp' ? 'mailchimp' : platform === 'none' ? 'none' : 'beehiiv'
        );
      } catch {
        setSitePlatform('beehiiv'); // fallback on error (platform path degrades gracefully)
      }
    };
    checkPlatform();
  }, [selectedAssignment?.site_id]);

  // Load available email blast assignments
  useEffect(() => {
    if (activeOrganizationId) {
      loadAssignments();
    }
  }, [activeOrganizationId]);

  // Load draft if editing
  useEffect(() => {
    if (draftId) {
      loadDraft(draftId);
    } else {
      restoreFromLocalStorage();
    }
  }, [draftId]);

  // Autosave to localStorage
  useEffect(() => {
    if (draftId) return;
    const timeoutId = setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        ...formData,
        savedAt: Date.now(),
      }));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [formData, draftId]);

  const loadAssignments = async () => {
    try {
      setIsLoadingAssignments(true);
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          id,
          assignment_name,
          due_date,
          site_id,
          site:sites_public(id, name, url)
        `)
        .eq('organization_id', activeOrganizationId)
        .eq('content_category', 'email_blast')
        .eq('is_completed', false)
        .eq('is_skipped', false)
        .order('due_date', { ascending: true });

      if (error) throw error;

      const formattedAssignments = (data || []).map(a => ({
        ...a,
        site: Array.isArray(a.site) ? a.site[0] : a.site,
      }));
      setAssignments(formattedAssignments);
      
      // Auto-select if only one or if from URL
      if (assignmentIdFromUrl && formattedAssignments.some(a => a.id === assignmentIdFromUrl)) {
        setSelectedAssignmentId(assignmentIdFromUrl);
      } else if (assignmentIdFromUrl) {
        // Deep-link doesn't match an email_blast assignment in this org —
        // check whether it belongs to a different content category and reroute.
        const { data: anyCategory } = await supabase
          .from('post_assignments')
          .select('content_category')
          .eq('id', assignmentIdFromUrl)
          .maybeSingle();
        if (anyCategory?.content_category === 'website') {
          toast.info('This is a sponsored post assignment — opening the right page.');
          navigate(`/client/submit?assignment=${assignmentIdFromUrl}`, { replace: true });
          return;
        }
        if (anyCategory?.content_category === 'email_sponsorship') {
          toast.info('This is an Email Sponsorship assignment — opening the right page.');
          navigate(`/client/submit-sponsorship?assignment=${assignmentIdFromUrl}`, { replace: true });
          return;
        }
        if (formattedAssignments.length === 1) {
          setSelectedAssignmentId(formattedAssignments[0].id);
        }
      } else if (formattedAssignments.length === 1) {
        setSelectedAssignmentId(formattedAssignments[0].id);
      }
    } catch (error: any) {
      console.error('Failed to load assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const loadDraft = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('email_blasts')
        .select('*')
        .eq('id', id)
        .eq('client_id', user?.id)
        .eq('status', 'draft')
        .single();

      if (error) throw error;
      if (data) {
        setFormData({
          title: data.title || '',
          subjectLine: data.subject_line || '',
          previewText: (data as any).preview_text || '',
          mainImageUrl: data.main_image_url || null,
          clickUrl: data.click_url || '',
          headline: data.headline || '',
          bodyContent: data.body_content || '',
          ctaButtonText: data.cta_button_text || '',
          ctaButtonUrl: data.cta_button_url || '',
          secondaryImageUrl: data.secondary_image_url || null,
        });
        setSelectedAssignmentId(data.assignment_id);
        
        // Open sections that have content
        setOpenSections({
          headline: !!data.headline,
          bodyContent: !!data.body_content,
          ctaButton: !!(data.cta_button_text || data.cta_button_url),
          secondaryImage: !!data.secondary_image_url,
        });
        
        setIsEditingDraft(true);
        toast.success('Draft loaded successfully');
      }
    } catch (error: any) {
      toast.error('Failed to load draft: ' + error.message);
      navigate('/client/email-marketing');
    }
  };

  const restoreFromLocalStorage = useCallback(() => {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      setFormData({
        title: data.title || '',
        subjectLine: data.subjectLine || '',
        previewText: data.previewText || '',
        mainImageUrl: data.mainImageUrl || null,
        clickUrl: data.clickUrl || '',
        headline: data.headline || '',
        bodyContent: data.bodyContent || '',
        ctaButtonText: data.ctaButtonText || '',
        ctaButtonUrl: data.ctaButtonUrl || '',
        secondaryImageUrl: data.secondaryImageUrl || null,
      });
    } catch (e) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  const updateForm = (field: keyof BlastFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (requireImage = true): string[] => {
    const errors: string[] = [];
    if (!formData.title.trim()) errors.push('Title is required');
    if (!formData.subjectLine.trim()) errors.push('Subject line is required');
    if (requireImage && !formData.mainImageUrl) errors.push('Main image is required');
    if (!formData.clickUrl.trim()) errors.push('Click-through URL is required');
    if (!selectedAssignmentId) errors.push('Please select an assignment');
    return errors;
  };

  const resolveImageUrl = async (url: string | null): Promise<string | null> => {
    if (!url || !url.includes('editor-images')) return url;

    const pathMatch = url.match(/editor-images\/(.+)$/);
    if (!pathMatch) return url;
    const storagePath = decodeURIComponent(pathMatch[1]);

    const { data } = await supabase
      .from('image_uploads')
      .select('public_url, status')
      .or(`storage_path.eq.${storagePath},storage_path.eq.${storagePath.replace(/(\.[^.]+)$/, '_optimized$1')}`)
      .eq('status', 'ready')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.public_url || url;
  };

  const handleSaveDraft = async () => {
    const errors = validateForm(false);
    if (!formData.title.trim()) {
      toast.error('Please enter a title before saving');
      return;
    }

    setIsSavingDraft(true);
    try {
      const resolvedMainImage = await resolveImageUrl(formData.mainImageUrl);
      const resolvedSecondaryImage = await resolveImageUrl(formData.secondaryImageUrl);

      const blastData = {
        title: formData.title,
        subject_line: formData.subjectLine || formData.title,
        preview_text: formData.previewText || null,
        main_image_url: resolvedMainImage || '',
        click_url: formData.clickUrl || '',
        headline: formData.headline || null,
        body_content: formData.bodyContent || null,
        cta_button_text: formData.ctaButtonText || null,
        cta_button_url: formData.ctaButtonUrl || null,
        secondary_image_url: formData.secondaryImageUrl || null,
        assignment_id: selectedAssignmentId,
        organization_id: activeOrganizationId,
        site_id: selectedAssignment?.site_id,
        client_id: user?.id,
        status: 'draft',
        scheduled_date: selectedAssignment?.due_date,
      };

      if (isEditingDraft && draftId) {
        const { error } = await supabase
          .from('email_blasts')
          .update(blastData)
          .eq('id', draftId)
          .eq('client_id', user?.id);
        if (error) throw error;
        toast.success('Draft updated');
      } else {
        const { error } = await supabase
          .from('email_blasts')
          .insert([blastData]);
        if (error) throw error;
        toast.success('Draft saved');
      }
      
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      navigate('/client/email-marketing');
    } catch (error: any) {
      toast.error('Failed to save draft: ' + error.message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    const errors = validateForm(true);
    if (errors.length > 0) {
      errors.forEach(e => toast.error(e));
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedMainImage = await resolveImageUrl(formData.mainImageUrl);
      const resolvedSecondaryImage = await resolveImageUrl(formData.secondaryImageUrl);

      // Fetch user profile for notifications
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user!.id)
        .single();

      if (sitePlatform === 'none') {
        // === No email platform: save as submitted + create admin request ===
        const blastData = {
          title: formData.title,
          subject_line: formData.subjectLine,
          preview_text: formData.previewText || null,
          main_image_url: resolvedMainImage!,
          click_url: formData.clickUrl,
          headline: formData.headline || null,
          body_content: formData.bodyContent || null,
          cta_button_text: formData.ctaButtonText || null,
          cta_button_url: formData.ctaButtonUrl || null,
          secondary_image_url: resolvedSecondaryImage || null,
          assignment_id: selectedAssignmentId,
          organization_id: activeOrganizationId,
          site_id: selectedAssignment?.site_id,
          client_id: user?.id,
          status: 'submitted',
          scheduled_date: selectedAssignment?.due_date,
          submitted_at: new Date().toISOString(),
        };

        let blastId = draftId;
        if (isEditingDraft && draftId) {
          const { error } = await supabase
            .from('email_blasts')
            .update(blastData)
            .eq('id', draftId)
            .eq('client_id', user?.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('email_blasts')
            .insert([blastData])
            .select()
            .single();
          if (error) throw error;
          blastId = data.id;
        }

        // Mark assignment completed
        if (selectedAssignmentId) {
          await supabase
            .from('post_assignments')
            .update({
              is_completed: true,
              completed_at: new Date().toISOString(),
            })
            .eq('id', selectedAssignmentId);
        }

        // Notify admins
        try {
          await supabase.functions.invoke('notify-admins', {
            body: {
              event_type: 'email_blast_submitted',
              post_headline: formData.title,
              user_id: user!.id,
              user_name: userProfile?.full_name || userProfile?.email || '',
              user_email: userProfile?.email || '',
              organization_id: activeOrganizationId,
              organization_name: activeOrganizationName,
              admin_link: `${getAppBaseUrl()}/admin/tasks`,
              timestamp: new Date().toISOString(),
              additional_data: {
                title: formData.title,
                subject_line: formData.subjectLine,
                site_name: selectedAssignment?.site?.name,
                scheduled_date: selectedAssignment?.due_date,
                manual_processing: true,
                content_type: 'Email Blast',
              },
            },
          });
        } catch (notifyErr) {
          console.error('Notification failed:', notifyErr);
        }

        localStorage.removeItem(DRAFT_STORAGE_KEY);
        toast.success('Email blast submitted for manual processing');
        navigate('/client/email-marketing');
      } else {
        // === Platform path (Beehiiv or Mailchimp): create a draft in the platform ===
        const platformLabel = sitePlatform === 'mailchimp' ? 'Mailchimp' : 'Beehiiv';
        const platformFunction = sitePlatform === 'mailchimp'
          ? 'create-mailchimp-campaign'
          : 'create-beehiiv-draft';

        const blastData = {
          title: formData.title,
          subject_line: formData.subjectLine,
          preview_text: formData.previewText || null,
          main_image_url: resolvedMainImage!,
          click_url: formData.clickUrl,
          headline: formData.headline || null,
          body_content: formData.bodyContent || null,
          cta_button_text: formData.ctaButtonText || null,
          cta_button_url: formData.ctaButtonUrl || null,
          secondary_image_url: resolvedSecondaryImage || null,
          assignment_id: selectedAssignmentId,
          organization_id: activeOrganizationId,
          site_id: selectedAssignment?.site_id,
          client_id: user?.id,
          status: 'draft',
          scheduled_date: selectedAssignment?.due_date,
        };

        let blastId = draftId;
        if (isEditingDraft && draftId) {
          const { error } = await supabase
            .from('email_blasts')
            .update(blastData)
            .eq('id', draftId)
            .eq('client_id', user?.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('email_blasts')
            .insert([blastData])
            .select()
            .single();
          if (error) throw error;
          blastId = data.id;
        }

        // Attempt platform draft creation
        let platformNotConfigured = false;

        try {
          const { data: platformData, error: platformError } = await supabase.functions.invoke(platformFunction, {
            body: { blastId, siteId: selectedAssignment?.site_id },
          });

          if (platformError) {
            console.error(`${platformLabel} draft creation failed:`, platformError);
            toast.error(`${platformLabel} draft creation failed. Your blast has been saved as a draft — you can retry.`);
            return;
          }

          if (platformData?.notConfigured) {
            platformNotConfigured = true;
          } else if (!platformData?.success) {
            console.error(`${platformLabel} returned failure:`, platformData);
            toast.error(`${platformLabel} error: ${platformData?.error || 'Unknown error'}. Your blast has been saved as a draft.`);
            return;
          }
        } catch (platformErr: any) {
          console.error(`${platformLabel} error:`, platformErr);
          toast.error(`Failed to create ${platformLabel} draft. Your blast has been saved as a draft — you can retry.`);
          return;
        }

        // Finalize the blast as submitted
        const { error: finalizeError } = await supabase
          .from('email_blasts')
          .update({ status: 'submitted', submitted_at: new Date().toISOString() })
          .eq('id', blastId);

        if (finalizeError) {
          console.error('Failed to finalize blast:', finalizeError);
          toast.error(`Blast was sent to ${platformLabel} but failed to update status. Please contact support.`);
          return;
        }

        // Mark assignment completed
        if (selectedAssignmentId) {
          await supabase
            .from('post_assignments')
            .update({ is_completed: true, completed_at: new Date().toISOString() })
            .eq('id', selectedAssignmentId);
        }

        // Notify admins
        try {
          await supabase.functions.invoke('notify-admins', {
            body: {
              event_type: 'email_blast_submitted',
              post_headline: formData.title,
              user_id: user!.id,
              user_name: userProfile?.full_name || userProfile?.email || '',
              user_email: userProfile?.email || '',
              organization_id: activeOrganizationId,
              organization_name: activeOrganizationName,
              admin_link: `${getAppBaseUrl()}/admin/tasks`,
              timestamp: new Date().toISOString(),
              additional_data: {
                title: formData.title,
                subject_line: formData.subjectLine,
                site_name: selectedAssignment?.site?.name,
                scheduled_date: selectedAssignment?.due_date,
                content_type: 'Email Blast',
              },
            },
          });
        } catch (notifyErr) {
          console.error('Notification failed:', notifyErr);
        }

        localStorage.removeItem(DRAFT_STORAGE_KEY);
        if (platformNotConfigured) {
          toast.success(`Email blast submitted (manual processing — ${platformLabel} not configured for this site)`);
        } else {
          toast.success(`Email blast submitted and ${platformLabel} draft created!`);
        }
        navigate('/client/email-marketing');
      }
    } catch (error: any) {
      toast.error('Failed to submit: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate('/client/email-marketing')}
          className="hover:text-foreground transition-colors"
        >
          Email Marketing
        </button>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">
          {isEditingDraft ? 'Edit Email Blast Draft' : 'Submit Email Blast'}
        </span>
      </nav>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          {isEditingDraft ? 'Edit Email Blast Draft' : 'Submit Email Blast'}
        </h1>
      </div>

      {/* Assignment Selection */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Assignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingAssignments ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <p className="text-muted-foreground">
              No email blast assignments available. Please contact your administrator.
            </p>
          ) : (
            <Select value={selectedAssignmentId || ''} onValueChange={setSelectedAssignmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an assignment" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <span>{a.assignment_name}</span>
                      <span className="text-muted-foreground">
                        • {format(parseISO(a.due_date), 'MMM d, yyyy')}
                      </span>
                      {a.site?.name && (
                        <span className="text-muted-foreground">• {a.site.name}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {selectedAssignment && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Send Date: {format(parseISO(selectedAssignment.due_date), 'EEEE, MMMM d, yyyy')}</span>
                </div>
                {selectedAssignment.site?.name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <span>{selectedAssignment.site.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Required Fields */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Required Fields</CardTitle>
          <CardDescription>
            These fields are required for all email blasts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title (internal reference)</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={e => updateForm('title', e.target.value)}
              placeholder="e.g., Spring Sale Announcement"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="subjectLine">Email Subject Line</Label>
            <Input
              id="subjectLine"
              value={formData.subjectLine}
              onChange={e => updateForm('subjectLine', e.target.value)}
              placeholder="The subject line recipients will see"
              className="mt-1.5"
            />
            {(() => {
              const status = getSubjectLineStatus(formData.subjectLine.length);
              return (
                <p className={`text-xs mt-1 ${status.color}`}>
                  {formData.subjectLine.length} characters — {status.label}
                </p>
              );
            })()}
          </div>

          <div>
            <Label htmlFor="previewText">Preview Text (optional)</Label>
            <Input
              id="previewText"
              value={formData.previewText}
              onChange={e => updateForm('previewText', e.target.value)}
              placeholder="Shown in inbox below the subject line"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              If left blank, the email provider will auto-generate preview text
            </p>
          </div>

          <div>
            <Label>Main Image</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Upload at 1120px wide or larger for sharp display on all screens. Images are automatically optimized.
            </p>
            <SingleImageUpload
              imageUrl={formData.mainImageUrl}
              onImageChange={url => updateForm('mainImageUrl', url)}
              aspectRatio="auto"
            />
          </div>

          <div>
            <Label htmlFor="clickUrl">Click-through URL</Label>
            <UrlInput
              id="clickUrl"
              value={formData.clickUrl}
              onValueChange={val => updateForm('clickUrl', val)}
              placeholder="https://example.com/landing-page"
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Where readers go when they click the main image
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Optional Enhancements */}
      {<Card className="mb-6">
        <CardHeader>
          <CardTitle>Optional Enhancements</CardTitle>
          <CardDescription>
            Add extra content to your email blast
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Headline */}
          <Collapsible open={openSections.headline} onOpenChange={() => toggleSection('headline')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <span className="font-medium">Headline</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections.headline ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <Label htmlFor="headline" className="sr-only">Headline</Label>
              <Input
                id="headline"
                value={formData.headline}
                onChange={e => updateForm('headline', e.target.value)}
                placeholder="A bold headline displayed below the image"
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Body Content */}
          <Collapsible open={openSections.bodyContent} onOpenChange={() => toggleSection('bodyContent')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <span className="font-medium">Body Text</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections.bodyContent ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <SimpleRichTextEditor
                content={formData.bodyContent}
                onChange={val => updateForm('bodyContent', val)}
                placeholder="Add formatted text content..."
                minHeight="150px"
                enableItalic
                enableBulletList
                enableOrderedList
                hideWordCount
              />
            </CollapsibleContent>
          </Collapsible>

          {/* CTA Button */}
          <Collapsible open={openSections.ctaButton} onOpenChange={() => toggleSection('ctaButton')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <span className="font-medium">Call-to-Action Button</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections.ctaButton ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3 space-y-3">
              <div>
                <Label htmlFor="ctaText">Button Text</Label>
                <Input
                  id="ctaText"
                  value={formData.ctaButtonText}
                  onChange={e => updateForm('ctaButtonText', e.target.value)}
                  placeholder="e.g., Shop Now, Learn More"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ctaUrl">Button URL</Label>
                <UrlInput
                  id="ctaUrl"
                  value={formData.ctaButtonUrl}
                  onValueChange={val => updateForm('ctaButtonUrl', val)}
                  placeholder="https://example.com/offer"
                  className="mt-1"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Secondary Image */}
          <Collapsible open={openSections.secondaryImage} onOpenChange={() => toggleSection('secondaryImage')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                <span className="font-medium">Secondary Image</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections.secondaryImage ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <SingleImageUpload
                imageUrl={formData.secondaryImageUrl}
                onImageChange={url => updateForm('secondaryImageUrl', url)}
                aspectRatio="auto"
                description="Optional additional image below the main content"
              />
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>}

      {/* Design Request Dialog rendered below */}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleSaveDraft}
          disabled={isSavingDraft || isSubmitting}
        >
          {isSavingDraft ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save as Draft
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            const errors = validateForm(true);
            if (errors.length > 0) {
              errors.forEach(e => toast.error(e));
              return;
            }
            setShowAnalysisDialog(true);
          }}
          disabled={isSubmitting || isSavingDraft || !selectedAssignmentId}
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Analyze and Submit
        </Button>
      </div>

      <SubjectLineAnalysisDialog
        open={showAnalysisDialog}
        onOpenChange={setShowAnalysisDialog}
        subjectLine={formData.subjectLine}
        siteName={selectedAssignment?.site?.name || 'the publication'}
        mainImageUrl={formData.mainImageUrl || undefined}
        title={formData.title}
        bodyContent={formData.bodyContent || undefined}
        onSubjectLineChange={(newLine) => updateForm('subjectLine', newLine)}
        onSubmit={handleSubmit}
      />

    </div>
  );
}
