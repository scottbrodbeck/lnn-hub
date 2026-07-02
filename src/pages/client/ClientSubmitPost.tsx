import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ImageUpload, ProcessedImage } from '@/components/ImageUpload';
import { PostPreview } from '@/components/PostPreview';
import { PostReviewDialog } from '@/components/PostReviewDialog';
import { AIPostGeneratorDialog } from '@/components/AIPostGeneratorDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Save, Sparkles, Calendar, Globe, X, Trash2 } from 'lucide-react';
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
import { AnimatedImage } from '@/components/AnimatedImageUpload';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { format, parseISO } from 'date-fns';
import { AssignmentInstance } from '@/lib/recurrenceUtils';
import { 
  extractUuidsFromAssignmentIds, 
  extractInstanceDatesFromAssignmentIds,
  reconstructCompositeIds,
  completeAssignmentsForPost
} from '@/lib/assignmentUtils';
import { usePollManagement } from '@/hooks/usePollManagement';
import { usePostFormState } from '@/hooks/usePostFormState';
import { useColumnTemplates } from '@/hooks/useColumnTemplates';
import { useAssignmentSelection } from '@/hooks/useAssignmentSelection';
import { useSponsors } from '@/hooks/useSponsors';
import { buildPostData, SocialPost, PostFormData, validateForPreview, validateForSubmit } from '@/lib/postUtils';
import { notifyAdminsOfSubmission } from '@/lib/notificationUtils';
import { PostOptionalElements, ColumnTemplateSelector, AssignmentSelector } from '@/components/post-form';
import { normalizePostImages } from '@/lib/postImageUtils';

const DRAFT_STORAGE_KEY = 'submit_post_autosave';

interface AutosaveData {
  headline: string;
  authorName: string;
  logoUrl?: string | null;
  logoLinkUrl?: string | null;
  byline?: string;
  content: string;
  youtubeUrl: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  pollQuestion: string;
  pollOptions: string[];
  commentsEnabled: boolean;
  images: ProcessedImage[];
  animatedFeaturedImage: AnimatedImage | null;
  authorBio?: string;
  authorPhotoUrl?: string | null;
  sponsorId?: string | null;
  savedAt: number;
}

interface DefaultSponsorData {
  sponsor_id: string | null;
  organization_id: string | null;
  name: string | null;
  logo_url: string | null;
  link_url: string | null;
}

const hasOwn = <T extends object, K extends keyof T>(obj: T | null | undefined, key: K) =>
  !!obj && Object.prototype.hasOwnProperty.call(obj, key);

export default function ClientSubmitPost() {
  const { user, activeOrganizationId, activeOrganizationName, userOrganizations, setActiveOrganization } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const draftId = searchParams.get('draft');
  const cloneFromId = searchParams.get('cloneFrom');
  const assignmentIdFromUrl = searchParams.get('assignment');
  const orgIdFromUrl = searchParams.get('org');
  
  // Track if we've already processed org switch to prevent loops
  const orgSwitchProcessed = useRef(false);
  
  // Form state via hook - destructure everything
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
    setAuthorBio,
    setAuthorPhotoUrl,
    setSponsorId,
    setOpenSections,
    setFormState,
    resetForm,
  } = usePostFormState();

  // Sponsors via hook
  const { sponsors, isLoading: isLoadingSponsors, createSponsor, fetchSponsors } = useSponsors(activeOrganizationId);
  
  // Destructure formState for easier access
  const handleAuthorNameChange = (name: string) => {
    setAuthorName(name);
    if (hasAuthorBioDefaultSet) {
      setHasAuthorBioDefaultSet(false);
    }
  };

  const handleAuthorBioChange = (bio: string) => {
    setAuthorBio(bio);
    if (hasAuthorBioDefaultSet) {
      setHasAuthorBioDefaultSet(false);
    }
  };

  const handleAuthorPhotoChange = (url: string | null) => {
    setAuthorPhotoUrl(url);
    if (url === null && hasAuthorBioDefaultSet) {
      setHasAuthorBioDefaultSet(false);
    }
  };

  const {
    headline,
    authorName,
    logoUrl,
    logoLinkUrl,
    byline,
    content,
    images,
    youtubeUrl,
    ctaButtonText,
    ctaButtonUrl,
    commentsEnabled,
    animatedFeaturedImage,
    authorBio,
    authorPhotoUrl,
  } = formState;
  
  const [showPreview, setShowPreview] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [skipAICheck, setSkipAICheck] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [selectedSocialPosts, setSelectedSocialPosts] = useState<SocialPost[]>([]);
  
  const [hasAuthorBioDefaultSet, setHasAuthorBioDefaultSet] = useState(false);
  
  // Poll management via hook
  const {
    pollState,
    isCreatingPoll,
    isUpdatingPoll,
    isDeletingPoll,
    setPollQuestion,
    setPollOptions,
    initializePollFromDraft,
    createOrUpdatePoll,
    removePoll,
    resetPoll,
  } = usePollManagement();

  // Column templates via hook
  const { columnTemplates, applyTemplate } = useColumnTemplates(activeOrganizationId);

  // Assignment selection via hook
  const {
    assignments: availableAssignments,
    instances,
    selectedAssignments,
    setSelectedAssignments,
    siteName,
    preselectedAssignment,
    clearPreselection,
    markAssignmentStarted,
    refetch: refetchAssignments,
    isLoading: isLoadingAssignments,
    toggleAssignment,
    clearSelection,
  } = useAssignmentSelection({
    mode: 'client',
    organizationId: activeOrganizationId,
    preselectedAssignmentId: assignmentIdFromUrl,
    contentCategory: 'website',
    onCategoryMismatch: (actualCategory, assignmentId) => {
      const target = actualCategory === 'email_blast'
        ? '/client/submit-blast'
        : '/client/submit-sponsorship';
      const label = actualCategory === 'email_blast' ? 'Email Blast' : 'Email Sponsorship';
      toast.info(`This is an ${label} assignment — opening the right page.`);
      navigate(`${target}?assignment=${assignmentId}`, { replace: true });
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getAutosaveData = useCallback((): AutosaveData | null => {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;

    try {
      const data: AutosaveData = JSON.parse(saved);
      if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        return null;
      }

      return data;
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
  }, []);

  const clearAutosave = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  }, []);

  // Handle org switching from email links before loading assignments
  useEffect(() => {
    if (!orgIdFromUrl || orgSwitchProcessed.current) return;
    
    if (activeOrganizationId !== orgIdFromUrl) {
      const targetOrg = userOrganizations.find(o => o.organization_id === orgIdFromUrl);
      if (targetOrg) {
        setActiveOrganization(orgIdFromUrl);
        toast.info(`Switched to ${targetOrg.organization_name} for this assignment`);
      } else if (userOrganizations.length > 0) {
        toast.error('You do not have access to this assignment');
      }
    }
    
    orgSwitchProcessed.current = true;
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('org');
    setSearchParams(newParams, { replace: true });
  }, [orgIdFromUrl, activeOrganizationId, userOrganizations, setActiveOrganization, searchParams, setSearchParams]);

  const loadUserDefaults = useCallback(async () => {
    if (!user || !activeOrganizationId) return;

    try {
      const autosave = getAutosaveData();
      const [{ data: profileData, error: profileError }, { data: prefs }, { data: sponsorRows, error: sponsorError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('default_logo_url, default_logo_link_url, default_byline, default_author_bio, default_author_photo_url, default_author_name')
          .eq('id', user.id)
          .single(),
        supabase
          .from('user_notification_preferences')
          .select('default_comments_enabled')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.rpc('get_my_default_sponsor', { _organization_id: activeOrganizationId }),
      ]);

      if (profileError) throw profileError;
      if (sponsorError) throw sponsorError;

      const defaultSponsor = (Array.isArray(sponsorRows) ? sponsorRows[0] : sponsorRows) as DefaultSponsorData | null;
      const profileAuthorName = (profileData as any)?.default_author_name || '';
      const profileAuthorBio = profileData?.default_author_bio || '';
      const profileAuthorPhotoUrl = profileData?.default_author_photo_url || null;
      const hasProfileAuthorDefaults = !!(profileAuthorName || profileAuthorBio || profileAuthorPhotoUrl);

      const resolvedSponsorId = hasOwn(autosave, 'sponsorId') ? (autosave?.sponsorId ?? null) : (defaultSponsor?.sponsor_id ?? null);
      const resolvedLogoUrl = hasOwn(autosave, 'logoUrl')
        ? (autosave?.logoUrl ?? null)
        : (defaultSponsor?.logo_url ?? profileData?.default_logo_url ?? null);
      const resolvedLogoLinkUrl = hasOwn(autosave, 'logoLinkUrl')
        ? (autosave?.logoLinkUrl ?? null)
        : (defaultSponsor?.link_url ?? profileData?.default_logo_link_url ?? null);
      const resolvedByline = hasOwn(autosave, 'byline')
        ? (autosave?.byline ?? '')
        : (defaultSponsor?.name ?? profileData?.default_byline ?? '');
      const resolvedAuthorName = autosave?.authorName
        ? autosave.authorName
        : profileAuthorName;
      const resolvedAuthorBio = autosave?.authorBio
        ? autosave.authorBio
        : profileAuthorBio;
      const resolvedAuthorPhotoUrl = autosave?.authorPhotoUrl
        ? autosave.authorPhotoUrl
        : profileAuthorPhotoUrl;
      const resolvedCommentsEnabled = hasOwn(autosave, 'commentsEnabled')
        ? !!autosave?.commentsEnabled
        : !!prefs?.default_comments_enabled;

      setFormState({
        headline: autosave?.headline || '',
        authorName: resolvedAuthorName,
        logoUrl: resolvedLogoUrl,
        logoLinkUrl: resolvedLogoLinkUrl,
        byline: resolvedByline,
        content: autosave?.content || '',
        images: autosave?.images || [],
        youtubeUrl: autosave?.youtubeUrl || '',
        ctaButtonText: autosave?.ctaButtonText || '',
        ctaButtonUrl: autosave?.ctaButtonUrl || '',
        commentsEnabled: resolvedCommentsEnabled,
        animatedFeaturedImage: autosave?.animatedFeaturedImage || null,
        authorBio: resolvedAuthorBio,
        authorPhotoUrl: resolvedAuthorPhotoUrl,
        sponsorId: resolvedSponsorId,
      });

      setPollQuestion(autosave?.pollQuestion || '');
      setPollOptions(autosave?.pollOptions || ['', '']);
      setHasAuthorBioDefaultSet(!autosave?.authorName && !autosave?.authorBio && !autosave?.authorPhotoUrl && hasProfileAuthorDefaults);
      setOpenSections({
        logo: !!(resolvedLogoUrl || resolvedByline || resolvedSponsorId || autosave?.images?.length),
        youtube: !!autosave?.youtubeUrl,
        cta: !!(autosave?.ctaButtonText || autosave?.ctaButtonUrl),
        poll: !!autosave?.pollQuestion,
        animatedImage: !!autosave?.animatedFeaturedImage,
        comments: resolvedCommentsEnabled,
        authorBio: !!(resolvedAuthorName || resolvedAuthorBio || resolvedAuthorPhotoUrl),
        assignmentSection: false,
      });
    } catch (error: any) {
      console.error('Failed to load user defaults:', error);
    }
  }, [activeOrganizationId, getAutosaveData, setFormState, setOpenSections, setPollOptions, setPollQuestion, user]);

  useEffect(() => {
    const savedSetting = localStorage.getItem('skipAIReview');
    if (savedSetting !== null) {
      setSkipAICheck(savedSetting === 'true');
    }

    if (draftId) {
      loadDraft(draftId);
      return;
    }

    if (cloneFromId && user) {
      cloneFromPost(cloneFromId);
      return;
    }

    if (user && activeOrganizationId) {
      loadUserDefaults();
    }
  }, [user, draftId, cloneFromId, activeOrganizationId, loadUserDefaults]);

  useEffect(() => {
    if (draftId) return;

    const timeoutId = setTimeout(() => {
      const data: AutosaveData = {
        headline,
        authorName,
        logoUrl,
        logoLinkUrl,
        byline,
        content,
        youtubeUrl,
        ctaButtonText,
        ctaButtonUrl,
        pollQuestion: pollState.question,
        pollOptions: pollState.options,
        commentsEnabled,
        images,
        animatedFeaturedImage,
        authorBio,
        authorPhotoUrl,
        sponsorId: formState.sponsorId,
        savedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [headline, authorName, logoUrl, logoLinkUrl, byline, content, youtubeUrl, ctaButtonText, ctaButtonUrl, pollState.question, pollState.options, commentsEnabled, images, animatedFeaturedImage, authorBio, authorPhotoUrl, formState.sponsorId, draftId]);

  const refreshAuthorBioDefaults = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('default_byline, default_author_bio, default_author_photo_url, default_author_name').eq('id', user.id).single();
      if (error) throw error;
      if (data) {
        const authorNameDefault = (data as any).default_author_name;
        setAuthorName(authorNameDefault || '');
        setAuthorBio(data.default_author_bio || '');
        setAuthorPhotoUrl(data.default_author_photo_url || null);
        setHasAuthorBioDefaultSet(!!(authorNameDefault || data.default_author_bio || data.default_author_photo_url));
        setOpenSections(prev => ({ ...prev, authorBio: !!(authorNameDefault || data.default_author_bio || data.default_author_photo_url) }));
        toast.success('Author bio defaults refreshed');
      }
    } catch (error: any) {
      console.error('Failed to refresh author bio defaults:', error);
      toast.error('Failed to refresh defaults');
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
      currentContent: content,
    });
  };

  const loadDraft = async (id: string) => {
    try {
      const { data, error } = await supabase.from('posts').select('*').eq('id', id).eq('client_id', user?.id).eq('status', 'draft').single();
      if (error) throw error;
      if (data) {
        setHeadline(data.headline);
        setAuthorName(data.author_name || '');
        setLogoUrl(data.logo_url || null);
        setLogoLinkUrl(data.logo_link_url || null);
        setContent(data.content);
        const loadedImages = normalizePostImages(
          data.featured_image_url as any,
          (data.gallery_images as any[] | null) || null,
          data.featured_image_id || null,
        );
        setImages(loadedImages);
        setYoutubeUrl(data.youtube_url || '');
        let loadedAssignments = data.assignment_ids || [];
        if (data.social_posts && typeof data.social_posts === 'object' && !Array.isArray(data.social_posts)) {
          const socialData = data.social_posts as { instance_dates?: Record<string, string> };
          if (socialData.instance_dates && Object.keys(socialData.instance_dates).length > 0) {
            loadedAssignments = reconstructCompositeIds(loadedAssignments, socialData.instance_dates);
          }
        }
        setSelectedAssignments(loadedAssignments);
        setCtaButtonText(data.cta_button_text || '');
        setCtaButtonUrl(data.cta_button_url || '');
        setCommentsEnabled(data.comments_enabled ?? false);
        if (data.comments_enabled) {
          setOpenSections(prev => ({ ...prev, comments: true }));
        }
        if (data.poll_data && typeof data.poll_data === 'object' && !Array.isArray(data.poll_data)) {
          const pollData = data.poll_data as { question?: string; options?: string[]; crowdsignal_poll_id?: string; embed_url?: string; js_embed_code?: string };
          setPollQuestion(pollData.question || '');
          setPollOptions(pollData.options || ['', '']);
          if (pollData.crowdsignal_poll_id && pollData.js_embed_code) {
            initializePollFromDraft({ question: pollData.question || '', options: pollData.options || ['', ''], crowdsignalPollId: pollData.crowdsignal_poll_id, embedCode: pollData.js_embed_code, embedUrl: pollData.embed_url || null });
          }
        }
        if (data.animated_featured_image && typeof data.animated_featured_image === 'object') {
          const animData = data.animated_featured_image as { url?: string; fileSize?: number; isAnimated?: boolean; isVideo?: boolean };
          if (animData.url) {
            setAnimatedFeaturedImage({ url: animData.url, fileSize: animData.fileSize || 0, isAnimated: animData.isAnimated ?? true, isVideo: animData.isVideo ?? false });
            setOpenSections(prev => ({ ...prev, animatedImage: true }));
          }
        }
        setIsEditingDraft(true);
        toast.success('Draft loaded successfully');
      }
    } catch (error: any) {
      toast.error('Failed to load draft: ' + error.message);
      navigate('/client/drafts');
    }
  };

  // Clone: prefill the form from one of the client's own past posts (any status)
  // into a NEW post (no draftId / not editing), leaving the assignment empty so
  // the client picks the target site's assignment. The supported multi-site path.
  const cloneFromPost = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .eq('client_id', user?.id)
        .single();
      if (error) throw error;
      if (!data) return;
      setHeadline(data.headline ? `${data.headline}` : '');
      setAuthorName(data.author_name || '');
      setLogoUrl(data.logo_url || null);
      setLogoLinkUrl(data.logo_link_url || null);
      setContent(data.content || '');
      setImages(
        normalizePostImages(
          data.featured_image_url as any,
          (data.gallery_images as any[] | null) || null,
          data.featured_image_id || null,
        ),
      );
      setYoutubeUrl(data.youtube_url || '');
      setCtaButtonText(data.cta_button_text || '');
      setCtaButtonUrl(data.cta_button_url || '');
      setCommentsEnabled(data.comments_enabled ?? false);
      if (data.comments_enabled) setOpenSections((prev) => ({ ...prev, comments: true }));
      if (data.animated_featured_image && typeof data.animated_featured_image === 'object') {
        const animData = data.animated_featured_image as { url?: string; fileSize?: number; isAnimated?: boolean; isVideo?: boolean };
        if (animData.url) {
          setAnimatedFeaturedImage({ url: animData.url, fileSize: animData.fileSize || 0, isAnimated: animData.isAnimated ?? true, isVideo: animData.isVideo ?? false });
          setOpenSections((prev) => ({ ...prev, animatedImage: true }));
        }
      }
      // Intentionally NOT set: draftId/isEditingDraft (so submit inserts a new
      // row) and selectedAssignments (the client chooses the target site).
      toast.success('Loaded content from your previous post — pick the site/assignment and submit.');
    } catch (error: any) {
      toast.error('Failed to load post to clone: ' + error.message);
      navigate('/client/posts');
    }
  };

  const handleSaveDraft = async () => {
    if (!headline.trim()) { toast.error('Please enter a headline before saving'); return; }
    try {
      const filteredPollOptions = pollState.options.filter(o => o.trim());
      const hasPoll = pollState.question.trim() && filteredPollOptions.length >= 2;
      const postFormData: PostFormData = { headline, authorName, logoUrl, logoLinkUrl, byline, content, images, youtubeUrl, ctaButtonText, ctaButtonUrl, commentsEnabled, animatedFeaturedImage, socialPosts: selectedSocialPosts, pollData: hasPoll ? { question: pollState.question, options: filteredPollOptions, crowdsignalPollId: pollState.crowdsignalPollId, embedUrl: pollState.embedUrl, jsEmbedCode: pollState.embedCode } : null, authorBio, authorPhotoUrl, sponsorId: formState.sponsorId };
      const postData = { ...buildPostData(postFormData, { status: 'draft', clientId: user?.id || '', assignmentIds: selectedAssignments, includeSocialPostsAndInstanceDates: true }), organization_id: activeOrganizationId };
      if (isEditingDraft && draftId) {
        const { error } = await supabase.from('posts').update(postData).eq('id', draftId).eq('client_id', user?.id);
        if (error) throw error;
        toast.success('Draft updated successfully');
      } else {
        const { error } = await supabase.from('posts').insert([postData]);
        if (error) throw error;
        toast.success('Draft saved successfully');
      }
      navigate('/client/drafts');
    } catch (error: any) {
      toast.error('Failed to save draft: ' + error.message);
    }
  };

  const handleSubmit = async () => {
    // Require at least one assignment to be selected for proper tracking and WordPress publishing
    if (selectedAssignments.length === 0) {
      toast.error('Please select at least one assignment to submit your post to');
      return;
    }
    // A post maps to ONE WordPress site (single wordpress_site_id). Selecting
    // assignments across different sites would collapse both onto one site's
    // draft, so require one site per submission and point to the clone flow.
    const selectedSiteIds = Array.from(
      new Set(
        selectedAssignments
          .map((id) => availableAssignments.find((a) => a.id === id)?.site_id)
          .filter(Boolean),
      ),
    );
    if (selectedSiteIds.length > 1) {
      toast.error(
        'These assignments are for different sites. Submit one post per site — use "Clone" on a submitted post to reuse this content for another site.',
      );
      return;
    }
    const hasFeaturedImage = images.some(img => img.isFeatured);
    if (!hasFeaturedImage) { toast.error('Please upload and set a featured image before submitting'); return; }
    const filteredPollOptionsForValidation = pollState.options.filter(o => o.trim());
    const hasPollForValidation = pollState.question.trim() && filteredPollOptionsForValidation.length >= 2;
    const validationFormData: PostFormData = { headline, authorName, logoUrl, logoLinkUrl, byline, content, images, youtubeUrl, ctaButtonText, ctaButtonUrl, commentsEnabled, animatedFeaturedImage, socialPosts: selectedSocialPosts, pollData: hasPollForValidation ? { question: pollState.question, options: filteredPollOptionsForValidation, crowdsignalPollId: pollState.crowdsignalPollId, embedUrl: pollState.embedUrl, jsEmbedCode: pollState.embedCode } : null, authorBio, authorPhotoUrl, sponsorId: formState.sponsorId };
    const submitValidation = validateForSubmit(validationFormData);
    if (!submitValidation.valid) { toast.error(submitValidation.error || 'Please complete the form before submitting'); return; }
    setIsSubmitting(true);
    try {
      let postId = draftId;
      const filteredPollOptions = pollState.options.filter(o => o.trim());
      const hasPoll = pollState.question.trim() && filteredPollOptions.length >= 2;
      const postFormData: PostFormData = { headline, authorName, logoUrl, logoLinkUrl, byline, content, images, youtubeUrl, ctaButtonText, ctaButtonUrl, commentsEnabled, animatedFeaturedImage, socialPosts: selectedSocialPosts, pollData: hasPoll ? { question: pollState.question, options: filteredPollOptions, crowdsignalPollId: pollState.crowdsignalPollId, embedUrl: pollState.embedUrl, jsEmbedCode: pollState.embedCode } : null, authorBio, authorPhotoUrl, sponsorId: formState.sponsorId };
      const postData = { ...buildPostData(postFormData, { status: 'published', clientId: user?.id || '', assignmentIds: selectedAssignments, includeSocialPostsAndInstanceDates: false }), organization_id: activeOrganizationId };
      if (isEditingDraft && draftId) {
        const { error } = await supabase.from('posts').update(postData).eq('id', draftId).eq('client_id', user?.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('posts').insert([postData]).select().single();
        if (error) throw error;
        postId = data.id;
      }
      if (selectedAssignments.length > 0 && postId) {
        const result = await completeAssignmentsForPost(supabase, selectedAssignments, postId);
        if (!result.success) {
          console.error('Errors completing assignments:', result.errors);
          toast.warning("Post submitted, but the assignment status couldn't be fully updated — it may still show as open.");
        }
      }
      if (postId && selectedAssignments.length > 0) {
        try {
          const assignmentUuid = extractUuidsFromAssignmentIds([selectedAssignments[0]])[0];
          const { data: assignmentData } = await supabase.from('post_assignments').select('site_id').eq('id', assignmentUuid).single();
          if (assignmentData?.site_id) {
            const { data: wpResult, error: wpError } = await supabase.functions.invoke('publish-to-wordpress', { body: { mode: 'publish', site_id: assignmentData.site_id, post_id: postId } });
            if (wpError) {
              console.error('WordPress draft publishing failed:', wpError);
              toast.error('Post saved but WordPress draft creation failed');
            } else if (wpResult?.inline_sync_warning) {
              toast.warning(`Draft created, but inline image sync needs attention: ${wpResult.inline_sync_warning}`);
            }
            if (wpResult?.sponsor_warning) {
              toast.warning(wpResult.sponsor_warning);
            }
          }
        } catch (wpPublishError) { console.error('Error during WordPress draft publish:', wpPublishError); }
      }
      // Send webhook notification BEFORE showing success toast and navigating
      // This ensures the notification completes before the user leaves the page
      try {
        const notificationAssignmentUuid = selectedAssignments.length > 0 ? extractUuidsFromAssignmentIds([selectedAssignments[0]])[0] : null;
        const instanceDatesMap = selectedAssignments.length > 0 ? extractInstanceDatesFromAssignmentIds([selectedAssignments[0]]) : {};
        const instanceDate = notificationAssignmentUuid ? instanceDatesMap[notificationAssignmentUuid] : null;
        const { data: assignment } = notificationAssignmentUuid ? await supabase.from('post_assignments').select('due_date, site_id, assignment_name, site:sites_public(name, url)').eq('id', notificationAssignmentUuid).single() : { data: null };
        
        // Fetch wordpress URL after publish
        let wordpressEditUrl: string | null = null;
        if (postId) {
          const { data: publishedPost } = await supabase.from('posts').select('wordpress_post_id, wordpress_post_url').eq('id', postId).single();
          if (publishedPost?.wordpress_post_id && assignment?.site) {
            const siteUrl = (assignment.site as any)?.url?.replace(/\/$/, '');
            if (siteUrl) {
              wordpressEditUrl = `${siteUrl}/wp-admin/post.php?post=${publishedPost.wordpress_post_id}&action=edit`;
            }
          }
        }
        
        console.log('Sending webhook notification for post:', postId);
        const notificationResult = await notifyAdminsOfSubmission(supabase, { 
          postId: postId!, 
          headline, 
          userId: user?.id || '', 
          organizationId: activeOrganizationId, 
          organizationName: activeOrganizationName, 
          assignmentUuid: notificationAssignmentUuid, 
          source: 'client_submit', 
          siteId: assignment?.site_id || null, 
          siteName: assignment?.site?.name || null, 
          publicationDate: instanceDate || assignment?.due_date, 
          wordpressEditUrl,
          additionalData: { 
            assignmentName: assignment?.assignment_name || null,
            socialPosts: selectedSocialPosts.map(p => ({ text: p.text, edited: p.edited })), 
            poll: hasPoll ? { question: pollState.question, options: filteredPollOptions, crowdsignal_poll_id: pollState.crowdsignalPollId } : null, 
            animatedFeaturedImage, 
            ctaButtonText: ctaButtonText || null, 
            ctaButtonUrl: ctaButtonUrl || null, 
            logoUrl: logoUrl || null, 
            logoLinkUrl: logoLinkUrl || null, 
            logoAuthorName: byline || null, 
            youtubeUrl: youtubeUrl || null, 
            commentsEnabled,
            authorName: authorName || null,
            authorBio: authorBio || null,
            authorPhotoUrl: authorPhotoUrl || null,
          } 
        });
        
        if (!notificationResult.success) {
          console.error('Webhook notification failed:', notificationResult.error);
        } else {
          console.log('Webhook notification completed successfully');
        }
      } catch (error) { 
        console.error('Failed to send notification:', error); 
      }

      // Now show success and navigate
      toast.success('Post submitted successfully!');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      resetForm();
      resetPoll();
      
      setShowPreview(false);
      setSelectedAssignments([]);
      setSelectedSocialPosts([]);
      setIsEditingDraft(false);
      clearAutosave();
      navigate('/client/posts');
    } catch (error: any) {
      toast.error('Failed to submit post: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePoll = async () => { await removePoll(); };

  const handlePreview = async () => {
    if (!headline.trim() || !content.trim()) { toast.error('Please enter a headline and content before previewing'); return; }
    const hasFeaturedImage = images.some(img => img.isFeatured);
    if (!hasFeaturedImage) { toast.error('Please upload and set a featured image before previewing'); return; }
    // Validate assignment selection - either preselected or manually selected
    if (!preselectedAssignment && selectedAssignments.length === 0) {
      toast.error('Please select at least one assignment before previewing');
      return;
    }
    const filteredPollOptionsForValidation = pollState.options.filter(o => o.trim());
    const hasPollForValidation = pollState.question.trim() && filteredPollOptionsForValidation.length >= 2;
    const validationFormData: PostFormData = { headline, authorName, logoUrl, logoLinkUrl, byline, content, images, youtubeUrl, ctaButtonText, ctaButtonUrl, commentsEnabled, animatedFeaturedImage, socialPosts: selectedSocialPosts, pollData: hasPollForValidation ? { question: pollState.question, options: filteredPollOptionsForValidation, crowdsignalPollId: pollState.crowdsignalPollId, embedUrl: pollState.embedUrl, jsEmbedCode: pollState.embedCode } : null, authorBio, authorPhotoUrl, sponsorId: formState.sponsorId };
    const previewValidation = validateForPreview(validationFormData);
    if (!previewValidation.valid) { toast.error(previewValidation.error || 'Please complete the form before previewing'); return; }
    const result = await createOrUpdatePoll();
    if (!result.success) { return; }
    if (skipAICheck) { setShowPreview(true); } else { setShowReview(true); }
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

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <nav aria-label="breadcrumb" className="mb-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate('/client/posts')}
          className="hover:text-foreground transition-colors"
        >
          My Posts
        </button>
        <span className="mx-2">/</span>
        <span className="text-foreground font-medium">
          {isEditingDraft ? 'Edit Draft' : 'Submit Sponsored Post'}
        </span>
      </nav>
      <h1 className="text-3xl font-bold mb-6 text-foreground">{isEditingDraft ? 'Edit Draft' : 'Submit a Post'}</h1>

      {preselectedAssignment && (
        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Submitting for assignment:</p>
              <h2 className="text-lg font-semibold text-foreground">{preselectedAssignment.assignment_name}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /><span>{format(preselectedAssignment.instanceDate || parseISO(preselectedAssignment.due_date), 'MMM d, yyyy')}</span></div>
                {preselectedAssignment.site && (<div className="flex items-center gap-1.5"><Globe className="h-4 w-4" /><span>{preselectedAssignment.site.name}</span></div>)}
              </div>
              {preselectedAssignment.notes && (<p className="mt-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded"><span className="font-medium">Note:</span> {preselectedAssignment.notes}</p>)}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={clearPreselection}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <Button variant="outline" size="lg" onClick={() => setShowAIGenerator(true)} className="flex-1 border-2 border-primary hover:bg-primary/5 bg-primary/10"><Sparkles className="mr-2 h-5 w-5" />Generate Post with AI Interview</Button>
        <ColumnTemplateSelector templates={columnTemplates} onApplyTemplate={handleApplyTemplate} />
      </div>
      
      <div className="space-y-6">
        <div>
          <Label htmlFor="headline" className="text-base font-medium text-foreground">Headline</Label>
          <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Enter your headline" className="mt-1.5" />
          <div className={`mt-1.5 text-sm flex items-center justify-between ${
            headline.length < 30 
              ? 'text-muted-foreground' 
              : headline.length >= 50 && headline.length <= 70 
                ? 'text-green-600 dark:text-green-500' 
                : headline.length <= 75 
                  ? 'text-amber-600 dark:text-amber-500'
                  : 'text-destructive'
          }`}>
            <span>
              {headline.length < 30 && 'Too short for search engine optimization'}
              {headline.length >= 30 && headline.length < 50 && 'A bit short — aim for 50-70 characters'}
              {headline.length >= 50 && headline.length <= 70 && '✓ Ideal length for search engine optimization'}
              {headline.length > 70 && headline.length <= 75 && 'Slightly long — may be truncated'}
              {headline.length > 75 && 'May be truncated in search results'}
            </span>
            <span className="font-mono">{headline.length}/70</span>
          </div>
        </div>

        <ImageUpload onImagesChange={setImages} initialImages={images} />

        <div>
          <Label className="text-base font-medium text-foreground mb-1.5 block">Post Content</Label>
          <RichTextEditor content={content} onChange={setContent} />
        </div>

        <PostOptionalElements
          openSections={openSections}
          onOpenSectionsChange={setOpenSections}
          logoUrl={logoUrl}
          logoLinkUrl={logoLinkUrl}
          byline={byline}
          onLogoChange={setLogoUrl}
          onLogoLinkChange={setLogoLinkUrl}
          onBylineChange={setByline}
          sponsors={sponsors}
          selectedSponsorId={formState.sponsorId}
          onSponsorSelect={setSponsorId}
          organizationId={activeOrganizationId}
          userId={user?.id}
          isLoadingSponsors={isLoadingSponsors}
          createSponsor={createSponsor}
          onSponsorCreated={() => fetchSponsors()}
          animatedFeaturedImage={animatedFeaturedImage}
          onAnimatedFeaturedImageChange={setAnimatedFeaturedImage}
          youtubeUrl={youtubeUrl}
          onYoutubeUrlChange={setYoutubeUrl}
          pollQuestion={pollState.question}
          pollOptions={pollState.options}
          onPollQuestionChange={setPollQuestion}
          onPollOptionsChange={setPollOptions}
          onRemovePoll={handleRemovePoll}
          isDeletingPoll={isDeletingPoll}
          ctaButtonText={ctaButtonText}
          ctaButtonUrl={ctaButtonUrl}
          onCtaButtonTextChange={setCtaButtonText}
          onCtaButtonUrlChange={setCtaButtonUrl}
          commentsEnabled={commentsEnabled}
          onCommentsEnabledChange={setCommentsEnabled}
          commentsSwitchId="enable-comments"
          authorName={authorName}
          authorBio={authorBio}
          authorPhotoUrl={authorPhotoUrl}
          onAuthorNameChange={handleAuthorNameChange}
          onAuthorBioChange={handleAuthorBioChange}
          onAuthorPhotoChange={handleAuthorPhotoChange}
          showSettingsLinks={true}
          hasAuthorBioDefaultSet={hasAuthorBioDefaultSet}
          onRefreshAuthorBioDefaults={refreshAuthorBioDefaults}
        />

        {/* Assignment Selection - only show if no preselected assignment */}
        {!preselectedAssignment && (
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-base font-medium text-foreground mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Select Assignment(s) <span className="text-destructive">*</span>
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Choose which assignment slot(s) this post fulfills. At least one assignment is required.
            </p>
            <AssignmentSelector
              assignments={availableAssignments}
              selectedAssignments={selectedAssignments}
              onToggleAssignment={toggleAssignment}
              onClearSelection={clearSelection}
              isLoading={isLoadingAssignments}
              mode="client"
              emptyMessage="No assignments available for your organization. Please contact your administrator."
            />
            {!isLoadingAssignments && availableAssignments.length > 0 && selectedAssignments.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-2">
                ⚠️ Please select at least one assignment
              </p>
            )}
          </div>
        )}

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox id="skip-ai-check" checked={skipAICheck} onCheckedChange={(checked) => setSkipAICheck(checked as boolean)} />
          <Label htmlFor="skip-ai-check" className="text-sm font-normal cursor-pointer">Skip typo check and analysis</Label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleSaveDraft} variant="outline" className="flex-1" size="lg"><Save className="mr-2 h-5 w-5" />Save as Draft</Button>
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
                  Your unsaved changes will be cleared and you'll return to the posts list. Your saved draft (if any) will not be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    resetForm();
                    resetPoll();
                    localStorage.removeItem(DRAFT_STORAGE_KEY);
                    navigate('/client/posts');
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Discard Changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <Button 
          onClick={handlePreview} 
          className="w-full" 
          size="lg" 
          disabled={isCreatingPoll || isUpdatingPoll || (!preselectedAssignment && selectedAssignments.length === 0)}
        >
          <Eye className="mr-2 h-5 w-5" />
          {isCreatingPoll ? 'Creating Poll...' : isUpdatingPoll ? 'Updating Poll...' : 'Preview Post'}
        </Button>
      </div>

      <PostReviewDialog open={showReview} onOpenChange={setShowReview} headline={headline} authorName={authorName} content={content} onReviewComplete={handleReviewComplete} onBackToEdit={handleBackToEdit} />

      <PostPreview open={showPreview} onOpenChange={(open) => !isSubmitting && setShowPreview(open)} headline={headline} authorName={authorName} logoUrl={logoUrl} logoLinkUrl={logoLinkUrl} logoAuthorName={byline} content={content} images={images} youtubeUrl={youtubeUrl} onSubmit={handleSubmit} availableAssignments={availableAssignments} selectedAssignments={selectedAssignments} onSelectedAssignmentsChange={setSelectedAssignments} ctaButtonText={ctaButtonText} ctaButtonUrl={ctaButtonUrl} siteName={siteName} selectedSocialPosts={selectedSocialPosts} onSocialPostsChange={setSelectedSocialPosts} pollEmbedCode={pollState.embedCode} pollEmbedUrl={pollState.embedUrl} animatedFeaturedImage={animatedFeaturedImage} submitButtonDisabled={isSubmitting} submitButtonText={isSubmitting ? 'Submitting...' : 'Submit for Publication'} authorBio={authorBio} authorPhotoUrl={authorPhotoUrl} />

      <AIPostGeneratorDialog open={showAIGenerator} onOpenChange={setShowAIGenerator} onUsePost={(genHeadline, genContent) => { setHeadline(genHeadline); setContent(genContent); }} />
    </div>
  );
}
