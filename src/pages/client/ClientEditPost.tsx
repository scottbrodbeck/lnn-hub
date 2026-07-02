import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/RichTextEditor';
import { ImageUpload } from '@/components/ImageUpload';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { canEditWithoutReview, getTimeUntilCutoff } from '@/lib/editTimeUtils';
import { notifyAdminsOfEditRequest } from '@/lib/notificationUtils';
import { AlertCircle, Clock, Save, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthorBioSection } from '@/components/post-form/AuthorBioSection';
import { LogoSection } from '@/components/post-form/LogoSection';
import { CTASection } from '@/components/post-form/CTASection';
import { getFeaturedImage, getNonFeaturedImages, normalizePostImages, serializePostImages } from '@/lib/postImageUtils';

export default function ClientEditPost() {
  const resolvePostSiteContext = async (post: any) => {
    if (post?.wordpress_site_id) {
      const { data: site } = await supabase
        .from('sites')
        .select('id, name, url')
        .eq('id', post.wordpress_site_id)
        .maybeSingle();

      if (site) {
        return {
          siteId: site.id,
          siteName: site.name,
          siteUrl: site.url,
          assignmentUuid: post.assignment_ids?.[0] ?? null,
          assignmentName: null,
        };
      }
    }

    const assignmentUuid = post?.assignment_ids?.[0] ?? null;
    if (!assignmentUuid) {
      return {
        siteId: null,
        siteName: null,
        siteUrl: null,
        assignmentUuid: null,
        assignmentName: null,
      };
    }

    const { data: assignment } = await supabase
      .from('post_assignments')
      .select('site_id, assignment_name, content_category, site:sites(name, url)')
      .eq('id', assignmentUuid)
      .maybeSingle();

    return {
      siteId: assignment?.site_id ?? null,
      siteName: (assignment?.site as any)?.name ?? null,
      siteUrl: (assignment?.site as any)?.url ?? null,
      assignmentUuid,
      assignmentName: assignment?.assignment_name ?? null,
    };
  };
  const { user, activeOrganizationId, activeOrganizationName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postId = searchParams.get('id');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [headline, setHeadline] = useState('');
  const [content, setContent] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [images, setImages] = useState<any[]>([]);
  const [editReason, setEditReason] = useState('');
  const [additionalChanges, setAdditionalChanges] = useState('');
  const [publicationDate, setPublicationDate] = useState<Date | null>(null);
  // null while the post/assignment is still loading; true/false once resolved
  const [canEditDirectly, setCanEditDirectly] = useState<boolean | null>(null);
  const [timeUntilCutoff, setTimeUntilCutoff] = useState<{ hours: number; minutes: number; isPast: boolean } | null>(null);
  // True if the linked assignment is NOT a website assignment (data inconsistency)
  const [linkedAssignmentMismatch, setLinkedAssignmentMismatch] = useState(false);

  // Author bio state
  const [authorName, setAuthorName] = useState('');
  const [authorBio, setAuthorBio] = useState('');
  const [authorPhotoUrl, setAuthorPhotoUrl] = useState<string | null>(null);
  const [authorBioOpen, setAuthorBioOpen] = useState(false);

  // Logo/sponsor state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLinkUrl, setLogoLinkUrl] = useState<string | null>(null);
  const [logoAuthorName, setLogoAuthorName] = useState('');
  const [logoOpen, setLogoOpen] = useState(false);

  // CTA state
  const [ctaButtonText, setCtaButtonText] = useState('');
  const [ctaButtonUrl, setCtaButtonUrl] = useState('');
  const [ctaOpen, setCtaOpen] = useState(false);

  const [originalPost, setOriginalPost] = useState<any>(null);
  
  // Determine where to navigate on cancel based on referrer
  const referrer = searchParams.get('from') || 'drafts';

  useEffect(() => {
    if (postId) {
      loadPost();
    } else {
      navigate('/client/drafts');
    }
  }, [postId]);

  useEffect(() => {
    if (publicationDate) {
      const canEdit = canEditWithoutReview(publicationDate);
      setCanEditDirectly(canEdit);
      setTimeUntilCutoff(getTimeUntilCutoff(publicationDate));
      
      // Update countdown every minute
      const interval = setInterval(() => {
        setTimeUntilCutoff(getTimeUntilCutoff(publicationDate));
        setCanEditDirectly(canEditWithoutReview(publicationDate));
      }, 60000);
      
      return () => clearInterval(interval);
    }
  }, [publicationDate]);

  const loadPost = async () => {
    try {
      const { data: post, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle();

      if (error) throw error;
      if (!post) throw new Error('Post not found');

      setOriginalPost(post);
      setHeadline(post.headline);
      setContent(post.content);
      setYoutubeUrl(post.youtube_url || '');

      // Author bio
      setAuthorName(post.author_name || '');
      setAuthorBio(post.author_bio || '');
      setAuthorPhotoUrl(post.author_photo_url || null);
      if (post.author_name || post.author_bio || post.author_photo_url) setAuthorBioOpen(true);

      // Logo/sponsor
      setLogoUrl(post.logo_url || null);
      setLogoLinkUrl(post.logo_link_url || null);
      setLogoAuthorName(post.logo_author_name || '');
      if (post.logo_url || post.logo_author_name) setLogoOpen(true);

      // CTA
      setCtaButtonText(post.cta_button_text || '');
      setCtaButtonUrl(post.cta_button_url || '');
      if (post.cta_button_text || post.cta_button_url) setCtaOpen(true);
      
      const loadedImages = normalizePostImages(
        post.featured_image_url as any,
        (post.gallery_images as any[] | null) || null,
        post.featured_image_id || null,
      );
      setImages(loadedImages);

      // Get publication date from first assignment
      // For recurring assignments, the composite ID contains the instance date (e.g., "uuid_2026-02-24")
      if (post.assignment_ids && post.assignment_ids.length > 0) {
        const { extractInstanceDatesFromAssignmentIds, extractUuidsFromAssignmentIds } = await import('@/lib/assignmentUtils');
        const instanceDatesMap = extractInstanceDatesFromAssignmentIds(post.assignment_ids);
        const uuids = extractUuidsFromAssignmentIds(post.assignment_ids);
        const instanceDate = uuids.length > 0 ? instanceDatesMap[uuids[0]] : null;

        // Verify the linked assignment is actually a website assignment;
        // surface a banner if it's email_blast / email_sponsorship.
        if (uuids.length > 0) {
          const { data: linkedAssignment } = await supabase
            .from('post_assignments')
            .select('due_date, content_category')
            .eq('id', uuids[0])
            .maybeSingle();

          if (linkedAssignment?.content_category && linkedAssignment.content_category !== 'website') {
            setLinkedAssignmentMismatch(true);
          }

          if (instanceDate) {
            setPublicationDate(new Date(instanceDate + 'T00:00:00'));
          } else if (linkedAssignment?.due_date) {
            setPublicationDate(new Date(linkedAssignment.due_date + 'T00:00:00'));
          }
        }
      }
    } catch (error: any) {
      toast.error('Failed to load post: ' + error.message);
      navigate('/client/drafts');
    } finally {
      setLoading(false);
    }
  };

  // Build the author/sponsor/CTA fields for post update
  const getPostUpdateFields = () => ({
    author_name: authorName || null,
    author_bio: authorBio || null,
    author_photo_url: authorPhotoUrl || null,
    logo_url: logoUrl || null,
    logo_link_url: logoLinkUrl || null,
    logo_author_name: logoAuthorName || null,
    cta_button_text: ctaButtonText || null,
    cta_button_url: ctaButtonUrl || null,
  });

  // Build new columns for edit request inserts
  const getEditRequestAuthorSponsorFields = () => ({
    old_author_bio: originalPost?.author_bio || null,
    new_author_bio: authorBio || null,
    old_author_photo_url: originalPost?.author_photo_url || null,
    new_author_photo_url: authorPhotoUrl || null,
    old_logo_url: originalPost?.logo_url || null,
    new_logo_url: logoUrl || null,
    old_logo_link_url: originalPost?.logo_link_url || null,
    new_logo_link_url: logoLinkUrl || null,
    old_logo_author_name: originalPost?.logo_author_name || null,
    new_logo_author_name: logoAuthorName || null,
    old_cta_button_text: originalPost?.cta_button_text || null,
    new_cta_button_text: ctaButtonText || null,
    old_cta_button_url: originalPost?.cta_button_url || null,
    new_cta_button_url: ctaButtonUrl || null,
  });

  // Build changes summary including author/sponsor
  const buildChangesSummary = (featuredUrl: string | null): string[] => {
    const changesSummary: string[] = [];
    if (headline.trim() !== originalPost?.headline) changesSummary.push('Headline updated');
    if (content !== originalPost?.content) changesSummary.push('Content updated');
    if (featuredUrl !== originalPost?.featured_image_url) changesSummary.push('Featured image changed');
    const originalImages = normalizePostImages(
      originalPost?.featured_image_url as any,
      (originalPost?.gallery_images as any[] | null) || null,
      originalPost?.featured_image_id || null,
    );
    const originalSerialized = JSON.stringify(serializePostImages(originalImages));
    const currentSerialized = JSON.stringify(serializePostImages(images));
    if (currentSerialized !== originalSerialized) changesSummary.push('Gallery images changed');
    if ((youtubeUrl.trim() || null) !== originalPost?.youtube_url) changesSummary.push('YouTube URL updated');
    if (authorName !== (originalPost?.author_name || '') || authorBio !== (originalPost?.author_bio || '')) changesSummary.push('Author bio updated');
    if (authorPhotoUrl !== (originalPost?.author_photo_url || null)) changesSummary.push('Author photo updated');
    if (logoUrl !== (originalPost?.logo_url || null)) changesSummary.push('Sponsor logo changed');
    if (logoLinkUrl !== (originalPost?.logo_link_url || null)) changesSummary.push('Sponsor link updated');
    if (ctaButtonText !== (originalPost?.cta_button_text || '') || ctaButtonUrl !== (originalPost?.cta_button_url || '')) changesSummary.push('CTA button updated');
    return changesSummary;
  };

  // Handle pre-publication edit WITH additional changes request
  const validateSponsorPair = (): boolean => {
    const hasLogo = !!logoUrl;
    const hasName = !!logoAuthorName?.trim();
    if (hasLogo === hasName) return true;
    toast.error(hasLogo
      ? 'Please add an organization name to go with the logo (or remove the logo).'
      : 'Please upload a sponsor logo to go with the organization name (or clear it).');
    return false;
  };

  const handleDirectSaveWithAdditionalChanges = async () => {
    if (!validateSponsorPair()) return;
    setSaving(true);
    try {
      const featuredImage = getFeaturedImage(images);
      const featuredUrl = featuredImage?.processedUrl || featuredImage?.originalUrl || null;
      const serializedImages = serializePostImages(images);
      const nonFeaturedImages = getNonFeaturedImages(images);

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          headline: headline.trim(),
          content,
          youtube_url: youtubeUrl.trim() || null,
          featured_image_id: featuredImage?.recordId || null,
          featured_image_url: featuredUrl,
          gallery_images: serializedImages,
          updated_at: new Date().toISOString(),
          ...getPostUpdateFields(),
        })
        .eq('id', postId);

      if (updateError) throw updateError;

      // 2. Resolve site context once — used for both WP sync and notification below
      const siteContext = await resolvePostSiteContext(originalPost);

      // WordPress sync if post is already published
      if (originalPost.wordpress_post_id && siteContext.siteId) {
        const { data: wpResult, error: wpError } = await supabase.functions.invoke('publish-to-wordpress', {
          body: {
            mode: 'update',
            post_id: postId,
            site_id: siteContext.siteId
          }
        });

        if (wpError) {
          console.error('WordPress update failed:', wpError);
          toast.warning('Changes saved, but the WordPress sync failed — the live article may be out of date. An admin will need to re-sync it.');
        } else if (wpResult?.inline_sync_warning) {
          toast.warning(`WordPress updated, but inline image sync needs attention: ${wpResult.inline_sync_warning}`);
        }
      }

      // 3. Create edit request for additional changes tracking
      const { error: requestError } = await supabase
        .from('post_edit_requests')
        .insert({
          post_id: postId,
          old_headline: originalPost.headline,
          new_headline: headline.trim(),
          old_content: originalPost.content,
          new_content: content,
          old_featured_image_url: originalPost.featured_image_url,
          new_featured_image_url: featuredUrl,
          old_featured_image_id: originalPost.featured_image_id ?? null,
          new_featured_image_id: featuredImage?.recordId ?? null,
          old_gallery_images: originalPost.gallery_images,
          new_gallery_images: nonFeaturedImages.map(img => ({
            id: img.id,
            originalUrl: img.originalUrl,
            processedUrl: img.processedUrl,
            isFeatured: false,
            caption: img.caption,
          })),
          old_youtube_url: originalPost.youtube_url,
          new_youtube_url: youtubeUrl.trim() || null,
          old_author_name: originalPost.author_name || null,
          new_author_name: authorName || null,
          ...getEditRequestAuthorSponsorFields(),
          requested_by: user!.id,
          request_reason: 'Pre-publication edit with additional change requests',
          additional_request_data: { additionalChanges: additionalChanges.trim() },
          status: 'pending'
        });

      if (requestError) throw requestError;

      // 4. Build notification fields from the resolved site context
      let wordpressEditUrl: string | null = null;
      let siteId: string | null = siteContext.siteId;
      let siteName: string | null = siteContext.siteName;
      const assignmentUuid = siteContext.assignmentUuid;

      if (siteContext.siteUrl && originalPost.wordpress_post_id) {
        wordpressEditUrl = `${siteContext.siteUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${originalPost.wordpress_post_id}&action=edit`;
      }

      // 5. Calculate changes summary
      const changesSummary = buildChangesSummary(featuredUrl);

      // 6. Fetch assignment name for notification
      let assignmentName: string | null = siteContext.assignmentName;
      if (assignmentUuid && !assignmentName) {
        const { data: asgForName } = await supabase
          .from('post_assignments')
          .select('assignment_name')
          .eq('id', assignmentUuid)
          .single();
        assignmentName = asgForName?.assignment_name || null;
      }

      // 7. Send notification
      try {
        await notifyAdminsOfEditRequest(supabase, {
          postId: postId!,
          headline,
          userId: user?.id || '',
          organizationId: activeOrganizationId,
          organizationName: activeOrganizationName,
          publicationDate: publicationDate ? format(publicationDate, 'yyyy-MM-dd') : undefined,
          requestReason: 'Pre-publication edit with additional change requests',
          wordpressEditUrl,
          siteId,
          siteName,
          assignmentUuid,
          assignmentName,
          changesSummary,
          isPrePublication: true
        });
      } catch (error) {
        console.error('Failed to send notification:', error);
      }

      toast.success('Changes saved. Additional requests submitted for admin review.');
      navigate(referrer === 'posts' ? '/client/posts' : '/client/drafts');
    } catch (error: any) {
      toast.error('Failed to save changes: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDirectSave = async () => {
    if (!headline.trim()) {
      toast.error('Please enter a headline');
      return;
    }
    if (!validateSponsorPair()) return;
    // If additional changes are requested, create an edit request instead
    if (additionalChanges.trim()) {
      await handleDirectSaveWithAdditionalChanges();
      return;
    }

    setSaving(true);
    try {
      const featuredImage = getFeaturedImage(images);
      const featuredUrl = featuredImage?.processedUrl || featuredImage?.originalUrl || null;
      const serializedImages = serializePostImages(images);
      const nonFeaturedImages = getNonFeaturedImages(images);

      const { error } = await supabase
        .from('posts')
        .update({
          headline: headline.trim(),
          content,
          youtube_url: youtubeUrl.trim() || null,
          featured_image_id: featuredImage?.recordId || null,
          featured_image_url: featuredUrl,
          gallery_images: serializedImages,
          updated_at: new Date().toISOString(),
          ...getPostUpdateFields(),
        })
        .eq('id', postId);

      if (error) throw error;

      // If post is already published to WordPress, use durable site context first
      if (originalPost.wordpress_post_id) {
        const siteContext = await resolvePostSiteContext(originalPost);

        if (siteContext.siteId) {
          const { data: wpResult, error: wpError } = await supabase.functions.invoke('publish-to-wordpress', {
            body: {
              mode: 'update',
              post_id: postId,
              site_id: siteContext.siteId
            }
          });

          if (wpError) {
            console.error('WordPress update failed:', wpError);
            toast.warning('Post updated locally, but WordPress sync failed');
          } else {
            if (wpResult?.inline_sync_warning) {
              toast.warning(`WordPress updated, but inline image sync needs attention: ${wpResult.inline_sync_warning}`);
            }

            const { data: refreshedPost, error: refreshedPostError } = await supabase
              .from('posts')
              .select('*')
              .eq('id', postId)
              .maybeSingle();

            if (refreshedPostError) {
              console.error('Failed to refresh post after WordPress update:', refreshedPostError);
            } else if (refreshedPost) {
              setOriginalPost(refreshedPost);
              setContent(refreshedPost.content);
            }

            toast.success('Post updated successfully in WordPress');
          }
        } else {
          toast.success('Changes saved successfully');
        }
      } else {
        toast.success('Changes saved successfully');
      }

      // Log the direct edit action (no notification)
      try {
        await supabase.from('api_logs').insert({
          log_type: 'post_direct_edit',
          status: 'success',
          summary: `Client directly edited post: "${headline.trim()}"`,
          request_data: {
            post_id: postId,
            edited_by: user?.id,
            organization_id: activeOrganizationId,
            publication_date: publicationDate ? format(publicationDate, 'yyyy-MM-dd') : undefined,
          }
        });
      } catch (error) {
        console.error('Failed to log edit:', error);
      }

      navigate(referrer === 'posts' ? '/client/posts' : '/client/drafts');
    } catch (error: any) {
      toast.error('Failed to save changes: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!headline.trim()) {
      toast.error('Please enter a headline');
      return;
    }

    if (!editReason.trim()) {
      toast.error('Please explain why you need to make changes after the deadline');
      return;
    }

    if (!validateSponsorPair()) return;

    setSaving(true);
    try {
      const featuredImage = getFeaturedImage(images);
      const featuredUrl = featuredImage?.processedUrl || featuredImage?.originalUrl || null;
      const nonFeaturedImages = getNonFeaturedImages(images);

      const { error } = await supabase
        .from('post_edit_requests')
        .insert({
          post_id: postId,
          old_headline: originalPost.headline,
          new_headline: headline.trim(),
          old_content: originalPost.content,
          new_content: content,
          old_featured_image_url: originalPost.featured_image_url,
          new_featured_image_url: featuredUrl,
          old_featured_image_id: originalPost.featured_image_id ?? null,
          new_featured_image_id: featuredImage?.recordId ?? null,
          old_gallery_images: originalPost.gallery_images,
          new_gallery_images: nonFeaturedImages.map(img => ({
            id: img.id,
            originalUrl: img.originalUrl,
            processedUrl: img.processedUrl,
            isFeatured: false,
            caption: img.caption,
          })),
          old_youtube_url: originalPost.youtube_url,
          new_youtube_url: youtubeUrl.trim() || null,
          old_author_name: originalPost.author_name || null,
          new_author_name: authorName || null,
          ...getEditRequestAuthorSponsorFields(),
          requested_by: user!.id,
          request_reason: editReason.trim(),
          additional_request_data: additionalChanges.trim() ? { additionalChanges: additionalChanges.trim() } : null,
          status: 'pending'
        });

      if (error) throw error;

      toast.success('Edit request submitted for admin review');

      // Resolve site context for notification
      const siteContext = await resolvePostSiteContext(originalPost);
      let wordpressEditUrl: string | null = null;
      const siteId: string | null = siteContext.siteId;
      const siteName: string | null = siteContext.siteName;
      const assignmentUuid: string | null = siteContext.assignmentUuid;
      const assignmentName: string | null = siteContext.assignmentName;

      if (siteContext.siteUrl && originalPost.wordpress_post_id) {
        wordpressEditUrl = `${siteContext.siteUrl.replace(/\/$/, '')}/wp-admin/post.php?post=${originalPost.wordpress_post_id}&action=edit`;
      }

      // Calculate changes summary
      const changesSummary = buildChangesSummary(featuredUrl);

      // Send notification to admins using shared utility
      try {
        await notifyAdminsOfEditRequest(supabase, {
          postId: postId!,
          headline,
          userId: user?.id || '',
          organizationId: activeOrganizationId,
          organizationName: activeOrganizationName,
          publicationDate: publicationDate ? format(publicationDate, 'yyyy-MM-dd') : undefined,
          requestReason: editReason,
          wordpressEditUrl,
          siteId,
          siteName,
          assignmentUuid,
          assignmentName,
          changesSummary,
          isPrePublication: false
        });
      } catch (error) {
        console.error('Failed to send notification:', error);
      }

      navigate(referrer === 'posts' ? '/client/posts' : '/client/drafts');
    } catch (error: any) {
      toast.error('Failed to submit edit request: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading post...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Edit Post</h1>
        <p className="text-muted-foreground mt-2">
          Make changes to your submitted post
        </p>
      </div>

      {linkedAssignmentMismatch && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Assignment Mismatch</AlertTitle>
          <AlertDescription>
            This post is linked to a non-website assignment. Site context may be incomplete — please contact your account manager if you see issues.
          </AlertDescription>
        </Alert>
      )}

      {canEditDirectly === false && timeUntilCutoff?.isPast && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Edit Deadline Passed</AlertTitle>
          <AlertDescription>
            It's past 10:30 AM ET on the publication day. Your changes will require admin approval before being published to WordPress.
          </AlertDescription>
        </Alert>
      )}

      {canEditDirectly === true && timeUntilCutoff && !timeUntilCutoff.isPast && (
        <Alert className="mb-6">
          <Clock className="h-4 w-4" />
          <AlertTitle>Time Until Edit Deadline</AlertTitle>
          <AlertDescription>
            You can make direct changes for the next {timeUntilCutoff.hours}h {timeUntilCutoff.minutes}m (until 10:30 AM ET on publication day)
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="headline">Headline *</Label>
            <Input
              id="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Enter post headline"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <RichTextEditor
              content={content}
              onChange={setContent}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube">YouTube URL (optional)</Label>
            <Input
              id="youtube"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>

          <div className="space-y-2">
            <Label>Images</Label>
            <ImageUpload 
              onImagesChange={setImages}
              initialImages={images}
            />
          </div>

          {/* Author Bio Section */}
          <AuthorBioSection
            isOpen={authorBioOpen}
            onOpenChange={setAuthorBioOpen}
            authorName={authorName}
            authorBio={authorBio}
            authorPhotoUrl={authorPhotoUrl}
            onAuthorNameChange={setAuthorName}
            onAuthorBioChange={setAuthorBio}
            onAuthorPhotoChange={setAuthorPhotoUrl}
          />

          {/* Logo / Sponsor Section */}
          <LogoSection
            isOpen={logoOpen}
            onOpenChange={setLogoOpen}
            logoUrl={logoUrl}
            logoLinkUrl={logoLinkUrl}
            byline={logoAuthorName}
            onLogoChange={setLogoUrl}
            onLogoLinkChange={setLogoLinkUrl}
            onBylineChange={setLogoAuthorName}
          />

          {/* CTA Section */}
          <CTASection
            isOpen={ctaOpen}
            onOpenChange={setCtaOpen}
            buttonText={ctaButtonText}
            buttonUrl={ctaButtonUrl}
            onButtonTextChange={setCtaButtonText}
            onButtonUrlChange={setCtaButtonUrl}
          />

          <div className="space-y-2">
            <Label htmlFor="additional-changes">Request Additional Changes (optional)</Label>
            <p className="text-sm text-muted-foreground">
              Need changes that aren't available here? Describe what you need (e.g., poll updates, etc.)
            </p>
            <Textarea
              id="additional-changes"
              value={additionalChanges}
              onChange={(e) => setAdditionalChanges(e.target.value)}
              placeholder="Describe any additional changes you need..."
              rows={3}
            />
          </div>

          {canEditDirectly === false && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Late Edit *</Label>
              <Textarea
                id="reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Explain why you need to make changes after the deadline..."
                rows={4}
              />
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => navigate(referrer === 'posts' ? '/client/posts' : '/client/drafts')}
              disabled={saving}
            >
              Cancel
            </Button>
            
            {/* Buttons are disabled while edit permissions are still being resolved (canEditDirectly === null) */}
            {canEditDirectly !== false ? (
              <Button onClick={handleDirectSave} disabled={saving || canEditDirectly === null}>
                <Save className="h-4 w-4 mr-2" />
                {canEditDirectly === null ? 'Loading...' : saving ? 'Saving...' : 'Save Changes'}
              </Button>
            ) : (
              <Button onClick={handleSubmitForReview} disabled={saving}>
                <Send className="h-4 w-4 mr-2" />
                {saving ? 'Submitting...' : 'Submit for Review'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
