import { useState, useCallback } from 'react';
import { ProcessedImage } from '@/components/ImageUpload';
import { AnimatedImage } from '@/components/AnimatedImageUpload';
import { PostFormData, SocialPost, PollData } from '@/lib/postUtils';
import { normalizePostImages } from '@/lib/postImageUtils';

export interface OpenSections {
  logo: boolean;
  youtube: boolean;
  cta: boolean;
  poll: boolean;
  animatedImage: boolean;
  comments: boolean;
  authorBio: boolean;
  assignmentSection?: boolean;
}

export interface PostFormState {
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
  selectedSocialPosts: SocialPost[];
  authorBio: string;
  authorPhotoUrl: string | null;
  sponsorId: string | null;
}

const initialFormState: PostFormState = {
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
  selectedSocialPosts: [],
  authorBio: '',
  authorPhotoUrl: null,
  sponsorId: null,
};

const initialOpenSections: OpenSections = {
  logo: false,
  youtube: false,
  cta: false,
  poll: false,
  animatedImage: false,
  comments: false,
  authorBio: false,
  assignmentSection: false,
};

export interface UsePostFormStateReturn {
  // Form state
  formState: PostFormState;
  openSections: OpenSections;
  
  // Individual setters
  setHeadline: (value: string) => void;
  setAuthorName: (value: string) => void;
  setLogoUrl: (value: string | null) => void;
  setLogoLinkUrl: (value: string | null) => void;
  setByline: (value: string) => void;
  setContent: (value: string) => void;
  setImages: (value: ProcessedImage[] | ((prev: ProcessedImage[]) => ProcessedImage[])) => void;
  setYoutubeUrl: (value: string) => void;
  setCtaButtonText: (value: string) => void;
  setCtaButtonUrl: (value: string) => void;
  setCommentsEnabled: (value: boolean) => void;
  setAnimatedFeaturedImage: (value: AnimatedImage | null) => void;
  setSelectedSocialPosts: (value: SocialPost[] | ((prev: SocialPost[]) => SocialPost[])) => void;
  setAuthorBio: (value: string) => void;
  setAuthorPhotoUrl: (value: string | null) => void;
  setSponsorId: (value: string | null) => void;
  setOpenSections: (value: OpenSections | ((prev: OpenSections) => OpenSections)) => void;
  
  // Utility methods
  resetForm: () => void;
  toPostFormData: (pollData: PollData | null) => PostFormData;
  loadFromDraft: (draft: DraftData) => void;
  autoExpandSections: () => void;
  setFormState: (state: Partial<PostFormState>) => void;
}

export interface DraftData {
  headline: string;
  author_name?: string | null;
  logo_url?: string | null;
  logo_link_url?: string | null;
  byline?: string | null;
  content: string;
  featured_image_id?: string | null;
  featured_image_url?: any;
  gallery_images?: any[] | null;
  youtube_url?: string | null;
  cta_button_text?: string | null;
  cta_button_url?: string | null;
  comments_enabled?: boolean;
  animated_featured_image?: {
    url?: string;
    fileSize?: number;
    isAnimated?: boolean;
    isVideo?: boolean;
  } | null;
  author_bio?: string | null;
  author_photo_url?: string | null;
}

export function usePostFormState(): UsePostFormStateReturn {
  const [formState, setFormStateInternal] = useState<PostFormState>(initialFormState);
  const [openSections, setOpenSections] = useState<OpenSections>(initialOpenSections);

  // Individual setters
  const setHeadline = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, headline: value }));
  }, []);

  const setAuthorName = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, authorName: value }));
  }, []);

  const setLogoUrl = useCallback((value: string | null) => {
    setFormStateInternal(prev => ({ ...prev, logoUrl: value }));
  }, []);

  const setLogoLinkUrl = useCallback((value: string | null) => {
    setFormStateInternal(prev => ({ ...prev, logoLinkUrl: value }));
  }, []);

  const setByline = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, byline: value }));
  }, []);

  const setContent = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, content: value }));
  }, []);

  const setImages = useCallback((value: ProcessedImage[] | ((prev: ProcessedImage[]) => ProcessedImage[])) => {
    setFormStateInternal(prev => ({
      ...prev,
      images: typeof value === 'function' ? value(prev.images) : value
    }));
  }, []);

  const setYoutubeUrl = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, youtubeUrl: value }));
  }, []);

  const setCtaButtonText = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, ctaButtonText: value }));
  }, []);

  const setCtaButtonUrl = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, ctaButtonUrl: value }));
  }, []);

  const setCommentsEnabled = useCallback((value: boolean) => {
    setFormStateInternal(prev => ({ ...prev, commentsEnabled: value }));
  }, []);

  const setAnimatedFeaturedImage = useCallback((value: AnimatedImage | null) => {
    setFormStateInternal(prev => ({ ...prev, animatedFeaturedImage: value }));
  }, []);

  const setSelectedSocialPosts = useCallback((value: SocialPost[] | ((prev: SocialPost[]) => SocialPost[])) => {
    setFormStateInternal(prev => ({
      ...prev,
      selectedSocialPosts: typeof value === 'function' ? value(prev.selectedSocialPosts) : value
    }));
  }, []);

  const setAuthorBio = useCallback((value: string) => {
    setFormStateInternal(prev => ({ ...prev, authorBio: value }));
  }, []);

  const setAuthorPhotoUrl = useCallback((value: string | null) => {
    setFormStateInternal(prev => ({ ...prev, authorPhotoUrl: value }));
  }, []);

  const setSponsorId = useCallback((value: string | null) => {
    setFormStateInternal(prev => ({ ...prev, sponsorId: value }));
  }, []);

  const setFormState = useCallback((state: Partial<PostFormState>) => {
    setFormStateInternal(prev => ({ ...prev, ...state }));
  }, []);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setFormStateInternal(initialFormState);
    setOpenSections(initialOpenSections);
  }, []);

  // Convert form state to PostFormData for buildPostData utility
  const toPostFormData = useCallback((pollData: PollData | null): PostFormData => {
    return {
      headline: formState.headline,
      authorName: formState.authorName,
      logoUrl: formState.logoUrl,
      logoLinkUrl: formState.logoLinkUrl,
      byline: formState.byline,
      content: formState.content,
      images: formState.images,
      youtubeUrl: formState.youtubeUrl,
      ctaButtonText: formState.ctaButtonText,
      ctaButtonUrl: formState.ctaButtonUrl,
      commentsEnabled: formState.commentsEnabled,
      animatedFeaturedImage: formState.animatedFeaturedImage,
      socialPosts: formState.selectedSocialPosts,
      pollData,
      authorBio: formState.authorBio,
      authorPhotoUrl: formState.authorPhotoUrl,
      sponsorId: formState.sponsorId,
    };
  }, [formState]);

  // Load state from draft data
  const loadFromDraft = useCallback((draft: DraftData) => {
    const newState: PostFormState = {
      headline: draft.headline,
      authorName: draft.author_name || '',
      logoUrl: draft.logo_url || null,
      logoLinkUrl: draft.logo_link_url || null,
      byline: draft.byline || '',
      content: draft.content,
      images: normalizePostImages(
        draft.featured_image_url as any,
        (draft.gallery_images as any[] | null) || null,
        draft.featured_image_id || null,
      ),
      youtubeUrl: draft.youtube_url || '',
      ctaButtonText: draft.cta_button_text || '',
      ctaButtonUrl: draft.cta_button_url || '',
      commentsEnabled: draft.comments_enabled ?? false,
      animatedFeaturedImage: draft.animated_featured_image?.url ? {
        url: draft.animated_featured_image.url,
        fileSize: draft.animated_featured_image.fileSize || 0,
        isAnimated: draft.animated_featured_image.isAnimated ?? true,
        isVideo: draft.animated_featured_image.isVideo ?? false,
      } : null,
      selectedSocialPosts: [],
      authorBio: draft.author_bio || '',
      authorPhotoUrl: draft.author_photo_url || null,
      sponsorId: null,
    };
    
    setFormStateInternal(newState);
    
    // Auto-expand sections based on content
    setOpenSections({
      logo: !!(newState.logoUrl || newState.byline || newState.images.length > 0),
      youtube: !!newState.youtubeUrl,
      cta: !!(newState.ctaButtonText || newState.ctaButtonUrl),
      poll: false,
      animatedImage: !!newState.animatedFeaturedImage,
      comments: newState.commentsEnabled,
      authorBio: !!(newState.authorName || newState.authorBio || newState.authorPhotoUrl),
      assignmentSection: false,
    });
  }, []);

  // Auto-expand sections based on current form state
  const autoExpandSections = useCallback(() => {
    setOpenSections({
      logo: !!(formState.logoUrl || formState.byline || formState.images.length > 0),
      youtube: !!formState.youtubeUrl,
      cta: !!(formState.ctaButtonText || formState.ctaButtonUrl),
      poll: false,
      animatedImage: !!formState.animatedFeaturedImage,
      comments: formState.commentsEnabled,
      authorBio: !!(formState.authorName || formState.authorBio || formState.authorPhotoUrl),
      assignmentSection: false,
    });
  }, [formState]);

  return {
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
    loadFromDraft,
    autoExpandSections,
    setFormState,
  };
}
