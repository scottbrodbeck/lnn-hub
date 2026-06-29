import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getAppBaseUrl } from '@/lib/utils';
import { SponsorshipBannerUpload } from '@/components/SponsorshipBannerUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, Send, Calendar, Globe, Loader2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isBefore, startOfDay, subDays } from 'date-fns';

interface Assignment {
  id: string;
  assignment_name: string;
  due_date: string;
  site_id: string;
  notes?: string;
  site?: {
    id: string;
    name: string;
    url: string;
  };
}

interface SponsorshipFormData {
  bannerImageUrl: string | null;
  clickUrl: string;
}

const DRAFT_STORAGE_KEY = 'submit_sponsorship_autosave';

export default function ClientSubmitSponsorship() {
  const { user, activeOrganizationId, activeOrganizationName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assignmentIdFromUrl = searchParams.get('assignment');
  const draftId = searchParams.get('draft');

  // Form state
  const [formData, setFormData] = useState<SponsorshipFormData>({
    bannerImageUrl: null,
    clickUrl: '',
  });

  // UI state
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(assignmentIdFromUrl);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  

  const selectedAssignment = assignments.find(a => a.id === selectedAssignmentId);
  
  // For email sponsorships, the due_date is Monday (for calendar display)
  // but the actual submission deadline is Thursday before that week
  const getSubmissionDeadline = (assignment: Assignment | undefined): Date | null => {
    if (!assignment?.due_date) return null;
    const weekStart = parseISO(assignment.due_date); // This is Monday
    // Thursday is 4 days before Monday
    return subDays(weekStart, 4);
  };

  const submissionDeadline = getSubmissionDeadline(selectedAssignment);
  
  // Check if deadline has passed (using Thursday deadline for sponsorships)
  const isDeadlinePassed = submissionDeadline 
    ? isBefore(submissionDeadline, startOfDay(new Date()))
    : false;

  // Load available sponsorship assignments
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
          notes,
          site:sites_public(id, name, url)
        `)
        .eq('organization_id', activeOrganizationId)
        .eq('content_category', 'email_sponsorship')
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
        // Deep-link doesn't match an email_sponsorship assignment in this org —
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
        if (anyCategory?.content_category === 'email_blast') {
          toast.info('This is an Email Blast assignment — opening the right page.');
          navigate(`/client/submit-blast?assignment=${assignmentIdFromUrl}`, { replace: true });
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
        .from('email_sponsorships')
        .select('*')
        .eq('id', id)
        .eq('client_id', user?.id)
        .in('status', ['pending', 'rejected'])
        .single();

      if (error) throw error;
      if (data) {
        setFormData({
          bannerImageUrl: data.banner_image_url || null,
          clickUrl: data.click_url || '',
        });
        setSelectedAssignmentId(data.assignment_id);
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
        bannerImageUrl: data.bannerImageUrl || null,
        clickUrl: data.clickUrl || '',
      });
    } catch (e) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  const updateForm = (field: keyof SponsorshipFormData, value: string | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateForm = (requireImage = true): string[] => {
    const errors: string[] = [];
    if (requireImage && !formData.bannerImageUrl) errors.push('Banner image is required');
    if (!formData.clickUrl.trim()) errors.push('Click-through URL is required');
    if (!selectedAssignmentId) errors.push('Please select an assignment');
    return errors;
  };

  const handleSaveDraft = async () => {
    if (!formData.bannerImageUrl && !formData.clickUrl) {
      toast.error('Please add some content before saving');
      return;
    }

    setIsSavingDraft(true);
    try {
      // Calculate week dates from the assignment due_date (which is Monday)
      const weekStartDate = selectedAssignment?.due_date 
        ? parseISO(selectedAssignment.due_date)
        : new Date();
      
      // Calculate the Thursday submission deadline (4 days before Monday)
      const thursdayDeadline = submissionDeadline 
        ? format(submissionDeadline, 'yyyy-MM-dd')
        : format(subDays(weekStartDate, 4), 'yyyy-MM-dd');

      const sponsorshipData = {
        banner_image_url: formData.bannerImageUrl || '',
        click_url: formData.clickUrl || '',
        assignment_id: selectedAssignmentId,
        organization_id: activeOrganizationId,
        site_id: selectedAssignment?.site_id,
        client_id: user?.id,
        status: 'pending',
        week_start_date: format(weekStartDate, 'yyyy-MM-dd'),
        submission_deadline: thursdayDeadline,
      };

      if (isEditingDraft && draftId) {
        const { error } = await supabase
          .from('email_sponsorships')
          .update(sponsorshipData)
          .eq('id', draftId)
          .eq('client_id', user?.id);
        if (error) throw error;
        toast.success('Draft updated');
      } else {
        const { error } = await supabase
          .from('email_sponsorships')
          .insert([sponsorshipData]);
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
      const weekStartDate = selectedAssignment?.due_date 
        ? parseISO(selectedAssignment.due_date)
        : new Date();
      
      // Calculate the Thursday submission deadline (4 days before Monday)
      const thursdayDeadline = submissionDeadline 
        ? format(submissionDeadline, 'yyyy-MM-dd')
        : format(subDays(weekStartDate, 4), 'yyyy-MM-dd');

      const sponsorshipData = {
        banner_image_url: formData.bannerImageUrl!,
        click_url: formData.clickUrl,
        assignment_id: selectedAssignmentId,
        organization_id: activeOrganizationId,
        site_id: selectedAssignment?.site_id,
        client_id: user?.id,
        status: 'pending',
        week_start_date: format(weekStartDate, 'yyyy-MM-dd'),
        submission_deadline: thursdayDeadline,
        submitted_at: new Date().toISOString(),
      };

      let sponsorshipId = draftId;

      if (isEditingDraft && draftId) {
        const { error } = await supabase
          .from('email_sponsorships')
          .update(sponsorshipData)
          .eq('id', draftId)
          .eq('client_id', user?.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('email_sponsorships')
          .insert([sponsorshipData])
          .select()
          .single();
        if (error) throw error;
        sponsorshipId = data.id;
      }

      // Send notification to admins
      try {
        // Fetch user profile for notification
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user!.id)
          .single();

        await supabase.functions.invoke('notify-admins', {
          body: {
            event_type: 'sponsorship_submitted',
            post_headline: `Sponsorship - ${selectedAssignment?.site?.name}`,
            user_id: user!.id,
            user_name: userProfile?.full_name || userProfile?.email || '',
            user_email: userProfile?.email || '',
            organization_id: activeOrganizationId,
            organization_name: activeOrganizationName,
            admin_link: `${getAppBaseUrl()}/admin/tasks`,
            timestamp: new Date().toISOString(),
            additional_data: {
              site_name: selectedAssignment?.site?.name,
              week_start_date: format(weekStartDate, 'MMM d, yyyy'),
              content_type: 'Email Sponsorship',
            },
          },
        });
      } catch (notifyErr) {
        console.error('Notification failed:', notifyErr);
      }

      localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success('Sponsorship submitted for approval!');
      navigate('/client/email-marketing');
    } catch (error: any) {
      toast.error('Failed to submit: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
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
          {isEditingDraft ? 'Edit Sponsorship Draft' : 'Submit Email Sponsorship'}
        </span>
      </nav>
      <h1 className="text-3xl font-bold mb-6 text-foreground">
        {isEditingDraft ? 'Edit Sponsorship Draft' : 'Submit Email Sponsorship'}
      </h1>

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
              No sponsorship assignments available. Please contact your administrator.
            </p>
          ) : (
            <Select value={selectedAssignmentId || ''} onValueChange={setSelectedAssignmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a sponsorship week" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map(a => {
                  // Calculate Thursday deadline (4 days before Monday due_date)
                  const mondayDate = parseISO(a.due_date);
                  const thursdayDeadline = subDays(mondayDate, 4);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span>{a.assignment_name}</span>
                        <span className="text-muted-foreground">
                          • Due: {format(thursdayDeadline, 'MMM d, yyyy')}
                        </span>
                        {a.site?.name && (
                          <span className="text-muted-foreground">• {a.site.name}</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          
          {selectedAssignment && submissionDeadline && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Deadline: {format(submissionDeadline, 'EEEE, MMMM d, yyyy')} at 5:00 PM ET</span>
                </div>
                {selectedAssignment.site?.name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <span>{selectedAssignment.site.name}</span>
                  </div>
                )}
              </div>
              {selectedAssignment.notes && (
                <p className="text-sm text-muted-foreground">{selectedAssignment.notes}</p>
              )}
            </div>
          )}

          {isDeadlinePassed && (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                The deadline for this sponsorship has passed. Your submission will be flagged as late.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Banner Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Banner Image</CardTitle>
          <CardDescription>
            Upload your sponsorship banner. It will appear at the top of the newsletter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Banner size: 840 × 210 pixels</strong><br />
              Upload any image and crop it to fit — we'll save it at exactly 840 × 210 and optimize the
              file size. You'll see a preview before submitting and can re-crop or replace it anytime.
            </AlertDescription>
          </Alert>

          <div>
            <Label>Banner Image</Label>
            <SponsorshipBannerUpload
              imageUrl={formData.bannerImageUrl}
              onImageChange={url => updateForm('bannerImageUrl', url)}
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
              Where readers go when they click the banner
            </p>
          </div>
        </CardContent>
      </Card>


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
          onClick={handleSubmit}
          disabled={isSubmitting || isSavingDraft || !selectedAssignmentId}
        >
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Submit for Approval
        </Button>
      </div>

    </div>
  );
}
