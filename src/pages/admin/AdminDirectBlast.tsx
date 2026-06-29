import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SingleImageUpload } from '@/components/SingleImageUpload';
import { SimpleRichTextEditor } from '@/components/SimpleRichTextEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Send, ChevronDown, Calendar, Globe, Building2, CheckCircle, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { getSubjectLineStatus } from '@/lib/subjectLineUtils';
import { recordAudit } from '@/lib/audit';

interface Site {
  id: string;
  name: string;
  url: string;
  beehiiv_config: unknown;
  mailchimp_config: unknown;
}

interface Organization {
  id: string;
  name: string;
}


interface Assignment {
  id: string;
  assignment_name: string;
  due_date: string;
  site_id: string;
  assigned_to: string | null;
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

export default function AdminDirectBlast() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Selection state
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{ show: boolean; platformUrl: string | null; platformLabel: string } | null>(null);

  // Optional sections state
  const [openSections, setOpenSections] = useState({
    headline: false,
    bodyContent: false,
    ctaButton: false,
    secondaryImage: false,
  });

  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  useEffect(() => {
    fetchSites();
    fetchOrganizations();
  }, []);

  // Load assignments when org + site selected
  useEffect(() => {
    if (selectedOrgId && selectedSiteId) {
      fetchAssignments();
    } else {
      setAssignments([]);
      setSelectedAssignmentId('');
    }
  }, [selectedOrgId, selectedSiteId]);

  // Determine the selected site's email platform (Beehiiv takes precedence if both configured)
  const beehiivConfig = selectedSite?.beehiiv_config as any;
  const mailchimpConfig = selectedSite?.mailchimp_config as any;
  const hasBeehiivConfig = !!(beehiivConfig?.api_key && beehiivConfig?.publication_id);
  const hasMailchimpConfig = !!(mailchimpConfig?.api_key && mailchimpConfig?.audience_id);
  const sitePlatform: 'beehiiv' | 'mailchimp' | 'none' = hasBeehiivConfig
    ? 'beehiiv'
    : hasMailchimpConfig
      ? 'mailchimp'
      : 'none';
  const platformLabel = sitePlatform === 'mailchimp' ? 'Mailchimp' : 'Beehiiv';

  const fetchSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, url, beehiiv_config, mailchimp_config')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setSites(data);
      if (data.length === 1) {
        setSelectedSiteId(data[0].id);
      }
    }
  };

  const fetchOrganizations = async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setOrganizations(data);
    }
  };


  const fetchAssignments = async () => {
    setIsLoadingAssignments(true);
    try {
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          id,
          assignment_name,
          due_date,
          site_id,
          assigned_to,
          site:sites_public(id, name, url)
        `)
        .eq('organization_id', selectedOrgId)
        .eq('site_id', selectedSiteId)
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
    } catch (error: any) {
      console.error('Failed to load assignments:', error);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const updateForm = (field: keyof BlastFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];
    if (!formData.title.trim()) errors.push('Title is required');
    if (!formData.subjectLine.trim()) errors.push('Subject line is required');
    if (!formData.mainImageUrl) errors.push('Main image is required');
    if (!formData.clickUrl.trim()) errors.push('Click-through URL is required');
    if (!selectedSiteId) errors.push('Please select a site');
    return errors;
  };

  const handleSubmit = async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      errors.forEach(e => toast.error(e));
      return;
    }

    setIsSubmitting(true);
    try {
      // All blasts land as 'submitted' regardless of platform; unconnected
      // sites surface in Admin → Tasks → Requests for manual processing.
      const blastStatus = 'submitted';

      const blastData = {
        title: formData.title,
        subject_line: formData.subjectLine,
        main_image_url: formData.mainImageUrl!,
        click_url: formData.clickUrl,
        headline: formData.headline || null,
        body_content: formData.bodyContent || null,
        cta_button_text: formData.ctaButtonText || null,
        preview_text: formData.previewText || null,
        cta_button_url: formData.ctaButtonUrl || null,
        secondary_image_url: formData.secondaryImageUrl || null,
        assignment_id: selectedAssignmentId || null,
        organization_id: selectedOrgId || null,
        site_id: selectedSiteId,
        client_id: null,
        status: blastStatus,
        scheduled_date: selectedAssignment?.due_date || null,
        submitted_at: new Date().toISOString(),
      };

      const { data: blast, error } = await supabase
        .from('email_blasts')
        .insert([blastData])
        .select()
        .single();

      if (error) throw error;

      if (selectedOrgId) {
        void recordAudit({
          organizationId: selectedOrgId,
          action: 'blast.created',
          entityType: 'email_blast',
          entityId: blast.id,
          summary: `Created blast "${formData.title}" for ${selectedSite?.name ?? 'site'}${selectedAssignment?.due_date ? ` (scheduled ${selectedAssignment.due_date})` : ''}${sitePlatform !== 'none' ? '' : ' — manual processing'}`,
          after: blastData,
          metadata: { via: 'admin_direct_blast', beehiiv: hasBeehiivConfig, platform: sitePlatform },
        });
      }

      // Mark assignment as completed if one was selected
      if (selectedAssignmentId) {
        await supabase
          .from('post_assignments')
          .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
          })
          .eq('id', selectedAssignmentId);
      }

      // Create a platform draft only if the site has Beehiiv or Mailchimp configured
      let platformUrl: string | null = null;
      if (sitePlatform !== 'none') {
        const platformFunction = sitePlatform === 'mailchimp'
          ? 'create-mailchimp-campaign'
          : 'create-beehiiv-draft';
        try {
          const { data: platformResult, error: platformError } = await supabase.functions.invoke(platformFunction, {
            body: {
              blastId: blast.id,
              siteId: selectedSiteId,
            },
          });
          if (platformError) {
            console.error(`${platformLabel} draft creation failed:`, platformError);
            toast.warning(`Email blast created but ${platformLabel} draft creation failed`);
          } else {
            platformUrl = platformResult?.beehiiv_post_url || platformResult?.mailchimp_campaign_url || null;
          }
        } catch (platformErr) {
          console.error(`${platformLabel} error:`, platformErr);
        }
      }
      // Unconnected sites: the email_blasts row with status='submitted' already
      // surfaces in Admin → Tasks → Requests as a pending "Schedule Email Blast"
      // task, so no extra support_request is needed (avoids duplicate tasks).

      setPublishSuccess({
        show: true,
        platformUrl,
        platformLabel,
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      toast.error('Failed to create blast: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearFields = () => {
    setPublishSuccess(null);
    setFormData({
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
    setSelectedAssignmentId('');
    setOpenSections({
      headline: false,
      bodyContent: false,
      ctaButton: false,
      secondaryImage: false,
    });
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 text-foreground">Create Email Blast</h1>

      {/* Success Banner */}
      {publishSuccess?.show && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-green-800 dark:text-green-200 font-medium">Email blast created successfully!</span>
              {publishSuccess.platformUrl && (
                <a
                  href={publishSuccess.platformUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 dark:text-green-300 underline hover:text-green-900 dark:hover:text-green-100"
                >
                  View in {publishSuccess.platformLabel} →
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFields}
              className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50"
            >
              Create Another
            </Button>
            <button
              onClick={() => setPublishSuccess(null)}
              className="p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Site & Organization Selection */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Target Settings</CardTitle>
          <CardDescription>Select where to publish and optionally associate with an organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="site-select" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Site *
              </Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger id="site-select" className="mt-1.5">
                  <SelectValue placeholder="Select a site..." />
                </SelectTrigger>
                <SelectContent>
                  {sites.map(site => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="org-select" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organization (optional)
              </Label>
              <Select value={selectedOrgId || "none"} onValueChange={(val) => setSelectedOrgId(val === "none" ? "" : val)}>
                <SelectTrigger id="org-select" className="mt-1.5">
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {organizations.map(org => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedSiteId && (
            sitePlatform !== 'none' ? (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-900 dark:text-blue-100">
                <Send className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  This site is connected to {platformLabel}. The blast will be sent there as a draft for review.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-100">
                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  This site isn't connected to Beehiiv or Mailchimp yet. The blast will be queued as an admin task for manual processing.
                </span>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Assignment Selection (optional) */}
      {selectedOrgId && selectedSiteId && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Assignment (Optional)
            </CardTitle>
            <CardDescription>Associate with an existing email blast assignment</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAssignments ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading assignments...
              </div>
            ) : assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No pending email blast assignments for this organization and site.
              </p>
            ) : (
              <Select value={selectedAssignmentId || "none"} onValueChange={(val) => setSelectedAssignmentId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an assignment (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assignment</SelectItem>
                  {assignments.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span>{a.assignment_name}</span>
                        <span className="text-muted-foreground">
                          • {format(parseISO(a.due_date), 'MMM d, yyyy')}
                        </span>
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Required Fields */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Email Details</CardTitle>
          <CardDescription>
            Core information for your email blast
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
              If left blank, the email platform will auto-generate or leave empty
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

      {/* Optional Fields - only for platform-connected sites */}
      {sitePlatform !== 'none' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Optional Fields</CardTitle>
            <CardDescription>Add additional content to enhance your email blast</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Headline Section */}
            <Collapsible open={openSections.headline} onOpenChange={() => toggleSection('headline')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <span className="font-medium">Headline</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.headline ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <Input
                  value={formData.headline}
                  onChange={e => updateForm('headline', e.target.value)}
                  placeholder="Optional headline above body content"
                  className="mt-2"
                />
              </CollapsibleContent>
            </Collapsible>

            {/* Body Content Section */}
            <Collapsible open={openSections.bodyContent} onOpenChange={() => toggleSection('bodyContent')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <span className="font-medium">Body Content</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.bodyContent ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <div className="mt-2">
                  <SimpleRichTextEditor
                    content={formData.bodyContent}
                    onChange={content => updateForm('bodyContent', content)}
                    placeholder="Optional body text below the headline..."
                    minHeight="150px"
                    enableItalic
                    enableBulletList
                    enableOrderedList
                    hideWordCount
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* CTA Button Section */}
            <Collapsible open={openSections.ctaButton} onOpenChange={() => toggleSection('ctaButton')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <span className="font-medium">Call-to-Action Button</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.ctaButton ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 space-y-3">
                <div className="mt-2">
                  <Label htmlFor="ctaText">Button Text</Label>
                  <Input
                    id="ctaText"
                    value={formData.ctaButtonText}
                    onChange={e => updateForm('ctaButtonText', e.target.value)}
                    placeholder="e.g., Shop Now, Learn More"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="ctaUrl">Button URL</Label>
                  <UrlInput
                    id="ctaUrl"
                    value={formData.ctaButtonUrl}
                    onValueChange={val => updateForm('ctaButtonUrl', val)}
                    placeholder="https://example.com/cta-destination"
                    className="mt-1.5"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Secondary Image Section */}
            <Collapsible open={openSections.secondaryImage} onOpenChange={() => toggleSection('secondaryImage')}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <span className="font-medium">Secondary Image</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openSections.secondaryImage ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <div className="mt-2">
                  <SingleImageUpload
                    imageUrl={formData.secondaryImageUrl}
                    onImageChange={url => updateForm('secondaryImageUrl', url)}
                    aspectRatio="auto"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          onClick={() => navigate('/admin/users')}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="min-w-32"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Create Blast
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
