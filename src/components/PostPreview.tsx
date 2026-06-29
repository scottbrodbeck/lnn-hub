import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ProcessedImage } from './ImageUpload';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { SocialPost, contentStartsWithImage } from '@/lib/postUtils';
import { normalizeInlineImageHtml } from '@/lib/normalizeInlineImageHtml';
import { SocialPostSelector } from './SocialPostSelector';

interface AnimatedImage {
  url: string;
  fileSize: number;
  isAnimated: boolean;
  isVideo?: boolean;
}

interface PostPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headline: string;
  authorName: string;
  logoUrl: string | null;
  logoLinkUrl?: string | null;
  logoAuthorName?: string;
  content: string;
  images: ProcessedImage[];
  youtubeUrl: string;
  onSubmit: () => void;
  availableAssignments?: any[];
  selectedAssignments?: string[];
  onSelectedAssignmentsChange?: (ids: string[]) => void;
  ctaButtonText?: string;
  ctaButtonUrl?: string;
  siteName?: string;
  selectedSocialPosts?: SocialPost[];
  onSocialPostsChange?: (posts: SocialPost[]) => void;
  pollEmbedCode?: string | null;
  pollEmbedUrl?: string | null;
  submitButtonText?: string;
  submitButtonDisabled?: boolean;
  animatedFeaturedImage?: AnimatedImage | null;
  authorBio?: string;
  authorPhotoUrl?: string | null;
}

export const PostPreview = ({
  open,
  onOpenChange,
  headline,
  authorName,
  logoUrl,
  logoLinkUrl,
  logoAuthorName,
  content,
  images,
  youtubeUrl,
  onSubmit,
  availableAssignments = [],
  selectedAssignments = [],
  onSelectedAssignmentsChange,
  ctaButtonText = '',
  ctaButtonUrl = '',
  siteName,
  selectedSocialPosts = [],
  onSocialPostsChange,
  pollEmbedCode = null,
  pollEmbedUrl = null,
  submitButtonText = 'Submit for Publication',
  submitButtonDisabled = false,
  animatedFeaturedImage = null,
  authorBio = '',
  authorPhotoUrl = null,
}: PostPreviewProps) => {
  const [liveSocialPosts, setLiveSocialPosts] = useState<SocialPost[]>(selectedSocialPosts);

  const handleSocialPostsChange = (posts: SocialPost[]) => {
    setLiveSocialPosts(posts);
    if (onSocialPostsChange) {
      onSocialPostsChange(posts);
    }
  };

  const handleSubmitWithSocialPosts = () => {
    onSubmit();
  };
  const featuredImage = images.find(img => img.isFeatured);
  const galleryImages = images.filter(img => !img.isFeatured || images.length > 1);
  
  const getYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const videoId = getYouTubeId(youtubeUrl);
  const normalizedContent = normalizeInlineImageHtml(content);

  // Split content into paragraphs for gallery insertion when animated image exists
  const renderContentWithGallery = () => {
    if (!animatedFeaturedImage || images.length <= 1) {
      // Normal rendering - no gallery repositioning needed
      return (
        <>
          <div 
            className="prose prose-sm sm:prose lg:prose-lg max-w-none [&_figure]:mx-0 [&_figure]:my-6 [&_figure_img]:my-0 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:italic [&_figcaption]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: normalizedContent }}
          />
        </>
      );
    }

    // Split content after 3rd paragraph and insert gallery
    const parser = new DOMParser();
    const doc = parser.parseFromString(normalizedContent, 'text/html');
    const elements = Array.from(doc.body.children);
    
    let paragraphCount = 0;
    let splitIndex = elements.length;
    
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].tagName === 'P') {
        paragraphCount++;
        if (paragraphCount === 3) {
          splitIndex = i + 1;
          break;
        }
      }
    }

    const beforeGallery = elements.slice(0, splitIndex).map(el => el.outerHTML).join('');
    const afterGallery = elements.slice(splitIndex).map(el => el.outerHTML).join('');

    return (
      <>
        <div 
          className="prose prose-sm sm:prose lg:prose-lg max-w-none [&_figure]:mx-0 [&_figure]:my-6 [&_figure_img]:my-0 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:italic [&_figcaption]:text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: beforeGallery }}
        />
        
        {/* Gallery (including still featured) inserted after 3rd paragraph */}
        {images.length > 0 && (
          <div className="my-6 grid grid-cols-3 gap-4">
            {images.map((image, index) => (
              <div key={index} className="text-center">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={image.originalUrl}
                    alt={image.caption || `Gallery ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                {image.caption && (
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    {image.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        
        {afterGallery && (
          <div 
            className="prose prose-sm sm:prose lg:prose-lg max-w-none [&_figure]:mx-0 [&_figure]:my-6 [&_figure_img]:my-0 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:italic [&_figcaption]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: afterGallery }}
          />
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post Preview</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {logoUrl && (
            <div className="flex items-center gap-4 mb-4">
              {logoLinkUrl ? (
                <a href={logoLinkUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-16 w-auto max-w-[240px] object-contain rounded hover:opacity-80 transition-opacity"
                  />
                </a>
              ) : (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-16 w-auto max-w-[240px] object-contain rounded"
                />
              )}
              {logoAuthorName && (
                <p className="text-sm text-muted-foreground">A post from {logoAuthorName}</p>
              )}
            </div>
          )}

          {/* Headline */}
          <h1 className="text-3xl font-bold text-foreground">{headline}</h1>

          {/* Show animated image/video if exists, otherwise show still featured image */}
          {/* Skip featured image when content starts with an image (matches WP theme behavior) */}
          {!contentStartsWithImage(normalizedContent) && (
            <>
              {animatedFeaturedImage ? (
                <div className="rounded-lg overflow-hidden bg-muted">
                  {animatedFeaturedImage.isVideo ? (
                    <video
                      src={animatedFeaturedImage.url}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-auto"
                    />
                  ) : (
                    <img
                      src={animatedFeaturedImage.url}
                      alt="Animated Featured"
                      className="w-full h-auto"
                    />
                  )}
                </div>
              ) : featuredImage && (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden bg-muted">
                    <img
                      src={featuredImage.originalUrl}
                      alt={featuredImage.caption || 'Featured'}
                      className="w-full h-auto"
                    />
                  </div>
                  {featuredImage.caption && (
                    <p className="text-sm text-muted-foreground italic">{featuredImage.caption}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Gallery - only show here if NO animated image */}
          {!animatedFeaturedImage && images.length > 1 && (
            <div className="grid grid-cols-3 gap-4">
              {images.map((image, index) => (
                <div key={index} className="text-center">
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={image.originalUrl}
                      alt={image.caption || `Gallery ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {image.caption && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      {image.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Content - with or without embedded gallery */}
          {renderContentWithGallery()}

          {videoId && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {pollEmbedUrl && (
            <div className="pt-8 pb-8 border-t border-border">
              <h4 className="text-sm font-medium mb-3">Poll</h4>
              <iframe 
                src={`${pollEmbedUrl}/embed`}
                width="100%" 
                height="400" 
                frameBorder="0"
                className="rounded-lg border border-border"
                title="Poll"
              />
            </div>
          )}

          {ctaButtonText && ctaButtonUrl && (
            <div className="pt-8 pb-8 border-t border-border">
              <div className="flex justify-center">
                <a
                  href={ctaButtonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:shadow-md"
                >
                  {ctaButtonText}
                </a>
              </div>
            </div>
          )}

          {/* About the Author section */}
          {(authorName || authorBio || authorPhotoUrl) && (
            <div className="pt-8 pb-4 border-t border-border">
              <h3 className="text-2xl font-bold text-foreground mb-4">About the Author</h3>
              <div className="border border-border rounded-lg p-6">
                <div className="flex gap-6">
                  {authorPhotoUrl && (
                    <div className="shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-muted">
                        <img
                          src={authorPhotoUrl}
                          alt={authorName || 'Author'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex-1">
                    {authorName && (
                      <h4 className="text-xl font-semibold text-foreground underline underline-offset-4 mb-3">
                        {authorName}
                      </h4>
                    )}
                    {authorBio && (
                      <p className="text-muted-foreground leading-relaxed">
                        {authorBio}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Social Media Posts Section */}
          <SocialPostSelector
            headline={headline}
            content={content}
            siteName={siteName}
            selectedSocialPosts={liveSocialPosts}
            onSocialPostsChange={handleSocialPostsChange}
          />

          {/* Read-only Assignment Confirmation */}
          {selectedAssignments.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Submitting to:
              </h3>
              <div className="flex flex-wrap gap-2">
                {availableAssignments
                  .filter(a => selectedAssignments.includes(a.id))
                  .map(a => {
                    const hasDueDate = a.due_date && a.due_date !== 'TBD';
                    const dueDate = hasDueDate 
                      ? (a.instanceDate || parseISO(a.due_date))
                      : null;
                    return (
                      <Badge key={a.id} variant="secondary" className="text-sm py-1 px-3">
                        {a.assignment_name} — {dueDate ? format(dueDate, 'MMM d') : 'Date TBD'}
                      </Badge>
                    );
                  })
                }
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleSubmitWithSocialPosts} 
              className="flex-1"
              disabled={submitButtonDisabled || liveSocialPosts.length !== 2}
            >
              {submitButtonDisabled && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitButtonText}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1"
              disabled={submitButtonDisabled}
            >
              Continue Editing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
