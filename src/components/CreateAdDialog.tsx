import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { normalizeUrl } from '@/lib/urlUtils';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Upload, ImageIcon, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

const AD_DIMENSIONS = {
  billboard: { width: 600, height: 300, label: 'Billboard (600×300)' },
  skyscraper: { width: 300, height: 600, label: 'Skyscraper (300×600)' },
} as const;

type AdType = keyof typeof AD_DIMENSIONS;

// Max file sizes
const MAX_STATIC_SIZE = 10 * 1024 * 1024; // 10MB for PNG/JPG
const MAX_ANIMATED_SIZE = 300 * 1024; // 300KB for GIF/WebP

// Helper to check if file is animated format
const isAnimatedFormat = (file: File): boolean => {
  return file.type === 'image/gif' || file.type === 'image/webp';
};

// Get image dimensions
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
};

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  adType: z.enum(['billboard', 'skyscraper'] as const),
  clickUrl: z.string().transform(normalizeUrl).pipe(z.string().url('Must be a valid URL').min(1, 'Click URL is required')),
  campaignId: z.string().optional(),
  siteId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Campaign {
  id: string;
  name: string;
}

export interface BroadstreetSite {
  id: string;
  name: string;
  billboardZoneId?: number;
  skyscraperZoneId?: number;
  skyscraperAZoneId?: number;
}

interface SelectedCampaign {
  id: string;
  name: string;
  ad_type: string;
  site_id?: string;
  broadstreet_campaign_id?: number;
  organization?: { name: string; client_code: string } | null;
}

interface CreateAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: Campaign[];
  sites: BroadstreetSite[];
  onCreateAd: (data: {
    name: string;
    adType: AdType;
    clickUrl: string;
    imageFile: File;
    campaignId?: string;
    siteId?: string;
  }) => Promise<void>;
  selectedCampaign?: SelectedCampaign | null;
  organizationName?: string | null;
}

function getZoneIdForAdType(
  site: BroadstreetSite,
  adType: AdType
): number | null {
  switch (adType) {
    case 'billboard':
      return site.billboardZoneId ?? null;
    case 'skyscraper':
      return site.skyscraperZoneId ?? null;
  }
}

export function CreateAdDialog({
  open,
  onOpenChange,
  campaigns,
  sites,
  onCreateAd,
  selectedCampaign,
  organizationName,
}: CreateAdDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageValidation, setImageValidation] = useState<{
    isAnimated: boolean;
    dimensions?: { width: number; height: number };
    sizeKB: number;
    valid: boolean;
    error?: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      adType: 'billboard',
      clickUrl: '',
      campaignId: '',
      siteId: '',
    },
  });

  const selectedAdType = form.watch('adType');
  const selectedCampaignId = form.watch('campaignId');
  const selectedSiteId = form.watch('siteId');
  const dimensions = AD_DIMENSIONS[selectedAdType];

  // Get selected site and its zone for the current ad type
  const selectedSite = sites.find(s => s.id === selectedSiteId);
  const zoneId = selectedSite ? getZoneIdForAdType(selectedSite, selectedAdType) : null;
  const showSiteSelector = selectedCampaignId && sites.length > 0;
  const showZoneWarning = selectedSite && !zoneId;

  // Re-validate image when ad type changes
  useEffect(() => {
    if (selectedImage && isAnimatedFormat(selectedImage)) {
      getImageDimensions(selectedImage).then(dims => {
        const isValid = dims.width === dimensions.width && dims.height === dimensions.height;
        setImageValidation({
          isAnimated: true,
          dimensions: dims,
          sizeKB: Math.round(selectedImage.size / 1024),
          valid: isValid,
          error: isValid ? undefined : `Dimensions must be exactly ${dimensions.width}×${dimensions.height}. Your image is ${dims.width}×${dims.height}.`
        });
      });
    }
  }, [selectedAdType, selectedImage, dimensions.width, dimensions.height]);

  // Reset site selection when campaign is cleared
  useEffect(() => {
    if (!selectedCampaignId) {
      form.setValue('siteId', '');
    }
  }, [selectedCampaignId, form]);

  // Auto-populate form when selectedCampaign is provided
  useEffect(() => {
    if (open && selectedCampaign) {
      // Normalize any skyscraper_a to skyscraper for the frontend
      const adType = (selectedCampaign.ad_type === 'skyscraper_a' ? 'skyscraper' : selectedCampaign.ad_type) as AdType;
      const adTypeLabel = adType === 'billboard' ? 'Billboard' : 'Skyscraper';
      const clientName = selectedCampaign.organization?.name || organizationName || 'Ad';
      const timestamp = format(new Date(), 'MMM d, yyyy h:mm a');
      const defaultName = `${clientName} - ${adTypeLabel} - ${timestamp}`;
      
      form.setValue('adType', adType);
      form.setValue('name', defaultName);
      form.setValue('campaignId', selectedCampaign.id);
      if (selectedCampaign.site_id) {
        form.setValue('siteId', selectedCampaign.site_id);
      }
    }
  }, [open, selectedCampaign, organizationName, form]);

  const handleImageSelect = useCallback(async (file: File) => {
    const isAnimated = isAnimatedFormat(file);
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (PNG, JPG, GIF, WebP)',
        variant: 'destructive',
      });
      return;
    }

    // Check file size based on type
    const maxSize = isAnimated ? MAX_ANIMATED_SIZE : MAX_STATIC_SIZE;
    if (file.size > maxSize) {
      const maxSizeLabel = isAnimated ? '300KB' : '10MB';
      toast({
        title: 'File too large',
        description: `${isAnimated ? 'Animated images' : 'Images'} must be less than ${maxSizeLabel}`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // Validate and get dimensions
    const dims = await getImageDimensions(file);
    const sizeKB = Math.round(file.size / 1024);
    
    if (isAnimated) {
      // For animated formats, validate dimensions match exactly
      const adType = form.getValues('adType');
      const requiredDims = AD_DIMENSIONS[adType];
      const isValid = dims.width === requiredDims.width && dims.height === requiredDims.height;
      
      setImageValidation({
        isAnimated: true,
        dimensions: dims,
        sizeKB,
        valid: isValid,
        error: isValid ? undefined : `Dimensions must be exactly ${requiredDims.width}×${requiredDims.height}. Your image is ${dims.width}×${dims.height}.`
      });
    } else {
      // Static images will be resized, so always valid
      setImageValidation({
        isAnimated: false,
        dimensions: dims,
        sizeKB,
        valid: true
      });
    }
  }, [form]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleImageSelect(file);
    }
  }, [handleImageSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageValidation(null);
  }, []);

  const handleSubmit = async (values: FormValues) => {
    if (!selectedImage) {
      toast({
        title: 'Image required',
        description: 'Please upload a creative image for the ad',
        variant: 'destructive',
      });
      return;
    }
    
    // Check if animated image passes validation
    if (imageValidation?.isAnimated && !imageValidation.valid) {
      toast({
        title: 'Invalid image',
        description: imageValidation.error,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // For animated formats, upload directly to Supabase storage
      if (isAnimatedFormat(selectedImage)) {
        const ext = selectedImage.type.split('/')[1];
        const filePath = `display-ads/animated-${Date.now()}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from('editor-images')
          .upload(filePath, selectedImage, { contentType: selectedImage.type });
        
        if (uploadError) {
          throw new Error(`Failed to upload image: ${uploadError.message}`);
        }
        
        const { data: { publicUrl } } = supabase.storage
          .from('editor-images')
          .getPublicUrl(filePath);
        
        // Create a modified file object with the URL for the parent handler
        const imageWithUrl = Object.assign(selectedImage, { 
          __directUrl: publicUrl 
        });
        
        await onCreateAd({
          name: values.name,
          adType: values.adType,
          clickUrl: values.clickUrl,
          imageFile: imageWithUrl,
          campaignId: values.campaignId || undefined,
          siteId: values.siteId || undefined,
        });
      } else {
        // Standard flow for PNG/JPG - will be processed via Cloudinary
        await onCreateAd({
          name: values.name,
          adType: values.adType,
          clickUrl: values.clickUrl,
          imageFile: selectedImage,
          campaignId: values.campaignId || undefined,
          siteId: values.siteId || undefined,
        });
      }
      
      // Reset form on success - hook already shows context-aware toasts
      form.reset();
      clearImage();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating ad:', error);
      toast({
        title: 'Failed to create ad',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      if (!newOpen) {
        form.reset();
        clearImage();
      }
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Display Ad</DialogTitle>
          <DialogDescription>
            Upload a creative and configure your display ad for Broadstreet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Ad Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ad Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Summer Sale Billboard"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ad Type - read-only when selectedCampaign is provided */}
            {selectedCampaign ? (
              <div className="space-y-2">
                <FormLabel>Ad Type</FormLabel>
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/50">
                  <span className="text-sm">
                    {AD_DIMENSIONS[selectedAdType]?.label || selectedAdType}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ad type is determined by the campaign
                </p>
              </div>
            ) : (
              <FormField
                control={form.control}
                name="adType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ad Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select ad type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(AD_DIMENSIONS).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Image Upload */}
            <div className="space-y-2">
              <FormLabel>Creative Image</FormLabel>
              
              {imagePreview ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg border bg-muted overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-auto max-h-48 object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={clearImage}
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-xs">
                      {selectedImage?.name}
                    </div>
                  </div>
                  
                  {/* Image validation feedback */}
                  {imageValidation && (
                    <div className="rounded-md border p-3 text-sm space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Format:</span>
                        <span className="font-medium">
                         {imageValidation.isAnimated 
                            ? 'Animated (GIF/WebP)' 
                            : `Static (${selectedImage?.type === 'image/png' ? 'PNG' : selectedImage?.type === 'image/jpeg' ? 'JPG' : selectedImage?.type?.split('/')[1]?.toUpperCase() || 'IMG'})`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Dimensions:</span>
                        <span className="font-medium">
                          {imageValidation.dimensions?.width}×{imageValidation.dimensions?.height}
                        </span>
                        {imageValidation.isAnimated ? (
                          imageValidation.valid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )
                        ) : (
                          imageValidation.dimensions?.width === dimensions.width && 
                          imageValidation.dimensions?.height === dimensions.height ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <span className="text-xs text-muted-foreground">(will be resized)</span>
                          )
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">File size:</span>
                        <span className="font-medium">{imageValidation.sizeKB} KB</span>
                        {imageValidation.isAnimated && imageValidation.sizeKB <= 300 && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      
                      {imageValidation.error && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{imageValidation.error}</AlertDescription>
                        </Alert>
                      )}
                      
                      {imageValidation.isAnimated && imageValidation.valid && (
                        <Alert className="mt-2 border-green-500/20 bg-green-500/10">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <AlertDescription className="text-green-600">
                            Animated image meets all requirements
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {/* Processing info for static images */}
                      {!imageValidation.isAnimated && (() => {
                        const isExactDimensions = imageValidation.dimensions?.width === dimensions.width && 
                                                   imageValidation.dimensions?.height === dimensions.height;
                        const isSmallFile = (selectedImage?.size || 0) < 60 * 1024; // 60KB
                        
                        if (isExactDimensions && isSmallFile) {
                          return (
                            <div className="flex items-center gap-2 text-green-600 mt-2">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Image is already to spec — no processing needed</span>
                            </div>
                          );
                        } else if (isExactDimensions) {
                          return (
                            <div className="flex items-center gap-2 text-green-600 mt-2">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Image will be optimized for web delivery</span>
                            </div>
                          );
                        } else {
                          return (
                            <div className="flex items-center gap-2 text-muted-foreground mt-2">
                              <Info className="h-4 w-4" />
                              <span className="text-xs">Image will be resized to {dimensions.width}×{dimensions.height} and optimized</span>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors
                    ${isDragging 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-primary/50'
                    }
                  `}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleImageSelect(file);
                    };
                    input.click();
                  }}
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    {isDragging ? (
                      <>
                        <Upload className="h-8 w-8 text-primary" />
                        <p className="text-sm text-primary">Drop image here</p>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="h-8 w-8" />
                        <p className="text-sm">
                          Drag & drop an image or <span className="text-primary underline">browse</span>
                        </p>
                        <p className="text-xs">PNG, JPG up to 10MB • Optimal: {dimensions.width}×{dimensions.height}</p>
                        <p className="text-xs">GIF, WebP must be exactly {dimensions.width}×{dimensions.height} and ≤300KB</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Click URL */}
            <FormField
              control={form.control}
              name="clickUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Click URL</FormLabel>
                  <FormControl>
                    <UrlInput
                      placeholder="https://example.com/landing-page"
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Where users will be directed when they click the ad
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campaign - locked display when pre-selected */}
            {selectedCampaign && (
              <div className="space-y-2">
                <FormLabel>Campaign</FormLabel>
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                  {selectedCampaign.name}
                </div>
                <p className="text-xs text-muted-foreground">
                  Uploading to this campaign
                </p>
              </div>
            )}

            {/* Campaign Selection (optional) - only when no campaign pre-selected */}
            {campaigns.length > 0 && !selectedCampaign && (
              <FormField
                control={form.control}
                name="campaignId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign (Optional)</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={(val) => field.onChange(val === '__none__' ? '' : val)}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a campaign" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">No campaign</SelectItem>
                        {campaigns.map((campaign) => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optionally assign this ad to an existing campaign
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Site Selection - visible when campaign is selected */}
            {showSiteSelector && (
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => {
                  // Lock site selector when campaign has a pre-determined site
                  const isSiteLocked = !!(selectedCampaign?.site_id);
                  const lockedSiteName = isSiteLocked 
                    ? sites.find(s => s.id === selectedCampaign.site_id)?.name 
                    : null;
                  
                  return (
                    <FormItem>
                      <FormLabel>Site for Placement</FormLabel>
                      {isSiteLocked ? (
                        <>
                          <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm">
                            {lockedSiteName || 'Unknown Site'}
                          </div>
                          <FormDescription>
                            Site is determined by the campaign
                          </FormDescription>
                        </>
                      ) : (
                        <>
                          <Select
                            value={field.value || ''}
                            onValueChange={(val) => field.onChange(val === '__none__' ? '' : val)}
                            disabled={isSubmitting}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a site" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No site (skip placement)</SelectItem>
                              {sites.map((site) => (
                                <SelectItem key={site.id} value={site.id}>
                                  {site.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Select a site to automatically create a zone placement
                          </FormDescription>
                        </>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}


            {/* Zone Warning Alert */}
            {showZoneWarning && (
              <Alert variant="destructive" className="border-yellow-500/20 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700">
                  No {selectedAdType.replace('_', ' ')} zone configured for {selectedSite.name}. 
                  The ad will be created but no placement will be made.
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !selectedImage || (imageValidation?.isAnimated && !imageValidation.valid)}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Ad
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
