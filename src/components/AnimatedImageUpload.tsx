import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Film, X, AlertTriangle, Info, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface AnimatedImage {
  url: string;
  fileSize: number;
  isAnimated: boolean;
  wasOptimized?: boolean;
  originalFileSize?: number;
  isVideo?: boolean;
}

interface AnimatedImageUploadProps {
  animatedImage: AnimatedImage | null;
  onAnimatedImageChange: (image: AnimatedImage | null) => void;
}

// Check if a GIF is animated (has multiple frames)
function isAnimatedGif(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  let frames = 0;
  for (let i = 0; i < view.length - 2; i++) {
    // Look for graphic control extension (0x21 0xF9)
    if (view[i] === 0x21 && view[i + 1] === 0xF9) {
      frames++;
      if (frames > 1) return true;
    }
  }
  return false;
}

// Check if a WebP is animated (has ANIM chunk)
function isAnimatedWebp(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  // Look for "ANIM" in the first ~100 bytes
  const decoder = new TextDecoder();
  const header = decoder.decode(view.slice(0, 100));
  return header.includes('ANIM');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export const AnimatedImageUpload = ({
  animatedImage,
  onAnimatedImageChange,
}: AnimatedImageUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  const [animationWarning, setAnimationWarning] = useState<string | null>(null);
  const [optimizationSuccess, setOptimizationSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // Reset states
    setSizeWarning(null);
    setAnimationWarning(null);
    setOptimizationSuccess(null);

    // Validate file type
    const validTypes = ['image/gif', 'image/webp', 'video/mp4'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a GIF, WebP, or MP4 file');
      return;
    }

    const isVideo = file.type === 'video/mp4';

    // Check file size - hard limit 10MB
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }

    // Check if file is actually animated (for images only - videos are inherently animated)
    let isAnimated = isVideo; // Videos are always considered animated
    
    if (!isVideo) {
      const arrayBuffer = await file.arrayBuffer();
      if (file.type === 'image/gif') {
        isAnimated = isAnimatedGif(arrayBuffer);
      } else if (file.type === 'image/webp') {
        isAnimated = isAnimatedWebp(arrayBuffer);
      }

      if (!isAnimated) {
        setAnimationWarning('No animation detected in this file, but you can still proceed.');
      }
    }

    // Upload to Supabase storage
    setIsUploading(true);
    setUploadStatus('Uploading...');
    
    try {
      const fileExt = isVideo ? 'mp4' : (file.type === 'image/gif' ? 'gif' : 'webp');
      const fileName = `animated-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `animated/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('editor-images')
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('editor-images')
        .getPublicUrl(filePath);

      // Handle video optimization - always optimize MP4s
      if (isVideo) {
        setUploadStatus('Optimizing video...');
        
        try {
          const { data: optimizationResult, error: optimizeError } = await supabase.functions.invoke(
            'optimize-video',
            {
              body: {
                originalUrl: publicUrl,
                originalSize: file.size,
              },
            }
          );

          if (optimizeError) throw optimizeError;

          if (optimizationResult.wasOptimized && optimizationResult.url) {
            // Delete original from storage since we're using optimized Cloudinary URL
            await supabase.storage.from('editor-images').remove([filePath]);
            
            setOptimizationSuccess(
              `Optimized from ${formatFileSize(file.size)} to ${formatFileSize(optimizationResult.fileSize)}`
            );

            // Show warning if final size is still >500KB
            if (optimizationResult.fileSize > 500 * 1024) {
              setSizeWarning(`Video is still large (${formatFileSize(optimizationResult.fileSize)}) after optimization.`);
            }

            onAnimatedImageChange({
              url: optimizationResult.url,
              fileSize: optimizationResult.fileSize,
              isAnimated: true,
              wasOptimized: true,
              originalFileSize: file.size,
              isVideo: true,
            });

            toast.success('Video optimized and uploaded');
          } else {
            // Optimization failed, keep original but warn
            setSizeWarning(`Video optimization failed. Using original (${formatFileSize(file.size)}).`);
            
            onAnimatedImageChange({
              url: publicUrl,
              fileSize: file.size,
              isAnimated: true,
              wasOptimized: false,
              isVideo: true,
            });

            toast.success('Video uploaded');
          }
        } catch (optimizeError: any) {
          console.error('Video optimization error:', optimizeError);
          // Optimization failed, use original
          if (file.size > 500 * 1024) {
            setSizeWarning(`Video is large (${formatFileSize(file.size)}). Optimization failed.`);
          }
          
          onAnimatedImageChange({
            url: publicUrl,
            fileSize: file.size,
            isAnimated: true,
            wasOptimized: false,
            isVideo: true,
          });

          toast.success('Video uploaded (optimization unavailable)');
        }
      }
      // Handle image optimization (>500KB AND animated)
      else if (file.size > 500 * 1024 && isAnimated) {
        setUploadStatus('Optimizing...');
        
        try {
          const { data: optimizationResult, error: optimizeError } = await supabase.functions.invoke(
            'optimize-animated-image',
            {
              body: {
                originalUrl: publicUrl,
                originalSize: file.size,
              },
            }
          );

          if (optimizeError) throw optimizeError;

          if (optimizationResult.wasOptimized) {
            // Delete original from storage since we're using optimized Cloudinary URL
            await supabase.storage.from('editor-images').remove([filePath]);
            
            setOptimizationSuccess(
              `Optimized from ${formatFileSize(file.size)} to ${formatFileSize(optimizationResult.fileSize)}`
            );

            // Show warning only if final size is still >500KB
            if (optimizationResult.fileSize > 500 * 1024) {
              setSizeWarning(`Animation is still large (${formatFileSize(optimizationResult.fileSize)}) after optimization.`);
            }

            onAnimatedImageChange({
              url: optimizationResult.url,
              fileSize: optimizationResult.fileSize,
              isAnimated,
              wasOptimized: true,
              originalFileSize: file.size,
              isVideo: false,
            });

            toast.success('Animated image optimized and uploaded');
          } else {
            // Optimization didn't help, use original
            setSizeWarning(`Animation is large (${formatFileSize(file.size)}). Optimization was attempted but didn't reduce size enough.`);
            
            onAnimatedImageChange({
              url: publicUrl,
              fileSize: file.size,
              isAnimated,
              wasOptimized: false,
              isVideo: false,
            });

            toast.success('Animated image uploaded');
          }
        } catch (optimizeError: any) {
          console.error('Optimization error:', optimizeError);
          // Optimization failed, use original
          setSizeWarning(`Animation is large (${formatFileSize(file.size)}). Optimization failed.`);
          
          onAnimatedImageChange({
            url: publicUrl,
            fileSize: file.size,
            isAnimated,
            wasOptimized: false,
            isVideo: false,
          });

          toast.success('Animated image uploaded (optimization unavailable)');
        }
      } else {
        // No optimization needed
        if (file.size > 500 * 1024) {
          // Large but not animated - show warning
          setSizeWarning(`File is large (${formatFileSize(file.size)}).`);
        }

        onAnimatedImageChange({
          url: publicUrl,
          fileSize: file.size,
          isAnimated,
          wasOptimized: false,
          isVideo: false,
        });

        toast.success('Animated image uploaded');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadStatus('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = () => {
    onAnimatedImageChange(null);
    setSizeWarning(null);
    setAnimationWarning(null);
    setOptimizationSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload an animated GIF, WebP, or MP4 video to display instead of your still featured image.
      </p>

      {!animatedImage ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
            transition-colors
            ${dragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50 hover:bg-accent/50'
            }
            ${isUploading ? 'pointer-events-none opacity-70' : ''}
          `}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gif,.webp,.mp4,image/gif,image/webp,video/mp4"
            onChange={handleInputChange}
            className="hidden"
            disabled={isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{uploadStatus}</p>
            </div>
          ) : (
            <>
              <Film className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Drag & drop animated GIF, WebP, or MP4 here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Maximum file size: 10MB • Files will be automatically optimized
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Preview */}
          <div className="relative rounded-lg overflow-hidden bg-muted border border-border">
            {animatedImage.isVideo ? (
              <video
                src={animatedImage.url}
                autoPlay
                loop
                muted
                playsInline
                className="w-full max-h-64 object-contain"
              />
            ) : (
              <img
                src={animatedImage.url}
                alt="Animated preview"
                className="w-full max-h-64 object-contain"
              />
            )}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* File info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              File size: <span className="font-medium text-foreground">{formatFileSize(animatedImage.fileSize)}</span>
              {animatedImage.wasOptimized && animatedImage.originalFileSize && (
                <span className="text-muted-foreground ml-1">
                  (was {formatFileSize(animatedImage.originalFileSize)})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {animatedImage.isVideo && (
                <span className="text-blue-600 dark:text-blue-500 text-xs font-medium">
                  MP4
                </span>
              )}
              {animatedImage.wasOptimized && (
                <span className="text-green-600 dark:text-green-500 text-xs font-medium">
                  Optimized
                </span>
              )}
              {!animatedImage.isAnimated && !animatedImage.isVideo && (
                <span className="text-amber-600 dark:text-amber-500 text-xs">
                  Not animated
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Optimization success message */}
      {optimizationSuccess && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">
            {optimizationSuccess}
          </p>
        </div>
      )}

      {/* Warnings */}
      {sizeWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {sizeWarning}
          </p>
        </div>
      )}

      {animationWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-500 mt-0.5 shrink-0" />
          <p className="text-sm text-orange-700 dark:text-orange-400">
            {animationWarning}
          </p>
        </div>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          This will display in place of your still featured image at the top of the post.
          A still featured image is still required.
        </p>
      </div>
    </div>
  );
};
