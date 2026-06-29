import { ProcessedImage } from '@/components/ImageUpload';
import { AnimatedImage } from '@/components/AnimatedImageUpload';
import { extractUuidsFromAssignmentIds, extractInstanceDatesFromAssignmentIds } from '@/lib/assignmentUtils';
import { getFeaturedImage, serializePostImages } from '@/lib/postImageUtils';

export interface SocialPost {
  id: string;
  text: string;
  type: 'punchy' | 'engagement' | 'quote' | 'informative' | 'custom';
  edited: boolean;
  isPlaceholder?: boolean;
}

export interface PollData {
  question: string;
  options: string[];
  crowdsignalPollId: string | null;
  embedUrl: string | null;
  jsEmbedCode: string | null;
}

export interface PostFormData {
  headline: string;
  authorName: string;
  logoUrl: string | null;
  logoLinkUrl: string | null;
  byline: string;
  content: string;
  images: ProcessedImage[];
  youtubeUrl: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  commentsEnabled: boolean;
  animatedFeaturedImage: AnimatedImage | null;
  socialPosts: SocialPost[];
  pollData: PollData | null;
  authorBio: string;
  authorPhotoUrl: string | null;
  sponsorId: string | null;
}

interface BuildPostDataOptions {
  status: 'draft' | 'published';
  clientId: string;
  assignmentIds: string[];
  includeSocialPostsAndInstanceDates?: boolean;
}

/**
 * Builds a post data object ready for database insertion/update.
 * Centralizes the post data construction logic used in both ClientSubmitPost and AdminDirectPublish.
 */
export function buildPostData(
  formData: PostFormData,
  options: BuildPostDataOptions
) {
  const { status, clientId, assignmentIds, includeSocialPostsAndInstanceDates = false } = options;
  
  const featuredImage = getFeaturedImage(formData.images);
  const filteredPollOptions = formData.pollData?.options.filter(o => o.trim()) || [];
  const hasPoll = formData.pollData?.question.trim() && filteredPollOptions.length >= 2;

  // Build social_posts field (may include instance_dates for drafts)
  let socialPostsField: any = null;
  
  if (includeSocialPostsAndInstanceDates) {
    const socialPostsData = formData.socialPosts.length === 2 
      ? formData.socialPosts.map(p => ({ text: p.text, edited: p.edited }))
      : null;
    const instanceDates = extractInstanceDatesFromAssignmentIds(assignmentIds);
    
    if (Object.keys(instanceDates).length > 0 || socialPostsData) {
      socialPostsField = {
        posts: socialPostsData,
        instance_dates: Object.keys(instanceDates).length > 0 ? instanceDates : undefined
      };
    }
  } else {
    // Simple format for published posts
    socialPostsField = formData.socialPosts.length === 2 
      ? formData.socialPosts.map(p => ({ text: p.text, edited: p.edited }))
      : null;
  }

  return {
    headline: formData.headline,
    author_name: formData.authorName || null,
    logo_url: formData.logoUrl || null,
    logo_link_url: formData.logoLinkUrl || null,
    byline: formData.byline || null,
    logo_author_name: formData.byline || null,
    content: formData.content || '',
    featured_image_id: featuredImage?.recordId || null,
    featured_image_url: featuredImage?.processedUrl || featuredImage?.originalUrl || null,
    gallery_images: formData.images.length > 0 ? (serializePostImages(formData.images) as any) : null,
    youtube_url: formData.youtubeUrl || null,
    cta_button_text: formData.ctaButtonText || null,
    cta_button_url: formData.ctaButtonUrl || null,
    status,
    client_id: clientId,
    assignment_ids: assignmentIds.length > 0 ? extractUuidsFromAssignmentIds(assignmentIds) : null,
    social_posts: socialPostsField,
    poll_data: hasPoll && formData.pollData
      ? { 
          question: formData.pollData.question, 
          options: filteredPollOptions,
          crowdsignal_poll_id: formData.pollData.crowdsignalPollId,
          embed_url: formData.pollData.embedUrl,
          js_embed_code: formData.pollData.jsEmbedCode
        }
      : null,
    animated_featured_image: formData.animatedFeaturedImage ? {
      url: formData.animatedFeaturedImage.url,
      fileSize: formData.animatedFeaturedImage.fileSize,
      isAnimated: formData.animatedFeaturedImage.isAnimated,
      isVideo: formData.animatedFeaturedImage.isVideo ?? false
    } : null,
    comments_enabled: formData.commentsEnabled,
    author_bio: formData.authorBio || null,
    author_photo_url: formData.authorPhotoUrl || null,
    sponsor_id: formData.sponsorId || null,
  };
}

/**
 * Validates form data before preview/submission.
 */
export function validateForPreview(formData: PostFormData): { valid: boolean; error?: string } {
  if (!formData.headline.trim()) {
    return { valid: false, error: 'Please enter a headline before previewing' };
  }
  
  if (!formData.content.trim()) {
    return { valid: false, error: 'Please enter content before previewing' };
  }
  
  const hasFeaturedImage = formData.images.some(img => img.isFeatured);
  if (!hasFeaturedImage) {
    return { valid: false, error: 'Please upload and set a featured image before previewing' };
  }

  const sponsorPairing = validateSponsorPairing(formData);
  if (!sponsorPairing.valid) return sponsorPairing;

  return { valid: true };
}

/**
 * Sponsor logo and byline must be provided together (or both empty).
 * Prevents posts publishing with a placeholder "Sponsor" name.
 */
function validateSponsorPairing(formData: PostFormData): { valid: boolean; error?: string } {
  const hasLogo = !!formData.logoUrl;
  const hasByline = !!formData.byline?.trim();
  if (hasLogo === hasByline) return { valid: true };
  return {
    valid: false,
    error: hasLogo
      ? 'Please add an organization name to go with the logo (or remove the logo).'
      : 'Please upload a sponsor logo to go with the organization name (or clear it).',
  };
}

/**
 * Validates form data before submission.
 */
export function validateForSubmit(formData: PostFormData): { valid: boolean; error?: string } {
  const previewValidation = validateForPreview(formData);
  if (!previewValidation.valid) {
    return previewValidation;
  }
  
  return { valid: true };
}

/**
 * Resets form state to initial values.
 */
export function getInitialFormState(): PostFormData {
  return {
    headline: '',
    authorName: '',
    logoUrl: null,
    logoLinkUrl: null,
    byline: '',
    content: '',
    images: [],
    youtubeUrl: '',
    ctaButtonText: '',
    ctaButtonUrl: '',
    commentsEnabled: false,
    animatedFeaturedImage: null,
    socialPosts: [],
    pollData: null,
    authorBio: '',
    authorPhotoUrl: null,
    sponsorId: null,
  };
}

/**
 * Checks if HTML content starts with an image element (figure, img, or p containing only an img).
 * Used to match WordPress theme behavior where the featured image is hidden when content leads with an image.
 */
export function contentStartsWithImage(html: string): boolean {
  if (!html || !html.trim()) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Find the first non-empty child element
  const children = Array.from(doc.body.childNodes);
  for (const node of children) {
    // Skip whitespace-only text nodes
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) continue;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      // Direct <figure> containing an <img>
      if (tag === 'figure' && el.querySelector('img')) return true;

      // Direct <img>
      if (tag === 'img') return true;

      // <p> containing only an <img> (and optional whitespace)
      if (tag === 'p') {
        const img = el.querySelector('img');
        if (img && el.textContent?.trim() === '') return true;
      }
    }

    // If the first meaningful node isn't an image element, stop
    return false;
  }

  return false;
}
