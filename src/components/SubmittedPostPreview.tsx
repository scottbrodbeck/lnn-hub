import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ExternalLink, Calendar, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { normalizeInlineImageHtml } from '@/lib/normalizeInlineImageHtml';
import { contentStartsWithImage } from '@/lib/postUtils';
import { useAuth } from '@/contexts/AuthContext';
import { AllFieldsPanel } from './admin/AllFieldsPanel';

interface SubmittedPostPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
}

export function SubmittedPostPreview({ open, onOpenChange, postId }: SubmittedPostPreviewProps) {
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();
  const isAdmin = role === 'admin' || role === 'super_admin';

  useEffect(() => {
    if (open && postId) {
      fetchPost();
    }
  }, [open, postId]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .maybeSingle();

      if (error) throw error;
      setPost(data);
    } catch (error) {
      console.error('Error fetching post:', error);
    } finally {
      setLoading(false);
    }
  };

  const getYouTubeId = (url: string): string | null => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const getFeaturedImageUrl = (): string | null => {
    if (!post?.featured_image_url) return null;
    const featured = post.featured_image_url;

    if (typeof featured === 'string') {
      if (featured.startsWith('{')) {
        try {
          const parsed = JSON.parse(featured);
          return parsed.processedUrl || parsed.originalUrl || parsed.url || null;
        } catch {
          return featured;
        }
      }
      return featured;
    }

    if (typeof featured === 'object') {
      return featured.processedUrl || featured.originalUrl || featured.url || null;
    }

    return null;
  };

  const videoId = post?.youtube_url ? getYouTubeId(post.youtube_url) : null;

  const getAnimatedFeaturedImageUrl = (): string | null => {
    const animated = post?.animated_featured_image;
    if (!animated) return null;
    if (typeof animated === 'object' && animated.url) return animated.url;
    return null;
  };

  const getFeaturedImage = () => {
    if (!post) return null;

    const featuredUrl = getFeaturedImageUrl();
    const galleryImages = Array.isArray(post.gallery_images) ? post.gallery_images : [];
    const featuredFromGallery = galleryImages.find((image: any) => {
      if (typeof image === 'object' && image !== null) {
        const imageUrl = image.processedUrl || image.originalUrl || image.url;
        return image.isFeatured || (!!featuredUrl && imageUrl === featuredUrl);
      }
      return false;
    });

    if (featuredFromGallery) return featuredFromGallery;
    if (!featuredUrl) return null;

    return {
      processedUrl: featuredUrl,
      originalUrl: featuredUrl,
      caption: undefined,
    };
  };

  const featuredImage = getFeaturedImage();
  const animatedFeaturedImageUrl = getAnimatedFeaturedImageUrl();

  const getGalleryImages = (): any[] => {
    if (!post?.gallery_images || !Array.isArray(post.gallery_images)) return [];

    const featuredUrl = getFeaturedImageUrl();
    return post.gallery_images.filter((image: any) => {
      if (typeof image === 'object' && image !== null) {
        if (image.isFeatured) return false;
        const imageUrl = image.processedUrl || image.originalUrl || image.url;
        if (imageUrl && featuredUrl && imageUrl === featuredUrl) return false;
      }
      if (typeof image === 'string' && featuredUrl && image === featuredUrl) {
        return false;
      }
      return true;
    });
  };

  const galleryImages = getGalleryImages();
  const normalizedPostContent = normalizeInlineImageHtml(post?.content || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submitted Post</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !post ? (
          <div className="text-center py-8 text-muted-foreground">
            Post not found
          </div>
        ) : (() => {
          const previewBody = (
          <div className="space-y-6">
            {/* Status badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Submitted {post.submitted_at ? format(parseISO(post.submitted_at), 'MMM d, yyyy') : 'N/A'}
              </Badge>
              {post.status === 'published' && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Published
                </Badge>
              )}
            </div>

            {/* Logo */}
            {post.logo_url && (
              <div className="flex items-center gap-4">
                {post.logo_link_url ? (
                  <a href={post.logo_link_url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={post.logo_url}
                      alt="Logo"
                      className="h-16 w-auto max-w-[240px] object-contain rounded hover:opacity-80 transition-opacity"
                    />
                  </a>
                ) : (
                  <img
                    src={post.logo_url}
                    alt="Logo"
                    className="h-16 w-auto max-w-[240px] object-contain rounded"
                  />
                )}
                {post.logo_author_name && (
                  <p className="text-sm text-muted-foreground">A post from {post.logo_author_name}</p>
                )}
              </div>
            )}

            {/* Headline */}
            <h1 className="text-3xl font-bold text-foreground">{post.headline}</h1>

            {/* Animated featured image or static featured image */}
            {/* Skip featured image when content starts with an image (matches WP theme behavior) */}
            {!contentStartsWithImage(post?.content || '') && (
              <>
                {animatedFeaturedImageUrl ? (
                  <div className="rounded-lg overflow-hidden bg-muted">
                    {animatedFeaturedImageUrl.includes('.mp4') || animatedFeaturedImageUrl.includes('.webm') ? (
                      <video
                        src={animatedFeaturedImageUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-auto"
                      />
                    ) : (
                      <img
                        src={animatedFeaturedImageUrl}
                        alt="Featured"
                        className="w-full h-auto"
                      />
                    )}
                  </div>
                ) : featuredImage ? (
                  <div className="space-y-2">
                    <div className="rounded-lg overflow-hidden bg-muted">
                      <img
                        src={featuredImage.processedUrl || featuredImage.originalUrl || featuredImage.url}
                        alt={featuredImage.caption || 'Featured'}
                        className="w-full h-auto"
                      />
                    </div>
                    {featuredImage.caption && (
                      <p className="text-sm text-muted-foreground italic">{featuredImage.caption}</p>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {/* Gallery images - only show non-featured images */}
            {galleryImages.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {galleryImages.map((image: any, index: number) => (
                  <div key={index} className="text-center">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={typeof image === 'string' ? image : (image.processedUrl || image.originalUrl || image.url)}
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

            {/* Content */}
            <div 
              className="prose prose-sm sm:prose lg:prose-lg max-w-none [&_figure]:mx-0 [&_figure]:my-6 [&_figure_img]:my-0 [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:italic [&_figcaption]:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: normalizedPostContent }}
            />

            {/* YouTube embed */}
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

            {/* Poll embed */}
            {post.poll_embed_url && (
              <div className="pt-8 pb-8 border-t border-border">
                <h4 className="text-sm font-medium mb-3">Poll</h4>
                <iframe 
                  src={`${post.poll_embed_url}/embed`}
                  width="100%" 
                  height="400" 
                  frameBorder="0"
                  className="rounded-lg border border-border"
                  title="Poll"
                />
              </div>
            )}

            {/* CTA Button */}
            {post.cta_button_text && post.cta_button_url && (
              <div className="pt-8 pb-8 border-t border-border">
                <div className="flex justify-center">
                  <a
                    href={post.cta_button_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:shadow-md"
                  >
                    {post.cta_button_text}
                  </a>
                </div>
              </div>
            )}

            {/* About the Author section */}
            {(post.author_name || post.author_bio || post.author_photo_url) && (
              <div className="pt-8 pb-4 border-t border-border">
                <h3 className="text-2xl font-bold text-foreground mb-4">About the Author</h3>
                <div className="border border-border rounded-lg p-6">
                  <div className="flex gap-6">
                    {post.author_photo_url && (
                      <div className="shrink-0">
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-muted">
                          <img
                            src={post.author_photo_url}
                            alt={post.author_name || 'Author'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      {post.author_name && (
                        <h4 className="text-xl font-semibold text-foreground underline underline-offset-4 mb-3">
                          {post.author_name}
                        </h4>
                      )}
                      {post.author_bio && (
                        <p className="text-muted-foreground leading-relaxed">
                          {post.author_bio}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* WordPress URL */}
            {post.wordpress_post_url && (
              <div className="pt-4 border-t border-border">
                <a
                  href={post.wordpress_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View on WordPress
                </a>
              </div>
            )}
          </div>
          );

          if (!isAdmin) return previewBody;

          return (
            <Tabs defaultValue="preview" className="w-full">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="all">All fields</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="mt-4">
                {previewBody}
              </TabsContent>
              <TabsContent value="all" className="mt-4">
                <AllFieldsPanel
                  row={post}
                  fkColumns={{
                    client_id: 'user',
                    sponsor_id: 'sponsor',
                    wordpress_site_id: 'site',
                  }}
                />
              </TabsContent>
            </Tabs>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
