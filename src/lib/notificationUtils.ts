import { SupabaseClient } from '@supabase/supabase-js';
import { getAppBaseUrl } from '@/lib/utils';
import { AnimatedImage } from '@/components/AnimatedImageUpload';

interface NotifyAdminsParams {
  postId: string;
  headline: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  assignmentUuid?: string | null;
  source: 'client_submit' | 'direct_publish';
  siteId?: string | null;
  siteName?: string | null;
  publicationDate?: string | null;
  wordpressUrl?: string | null;
  wordpressEditUrl?: string | null;
  additionalData: {
    assignmentName?: string | null;
    socialPosts?: { text: string; edited: boolean }[];
    poll?: {
      question: string;
      options: string[];
      crowdsignal_poll_id: string | null;
    } | null;
    animatedFeaturedImage?: AnimatedImage | null;
    ctaButtonText?: string | null;
    ctaButtonUrl?: string | null;
    logoUrl?: string | null;
    logoLinkUrl?: string | null;
    logoAuthorName?: string | null;
    youtubeUrl?: string | null;
    commentsEnabled?: boolean;
    authorName?: string | null;
    authorBio?: string | null;
    authorPhotoUrl?: string | null;
  };
}

interface NotifyEditParams {
  postId: string;
  headline: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  publicationDate?: string | null;
  directEdit: boolean;
  wordpressEditUrl?: string | null;
  siteName?: string | null;
  assignmentName?: string | null;
  assignmentUuid?: string | null;
  authorName?: string | null;
}

interface NotifyEditRequestParams {
  postId: string;
  headline: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  publicationDate?: string | null;
  requestReason: string;
  wordpressEditUrl?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  assignmentUuid?: string | null;
  assignmentName?: string | null;
  changesSummary?: string[] | null;
  isPrePublication?: boolean;
}

interface NotifyDateChangeParams {
  assignmentId: string;
  assignmentName: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  oldDueDate: string;
  newDueDate: string;
  requestReason?: string | null;
  instanceDate?: string | null;
}

interface NotifySupportRequestParams {
  requestId: string;
  description: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  contactName: string;
  contactEmail: string;
  pageUrl?: string;
  screenshotCount: number;
}

/**
 * Sends a notification to admins about a post submission.
 * Used by both ClientSubmitPost and AdminDirectPublish.
 */
export async function notifyAdminsOfSubmission(
  supabase: SupabaseClient,
  params: NotifyAdminsParams
): Promise<{ success: boolean; error?: string }> {
  console.log('[notifyAdminsOfSubmission] Starting notification for post:', params.postId);
  
  try {
    // Get user profile
    console.log('[notifyAdminsOfSubmission] Fetching user profile for:', params.userId);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', params.userId)
      .single();

    if (profileError) {
      console.warn('[notifyAdminsOfSubmission] Profile fetch warning:', profileError);
    }
    console.log('[notifyAdminsOfSubmission] Profile fetched:', profile?.email);

    const { additionalData } = params;
    const hasPoll = Boolean(additionalData.poll);

    const hasAuthorBio = Boolean(additionalData.authorName || additionalData.authorBio || additionalData.authorPhotoUrl);

    const payload = {
      event_type: 'post_submitted',
      post_id: params.postId,
      post_headline: params.headline,
      user_id: params.userId,
      user_name: profile?.full_name || (params.source === 'direct_publish' ? 'Admin' : 'Unknown'),
      user_email: profile?.email,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: params.publicationDate,
      admin_link: params.assignmentUuid 
        ? `${getAppBaseUrl()}/admin/assignments?assignment=${params.assignmentUuid}`
        : `${getAppBaseUrl()}/admin/assignments`,
      timestamp: new Date().toISOString(),
      additional_data: {
        source: params.source,
        site_name: params.siteName || null,
        site_id: params.siteId || null,
        assignment_name: params.additionalData?.assignmentName || null,
        social_posts: additionalData.socialPosts || [],
        social_posts_count: additionalData.socialPosts?.length || 0,
        poll: additionalData.poll,
        has_poll: hasPoll,
        animated_featured_image: additionalData.animatedFeaturedImage ? {
          url: additionalData.animatedFeaturedImage.url,
          file_size_bytes: additionalData.animatedFeaturedImage.fileSize,
          file_size_display: `${(additionalData.animatedFeaturedImage.fileSize / 1024 / 1024).toFixed(2)} MB`,
          is_animated: additionalData.animatedFeaturedImage.isAnimated,
          is_video: additionalData.animatedFeaturedImage.isVideo ?? false
        } : null,
        cta_button_text: additionalData.ctaButtonText || null,
        cta_button_url: additionalData.ctaButtonUrl || null,
        has_cta: Boolean(additionalData.ctaButtonText && additionalData.ctaButtonUrl),
        logo_url: additionalData.logoUrl || null,
        logo_link_url: additionalData.logoLinkUrl || null,
        logo_author_name: additionalData.logoAuthorName || null,
        youtube_url: additionalData.youtubeUrl || null,
        comments_enabled: additionalData.commentsEnabled || false,
        wordpress_url: params.wordpressUrl || null,
        wordpress_edit_url: params.wordpressEditUrl || null,
        author_name: additionalData.authorName || null,
        author_bio: additionalData.authorBio || null,
        author_photo_url: additionalData.authorPhotoUrl || null,
        has_author_bio: hasAuthorBio,
        content_type: 'Website Post',
      }
    };

    console.log('[notifyAdminsOfSubmission] Invoking notify-admins edge function...');
    const startTime = Date.now();
    
    const { error, data } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    const duration = Date.now() - startTime;
    console.log(`[notifyAdminsOfSubmission] Edge function responded in ${duration}ms`);

    if (error) {
      console.error('[notifyAdminsOfSubmission] Edge function error:', error);
      return { success: false, error: error.message };
    }

    console.log('[notifyAdminsOfSubmission] Edge function response data:', data);
    console.log('[notifyAdminsOfSubmission] Webhook notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('[notifyAdminsOfSubmission] Exception caught:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a notification to admins about a direct post edit.
 * Used when a client edits before the deadline.
 */
export async function notifyAdminsOfEdit(
  supabase: SupabaseClient,
  params: NotifyEditParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', params.userId)
      .single();

    const payload = {
      event_type: 'post_edited',
      post_id: params.postId,
      post_headline: params.headline,
      user_id: params.userId,
      user_name: profile?.full_name || 'Unknown',
      user_email: profile?.email,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: params.publicationDate,
      admin_link: params.assignmentUuid 
        ? `${getAppBaseUrl()}/admin/assignments?assignment=${params.assignmentUuid}`
        : `${getAppBaseUrl()}/admin/assignments`,
      timestamp: new Date().toISOString(),
      additional_data: {
        direct_edit: params.directEdit,
        edited_before_deadline: params.directEdit,
        wordpress_edit_url: params.wordpressEditUrl || null,
        site_name: params.siteName || null,
        assignment_name: params.assignmentName || null,
        author_name: params.authorName || null,
      }
    };

    const { error } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    if (error) {
      console.error('Notify-admins error:', error);
      return { success: false, error: error.message };
    }

    console.log('Edit notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send edit notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a notification to admins about an edit request submission.
 * Used when a client submits edits after the deadline for review.
 */
export async function notifyAdminsOfEditRequest(
  supabase: SupabaseClient,
  params: NotifyEditRequestParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', params.userId)
      .single();

    const payload = {
      event_type: 'edit_request_submitted',
      post_id: params.postId,
      post_headline: params.headline,
      user_id: params.userId,
      user_name: profile?.full_name || 'Unknown',
      user_email: profile?.email,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: params.publicationDate,
      admin_link: params.assignmentUuid 
        ? `${getAppBaseUrl()}/admin/assignments?assignment=${params.assignmentUuid}`
        : `${getAppBaseUrl()}/admin/tasks`,
      timestamp: new Date().toISOString(),
      additional_data: {
        request_reason: params.requestReason,
        past_deadline: !params.isPrePublication,
        is_pre_publication: params.isPrePublication || false,
        wordpress_edit_url: params.wordpressEditUrl || null,
        site_name: params.siteName || null,
        site_id: params.siteId || null,
        changes_summary: params.changesSummary || [],
        assignment_name: params.assignmentName || null,
      }
    };

    const { error } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    if (error) {
      console.error('Notify-admins error:', error);
      return { success: false, error: error.message };
    }

    console.log('Edit request notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send edit request notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a notification to admins about a date change request.
 * Used when a client requests to change the due date for an assignment.
 */
export async function notifyAdminsOfDateChangeRequest(
  supabase: SupabaseClient,
  params: NotifyDateChangeParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', params.userId)
      .single();

    const payload = {
      event_type: 'date_change_requested',
      post_id: '00000000-0000-0000-0000-000000000000', // Not applicable for date changes
      post_headline: params.assignmentName,
      user_id: params.userId,
      user_name: profile?.full_name || 'Unknown',
      user_email: profile?.email,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: params.newDueDate,
      admin_link: `${getAppBaseUrl()}/admin/tasks`,
      timestamp: new Date().toISOString(),
      additional_data: {
        request_type: 'date_change',
        assignment_id: params.assignmentId,
        assignment_name: params.assignmentName,
        old_due_date: params.oldDueDate,
        new_due_date: params.newDueDate,
        request_reason: params.requestReason || null,
        instance_date: params.instanceDate || null,
      }
    };

    const { error } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    if (error) {
      console.error('Notify-admins error:', error);
      return { success: false, error: error.message };
    }

    console.log('Date change request notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send date change request notification:', error);
    return { success: false, error: error.message };
  }
}

interface NotifySupportRequestParams {
  requestId: string;
  description: string;
  userId: string;
  organizationId?: string | null;
  organizationName?: string | null;
  contactName: string;
  contactEmail: string;
  pageUrl?: string;
  screenshotCount: number;
}

/**
 * Sends a notification to admins about a support request.
 * Used when a client submits a help request.
 */
export async function notifyAdminsOfSupportRequest(
  supabase: SupabaseClient,
  params: NotifySupportRequestParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      event_type: 'support_request',
      post_id: params.requestId, // Using request ID in place of post_id
      post_headline: 'Support Request',
      user_id: params.userId,
      user_name: params.contactName,
      user_email: params.contactEmail,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: null,
      admin_link: `${getAppBaseUrl()}/admin/tasks`,
      timestamp: new Date().toISOString(),
      additional_data: {
        request_id: params.requestId,
        description: params.description,
        page_url: params.pageUrl || null,
        screenshot_count: params.screenshotCount,
      }
    };

    const { error } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    if (error) {
      console.error('Notify-admins error:', error);
      return { success: false, error: error.message };
    }

    console.log('Support request notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send support request notification:', error);
    return { success: false, error: error.message };
  }
}

interface NotifyChangeRequestParams {
  requestId: string;
  userId: string;
  contactName: string;
  contactEmail: string;
  organizationId?: string | null;
  organizationName?: string | null;
  relatedType: 'email_blast' | 'email_sponsorship';
  relatedId: string;
  relatedName: string;
  changeDescription: string;
  newClickUrl?: string | null;
  newCreativeUrl?: string | null;
}

/**
 * Notifies admins that a client has requested changes to an already-submitted
 * email blast or sponsorship.
 */
export async function notifyAdminsOfChangeRequest(
  supabase: SupabaseClient,
  params: NotifyChangeRequestParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const typeLabel = params.relatedType === 'email_blast' ? 'Email Blast' : 'Email Sponsorship';
    const payload = {
      event_type: 'change_request',
      post_id: params.requestId, // request ID stands in for post_id
      post_headline: `Change request — ${typeLabel}: ${params.relatedName}`,
      user_id: params.userId,
      user_name: params.contactName,
      user_email: params.contactEmail,
      organization_id: params.organizationId || null,
      organization_name: params.organizationName || null,
      publication_date: null,
      admin_link: `${getAppBaseUrl()}/admin/tasks`,
      timestamp: new Date().toISOString(),
      additional_data: {
        request_id: params.requestId,
        related_type: params.relatedType,
        related_id: params.relatedId,
        related_name: params.relatedName,
        change_description: params.changeDescription,
        new_click_url: params.newClickUrl || null,
        new_creative_url: params.newCreativeUrl || null,
      }
    };

    const { error } = await supabase.functions.invoke('notify-admins', {
      body: payload
    });

    if (error) {
      console.error('Notify-admins error:', error);
      return { success: false, error: error.message };
    }

    console.log('Change request notification sent successfully');
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send change request notification:', error);
    return { success: false, error: error.message };
  }
}
