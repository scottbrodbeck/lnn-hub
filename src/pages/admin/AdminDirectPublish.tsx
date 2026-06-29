import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ImageUpload, ProcessedImage } from '@/components/ImageUpload';
import { PostPreview } from '@/components/PostPreview';
import { PostReviewDialog } from '@/components/PostReviewDialog';
import { AIPostGeneratorDialog } from '@/components/AIPostGeneratorDialog';
import { PostOptionalElements, ColumnTemplateSelector, AssignmentSelector } from '@/components/post-form';
import { AdminAuthorSelector, AuthorProfile } from '@/components/post-form/AdminAuthorSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Sparkles, Globe, CheckCircle, X, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  completeAssignmentsForPost 
} from '@/lib/assignmentUtils';
import { notifyAdminsOfSubmission } from '@/lib/notificationUtils';
import { buildPostData, PostFormData, PollData, SocialPost } from '@/lib/postUtils';
import { usePollManagement } from '@/hooks/usePollManagement';
import { usePostFormState } from '@/hooks/usePostFormState';
import { useColumnTemplates } from '@/hooks/useColumnTemplates';
import { useAssignmentSelection } from '@/hooks/useAssignmentSelection';
import { useSponsors } from '@/hooks/useSponsors';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

interface Site {
  id: string;
  name: string;
  url: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function AdminDirectPublish() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Site and org selection
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  
  // Form state from hook
  const {
    formState,
    openSections,
    setHeadline,
    setAuthorName,
    setLogoUrl,
    setLogoLinkUrl,
    setByline,
    setContent,
    setImages,
    setYoutubeUrl,
    setCtaButtonText,
    setCtaButtonUrl,
    setCommentsEnabled,
    setAnimatedFeaturedImage,
    setSelectedSocialPosts,
    setAuthorBio,
    setAuthorPhotoUrl,
    setSponsorId,
    setOpenSections,
    resetForm,
    toPostFormData,
  } = usePostFormState();

  // Sponsors via hook
  const { sponsors, isLoading: isLoadingSponsors, createSponsor, fetchSponsors } = useSponsors(selectedOrgId);
  
  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [skipAICheck, setSkipAICheck] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  
  // Poll management via hook
  const {
    pollState,
    isCreatingPoll,
    isUpdatingPoll,
    isDeletingPoll,
    setPollQuestion,
    setPollOptions,
    createOrUpdatePoll,
    removePoll,
    resetPoll,
  } = usePollManagement();
  
  // Column templates via hook
  const { columnTemplates, applyTemplate } = useColumnTemplates(selectedOrgId);
  
  // Assignment selection via hook
  const {
    assignments: clientAssignments,
    selectedAssignments,
    setSelectedAssignments,
    isLoading: isLoadingAssignments,
    toggleAssignment,
    clearSelection,
    loadMore: loadMoreAssignments,
    isLoadMoreActive: isAssignmentsExpanded,
  } = useAssignmentSelection({
    mode: 'admin',
    organizationId: selectedOrgId,
    siteId: selectedSiteId,
  });
  
  // Derive selectedClientAssignment for compatibility
  const selectedClientAssignment = selectedAssignments.length > 0 ? selectedAssignments[0] : null;
  const setSelectedClientAssignment = (id: string | null) => {
    if (id) {
      setSelectedAssignments([id]);
    } else {
      clearSelection();
    }
  };
  
  // Author profile selection
  const [authorProfiles, setAuthorProfiles] = useState<AuthorProfile[]>([]);
  const [selectedAuthorProfileId, setSelectedAuthorProfileId] = useState<string | null>(null);
  
  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{ show: boolean; wordpressUrl: string | null } | null>(null);

  useEffect(() => {
    fetchSites();
    fetchOrganizations();
    
    const savedSetting = localStorage.getItem('skipAIReview');
    if (savedSetting !== null) {
      setSkipAICheck(savedSetting === 'true');
    }
  }, []);

  const fetchSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, url')
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

  // Fetch author profiles when org changes
  useEffect(() => {
    setSelectedAuthorProfileId(null);
    setAuthorName('');
    setAuthorBio('');
    setAuthorPhotoUrl(null);
    setAuthorProfiles([]);
    
    if (!selectedOrgId) return;
    
    const fetchAuthorProfiles = async () => {
      const { data, error } = await supabase
        .from('user_organizations')
        .select('user_id, profiles!user_organizations_user_id_fkey(id, full_name, default_author_name, default_author_bio, default_author_photo_url)')
        .eq('organization_id', selectedOrgId);
      
      if (!error && data) {
        const profiles: AuthorProfile[] = data
          .map((uo: any) => uo.profiles)
          .filter((p: any) => p && (p.default_author_name || p.full_name));
        setAuthorProfiles(profiles);
      }
    };
    
    fetchAuthorProfiles();
  }, [selectedOrgId]);

  const handleSelectAuthorProfile = (profileId: string | null) => {
    setSelectedAuthorProfileId(profileId);
    if (!profileId) {
      setAuthorName('');
      setAuthorBio('');
      setAuthorPhotoUrl(null);
      return;
    }
    const profile = authorProfiles.find(p => p.id === profileId);
    if (profile) {
      setAuthorName(profile.default_author_name || profile.full_name || '');
      setAuthorBio(profile.default_author_bio || '');
      setAuthorPhotoUrl(profile.default_author_photo_url || null);
    }
  };

  const handleApplyTemplate = (template: any) => {
    applyTemplate(template, {
      setLogoUrl,
      setLogoLinkUrl,
      setByline,
      setContent,
      setImages,
      setOpenSections,
      currentContent: formState.content,
    });
  };

  const handleRemovePoll = async () => {
    await removePoll();
  };

  const handlePreview = async () => {
    if (!formState.headline.trim() || !formState.content.trim()) {
      toast.error('Please enter a headline and content before previewing');
      return;
    }
    
    if (!selectedSiteId) {
      toast.error('Please select a site to publish to');
      return;
    }
    
    const hasFeaturedImage = formState.images.some(img => img.isFeatured);
    if (!hasFeaturedImage) {
      toast.error('Please upload and set a featured image before previewing');
      return;
    }
    
    // Handle poll creation or update using the hook
    const result = await createOrUpdatePoll();
    if (!result.success) {
      return; // Poll creation/update failed, don't proceed
    }
    
    if (skipAICheck) {
      setShowPreview(true);
    } else {
      setShowReview(true);
    }
  };

  const handleReviewComplete = (updatedHeadline: string, updatedContent: string, proceedToPreview: boolean) => {
    setHeadline(updatedHeadline);
    setContent(updatedContent);
    setShowReview(false);
    if (proceedToPreview) {
      setShowPreview(true);
    }
  };

  const handleBackToEdit = (updatedHeadline: string, updatedContent: string) => {
    setHeadline(updatedHeadline);
    setContent(updatedContent);
    setShowReview(false);
  };

  const handlePublish = async () => {
    const hasFeaturedImage = formState.images.some(img => img.isFeatured);
    if (!hasFeaturedImage) {
      toast.error('Please upload and set a featured image before publishing');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Please select a site to publish to');
      return;
    }

    setIsPublishing(true);

    try {
      const filteredPollOptions = pollState.options.filter(o => o.trim());
      const hasPoll = pollState.question.trim() && filteredPollOptions.length >= 2;
      
      // Determine client_id - use assignment's client if submitting for them
      const selectedAssignment = clientAssignments.find(a => a.id === selectedClientAssignment);
      const effectiveClientId = selectedAssignment?.assigned_to || user?.id;
      
      // Build form data for the utility
      const pollData: PollData | null = hasPoll ? {
        question: pollState.question,
        options: filteredPollOptions,
        crowdsignalPollId: pollState.crowdsignalPollId,
        embedUrl: pollState.embedUrl,
        jsEmbedCode: pollState.embedCode
      } : null;
      
      const formDataForPost = toPostFormData(pollData);
      
      // First, save the post to the database
      const postData = buildPostData(formDataForPost, {
        status: 'draft',
        clientId: effectiveClientId || '',
        assignmentIds: selectedClientAssignment ? [selectedClientAssignment] : [],
        includeSocialPostsAndInstanceDates: false,
      });

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert([postData])
        .select()
        .single();

      if (postError) throw postError;
      
      // Mark assignment as completed if one was selected
      if (selectedClientAssignment && post.id) {
        const result = await completeAssignmentsForPost(supabase, [selectedClientAssignment], post.id);
        if (!result.success) {
          console.error('Errors completing assignments:', result.errors);
          toast.error('Failed to mark assignment as completed');
        }
      }

      // Now publish to WordPress
      const { data: publishResult, error: publishError } = await supabase.functions.invoke('publish-to-wordpress', {
        body: {
          mode: 'publish',
          site_id: selectedSiteId,
          post_id: post.id,
          organization_id: selectedOrgId || undefined,
        }
      });

      if (publishError) {
        let backendError = publishError.message;
        const responseContext = (publishError as { context?: { json?: () => Promise<{ error?: string }> } }).context;

        if (responseContext?.json) {
          const errorPayload = await responseContext.json().catch(() => null);
          if (errorPayload?.error) {
            backendError = errorPayload.error;
          }
        }

        throw new Error(backendError);
      }

      if (publishResult?.success) {
        if (publishResult.inline_sync_warning) {
          toast.warning(`Published, but inline image sync needs attention: ${publishResult.inline_sync_warning}`);
        }

        const { data: refreshedPost, error: refreshedPostError } = await supabase
          .from('posts')
          .select('content')
          .eq('id', post.id)
          .maybeSingle();

        if (refreshedPostError) {
          console.error('Failed to refresh published post content:', refreshedPostError);
        } else if (refreshedPost?.content) {
          setContent(refreshedPost.content);
        }

        // Show persistent success banner instead of toast
        setPublishSuccess({
          show: true,
          wordpressUrl: publishResult.wordpress_url || null
        });
        setShowPreview(false);
        
        // Scroll to top so user sees success message
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Send notification using shared utility
        try {
          const selectedOrg = organizations.find(o => o.id === selectedOrgId);
          
          // Construct WordPress edit URL
          const siteUrl = selectedSite?.url?.replace(/\/$/, '');
          const wordpressEditUrl = siteUrl && publishResult.wordpress_post_id
            ? `${siteUrl}/wp-admin/post.php?post=${publishResult.wordpress_post_id}&action=edit`
            : null;
          
          await notifyAdminsOfSubmission(supabase, {
            postId: post.id,
            headline: formState.headline,
            userId: user?.id || '',
            organizationId: selectedOrgId || null,
            organizationName: selectedOrg?.name || null,
            source: 'direct_publish',
            siteId: selectedSiteId,
            siteName: selectedSite?.name || null,
            wordpressUrl: publishResult.wordpress_url || null,
            wordpressEditUrl,
            assignmentUuid: selectedClientAssignment || null,
            additionalData: {
              assignmentName: selectedAssignment?.assignment_name || null,
              socialPosts: formState.selectedSocialPosts.map(p => ({ text: p.text, edited: p.edited })),
              poll: hasPoll
                ? { 
                    question: pollState.question, 
                    options: filteredPollOptions,
                    crowdsignal_poll_id: pollState.crowdsignalPollId
                  }
                : null,
              animatedFeaturedImage: formState.animatedFeaturedImage,
              commentsEnabled: formState.commentsEnabled,
              authorName: formState.authorName || null,
              authorBio: formState.authorBio || null,
              authorPhotoUrl: formState.authorPhotoUrl || null,
            }
          });
        } catch (webhookError) {
          console.error('Webhook notification failed:', webhookError);
          // Don't block success - webhook is ancillary
        }
      } else {
        throw new Error(publishResult?.error || 'Publishing failed');
      }
    } catch (error: any) {
      console.error('Publishing error:', error);
      toast.error('Failed to publish: ' + error.message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleResetForm = () => {
    resetForm();
    resetPoll();
    clearSelection();
    setSelectedAuthorProfileId(null);
    setAuthorProfiles([]);
    setSelectedSiteId('');
    setSelectedOrgId('');
    setShowPreview(false);
    setShowReview(false);
    setShowAIGenerator(false);
  };

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  const handleDismissSuccess = () => {
    setPublishSuccess(null);
  };

  const handleClearFields = () => {
    setPublishSuccess(null);
    handleResetForm();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-foreground">Direct Publish</h1>
      
      {/* Success Banner */}
      {publishSuccess?.show && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-green-800 dark:text-green-200 font-medium">Post published successfully!</span>
              {publishSuccess.wordpressUrl && (
                <a 
                  href={publishSuccess.wordpressUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-700 dark:text-green-300 underline hover:text-green-900 dark:hover:text-green-100"
                >
                  View post →
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
              Clear Fields
            </Button>
            <button 
              onClick={handleDismissSuccess}
              className="p-1 rounded-md hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      
      {/* Site Selection */}
      <div className="bg-muted/30 border border-border rounded-lg p-4 mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="site-select" className="text-sm font-medium text-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Publish to Site *
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
            <Label htmlFor="org-select" className="text-sm font-medium text-foreground">
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
        
        {/* Client Assignment Selection */}
        {selectedOrgId && selectedSiteId && (
          <div className="mt-4 pt-4 border-t border-border">
            <AssignmentSelector
              assignments={clientAssignments}
              selectedAssignments={selectedAssignments}
              onToggleAssignment={toggleAssignment}
              onClearSelection={clearSelection}
              isLoading={isLoadingAssignments}
              mode="admin"
              singleSelect={true}
              collapsible={true}
              collapsibleOpen={openSections.assignmentSection}
              onCollapsibleOpenChange={(open) => setOpenSections(prev => ({ ...prev, assignmentSection: open }))}
              collapsibleTitle="Submit for Client Assignment (Optional)"
              emptyMessage="No upcoming assignments for this site and organization"
            />
            {openSections.assignmentSection && !isLoadingAssignments && clientAssignments.length > 0 && !isAssignmentsExpanded && (
              <div className="mt-2 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMoreAssignments}
                  className="text-xs text-muted-foreground"
                >
                  Show more upcoming instances
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        <Button 
          variant="outline" 
          size="lg"
          onClick={() => setShowAIGenerator(true)}
          className="flex-1 border-2 border-primary hover:bg-primary/5 bg-primary/10"
        >
          <Sparkles className="mr-2 h-5 w-5" />
          Generate Post with AI Interview
        </Button>
        <ColumnTemplateSelector templates={columnTemplates} onApplyTemplate={handleApplyTemplate} />
      </div>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="headline" className="text-base font-medium text-foreground">
            Headline
          </Label>
          <Input
            id="headline"
            value={formState.headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Enter your headline"
            className="mt-1.5"
          />
          <div className={`mt-1.5 text-sm flex items-center justify-between ${
            formState.headline.length < 30 
              ? 'text-muted-foreground' 
              : formState.headline.length >= 50 && formState.headline.length <= 70 
                ? 'text-green-600 dark:text-green-500' 
                : formState.headline.length <= 75 
                  ? 'text-amber-600 dark:text-amber-500'
                  : 'text-destructive'
          }`}>
            <span>
              {formState.headline.length < 30 && 'Too short for search engine optimization'}
              {formState.headline.length >= 30 && formState.headline.length < 50 && 'A bit short — aim for 50-70 characters'}
              {formState.headline.length >= 50 && formState.headline.length <= 70 && '✓ Ideal length for search engine optimization'}
              {formState.headline.length > 70 && formState.headline.length <= 75 && 'Slightly long — may be truncated'}
              {formState.headline.length > 75 && 'May be truncated in search results'}
            </span>
            <span className="font-mono">{formState.headline.length}/70</span>
          </div>
        </div>

        <ImageUpload
          initialImages={formState.images}
          onImagesChange={setImages}
        />

        <div>
          <Label className="text-base font-medium text-foreground mb-1.5 block">
            Post Content
          </Label>
          <RichTextEditor
            content={formState.content}
            onChange={setContent}
          />
        </div>

        <PostOptionalElements
          openSections={openSections}
          onOpenSectionsChange={setOpenSections}
          logoUrl={formState.logoUrl}
          logoLinkUrl={formState.logoLinkUrl}
          byline={formState.byline}
          onLogoChange={setLogoUrl}
          onLogoLinkChange={setLogoLinkUrl}
          onBylineChange={setByline}
          sponsors={sponsors}
          selectedSponsorId={formState.sponsorId}
          onSponsorSelect={setSponsorId}
          organizationId={selectedOrgId}
          userId={user?.id}
          isLoadingSponsors={isLoadingSponsors}
          createSponsor={createSponsor}
          onSponsorCreated={() => fetchSponsors()}
          animatedFeaturedImage={formState.animatedFeaturedImage}
          onAnimatedFeaturedImageChange={setAnimatedFeaturedImage}
          youtubeUrl={formState.youtubeUrl}
          onYoutubeUrlChange={setYoutubeUrl}
          pollQuestion={pollState.question}
          pollOptions={pollState.options}
          onPollQuestionChange={setPollQuestion}
          onPollOptionsChange={setPollOptions}
          onRemovePoll={handleRemovePoll}
          isDeletingPoll={isDeletingPoll}
          ctaButtonText={formState.ctaButtonText}
          ctaButtonUrl={formState.ctaButtonUrl}
          onCtaButtonTextChange={setCtaButtonText}
          onCtaButtonUrlChange={setCtaButtonUrl}
          commentsEnabled={formState.commentsEnabled}
          onCommentsEnabledChange={setCommentsEnabled}
          commentsSwitchId="enable-comments-admin"
        />

        <div className="border border-border rounded-lg p-6">
          <AdminAuthorSelector
            isOpen={openSections.authorBio}
            onOpenChange={(open) => setOpenSections(prev => ({ ...prev, authorBio: open }))}
            profiles={authorProfiles}
            selectedProfileId={selectedAuthorProfileId}
            onSelectProfile={handleSelectAuthorProfile}
            disabled={!selectedOrgId}
            disabledMessage={!selectedOrgId ? 'Select an organization to choose an author.' : undefined}
          />
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox
            id="skip-ai-check"
            checked={skipAICheck}
            onCheckedChange={(checked) => setSkipAICheck(checked as boolean)}
          />
          <Label 
            htmlFor="skip-ai-check" 
            className="text-sm font-normal cursor-pointer"
          >
            Skip typo check and analysis
          </Label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button 
            onClick={handlePreview} 
            className="flex-1" 
            size="lg" 
            disabled={isCreatingPoll || isUpdatingPoll || !selectedSiteId}
          >
            <Eye className="mr-2 h-5 w-5" />
            {isCreatingPoll ? 'Creating Poll...' : isUpdatingPoll ? 'Updating Poll...' : 'Preview & Publish'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="lg"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-5 w-5" />
                Discard Changes
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your unsaved changes will be cleared and you'll return to the calendar. Your saved draft (if any) will not be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    resetForm();
                    resetPoll();
                    clearSelection();
                    navigate('/admin/calendar');
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Discard Changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <PostReviewDialog
        open={showReview}
        onOpenChange={setShowReview}
        headline={formState.headline}
        authorName={formState.authorName}
        content={formState.content}
        onReviewComplete={handleReviewComplete}
        onBackToEdit={handleBackToEdit}
      />

      <PostPreview
        open={showPreview}
        onOpenChange={setShowPreview}
        headline={formState.headline}
        authorName={formState.authorName}
        logoUrl={formState.logoUrl}
        logoLinkUrl={formState.logoLinkUrl}
        logoAuthorName={formState.byline}
        content={formState.content}
        images={formState.images}
        youtubeUrl={formState.youtubeUrl}
        onSubmit={handlePublish}
        availableAssignments={[]}
        selectedAssignments={[]}
        onSelectedAssignmentsChange={() => {}}
        ctaButtonText={formState.ctaButtonText}
        ctaButtonUrl={formState.ctaButtonUrl}
        siteName={selectedSite?.name || ''}
        selectedSocialPosts={formState.selectedSocialPosts}
        onSocialPostsChange={setSelectedSocialPosts}
        pollEmbedCode={pollState.embedCode}
        pollEmbedUrl={pollState.embedUrl}
        submitButtonText={isPublishing ? 'Publishing...' : 'Publish to WordPress'}
        submitButtonDisabled={isPublishing}
        animatedFeaturedImage={formState.animatedFeaturedImage}
        authorBio={formState.authorBio}
        authorPhotoUrl={formState.authorPhotoUrl}
      />

      <AIPostGeneratorDialog
        open={showAIGenerator}
        onOpenChange={setShowAIGenerator}
        onUsePost={(genHeadline, genContent) => {
          setHeadline(genHeadline);
          setContent(genContent);
        }}
      />
    </div>
  );
}
