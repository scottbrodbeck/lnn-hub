import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { UrlInput } from '@/components/ui/url-input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ImageIcon, AlertCircle, ExternalLink, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Advertisement {
  id: string;
  name: string;
  type: 'billboard' | 'skyscraper';
  imageUrl: string;
  width: number;
  height: number;
  createdAt?: string;
  clickUrl?: string;
}

interface AddExistingAdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: {
    id: string;
    broadstreet_campaign_id: number;
    broadstreet_advertiser_id: number;
    name: string;
    ad_type: string;
    site_id: string;
  } | null;
  onSuccess: () => void;
}

export function AddExistingAdDialog({
  open,
  onOpenChange,
  campaign,
  onSuccess,
}: AddExistingAdDialogProps) {
  const [availableAds, setAvailableAds] = useState<Advertisement[]>([]);
  const [existingAdIds, setExistingAdIds] = useState<Set<string>>(new Set());
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());
  const [urlOverrides, setUrlOverrides] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available ads when dialog opens
  useEffect(() => {
    if (open && campaign) {
      fetchAvailableAds();
    } else {
      // Reset state when closing
      setAvailableAds([]);
      setExistingAdIds(new Set());
      setSelectedAdIds(new Set());
      setUrlOverrides({});
      setError(null);
    }
  }, [open, campaign]);

  const fetchAvailableAds = async () => {
    if (!campaign) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all advertisements for this advertiser
      const { data: adsData, error: adsError } = await supabase.functions.invoke(
        'broadstreet-api',
        {
          body: {
            action: 'advertisements',
            advertiserId: campaign.broadstreet_advertiser_id.toString(),
          },
        }
      );

      if (adsError) throw adsError;

      // Fetch placements for this campaign to know which ads are already placed
      const { data: placementsData, error: placementsError } = await supabase.functions.invoke(
        'broadstreet-api',
        {
          body: {
            action: 'placements',
            campaignId: campaign.broadstreet_campaign_id.toString(),
          },
        }
      );

      if (placementsError) throw placementsError;

      // Parse the ads and filter by matching ad type
      const allAds = (adsData?.advertisements || []).map((ad: any) => {
        const active = ad.active || {};
        const width = active.width || ad.width || 600;
        const height = active.height || ad.height || 300;
        const adType = width > height ? 'billboard' : 'skyscraper';

        return {
          id: ad.id?.toString() || '',
          name: ad.name || 'Unnamed Ad',
          type: adType,
          imageUrl: active.url || ad.image_url || '/placeholder.svg',
          width,
          height,
          createdAt: ad.created_at,
          clickUrl: ad.destination || undefined,
        } as Advertisement;
      });

      // Filter to only matching ad type
      const matchingAds = allAds.filter((ad: Advertisement) => ad.type === campaign.ad_type);

      // Get existing ad IDs from placements
      const placements = placementsData?.placements || [];
      const placedAdIds = new Set<string>(
        placements.map((p: any) => p.advertisement_id?.toString()).filter(Boolean)
      );

      setAvailableAds(matchingAds);
      setExistingAdIds(placedAdIds);
    } catch (err) {
      console.error('Error fetching ads:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ads');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAdSelection = (adId: string) => {
    setSelectedAdIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) {
        next.delete(adId);
      } else {
        next.add(adId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!campaign || selectedAdIds.size === 0) return;

    setIsSubmitting(true);

    try {
      // If any selected ads have URL overrides, update them in Broadstreet first
      for (const adId of selectedAdIds) {
        const override = urlOverrides[adId]?.trim();
        if (override) {
          const { error: updateError } = await supabase.functions.invoke('broadstreet-api', {
            body: {
              action: 'update-advertisement',
              advertiserId: campaign.broadstreet_advertiser_id.toString(),
              advertisementId: adId,
              click_url: override,
            },
          });
          if (updateError) {
            console.error(`Failed to update click URL for ad ${adId}:`, updateError);
            // Continue anyway - the ad can still be added
          }
        }
      }

      // Add each selected ad to the campaign
      const results = await Promise.all(
        Array.from(selectedAdIds).map(async (adId) => {
          // Find the ad details to pass along for DB recording
          const ad = availableAds.find(a => a.id === adId);
          const override = urlOverrides[adId]?.trim();
          
          const { data, error } = await supabase.functions.invoke('broadstreet-api', {
            body: {
              action: 'add-ad-to-campaign',
              advertisementId: adId,
              campaignId: campaign.broadstreet_campaign_id.toString(),
              siteId: campaign.site_id,
              adType: campaign.ad_type,
              dbCampaignId: campaign.id,
              adName: ad?.name || '',
              adImageUrl: ad?.imageUrl || '',
              adWidth: ad?.width || 0,
              adHeight: ad?.height || 0,
              adClickUrl: override || ad?.clickUrl || '',
            },
          });

          if (error) throw error;
          return data;
        })
      );

      toast({
        title: 'Ads added successfully',
        description: `Added ${selectedAdIds.size} ad${selectedAdIds.size > 1 ? 's' : ''} to ${campaign.name}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Error adding ads:', err);
      toast({
        title: 'Failed to add ads',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectableAds = availableAds.filter((ad) => !existingAdIds.has(ad.id));
  const hasSelectableAds = selectableAds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Existing Ad to Campaign</DialogTitle>
          <DialogDescription>
            Select ads to add to "{campaign?.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {isLoading && (
            <>
              <AdCardSkeleton />
              <AdCardSkeleton />
              <AdCardSkeleton />
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {!isLoading && !error && availableAds.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No ads available</p>
              <p className="text-sm mt-1">
                Upload a new ad to get started
              </p>
            </div>
          )}

          {!isLoading && !error && availableAds.length > 0 && !hasSelectableAds && (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">All ads already added</p>
              <p className="text-sm mt-1">
                All your {campaign?.ad_type} ads are already in this campaign
              </p>
            </div>
          )}

          {!isLoading && !error && availableAds.map((ad) => {
            const isPlaced = existingAdIds.has(ad.id);
            const isSelected = selectedAdIds.has(ad.id);

            return (
              <div
                key={ad.id}
                className={`
                  flex items-start gap-3 p-3 rounded-lg border transition-colors
                  ${isPlaced 
                    ? 'bg-muted/50 border-muted opacity-60 cursor-not-allowed' 
                    : isSelected 
                      ? 'border-primary bg-primary/5 cursor-pointer' 
                      : 'border-border hover:border-primary/50 cursor-pointer'
                  }
                `}
                onClick={() => !isPlaced && toggleAdSelection(ad.id)}
              >
                {/* Checkbox or placed indicator */}
                <div className="pt-0.5">
                  {isPlaced ? (
                    <div className="h-4 w-4 rounded-sm bg-muted-foreground/30 flex items-center justify-center">
                      <Check className="h-3 w-3 text-muted-foreground" />
                    </div>
                  ) : (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleAdSelection(ad.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>

                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-md bg-muted overflow-hidden flex-shrink-0">
                  <img
                    src={ad.imageUrl}
                    alt={ad.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder.svg';
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-2">{ad.name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{ad.width}×{ad.height}</span>
                    {ad.createdAt && (
                      <>
                        <span>•</span>
                        <span>{format(new Date(ad.createdAt), 'MMM d, yyyy')}</span>
                      </>
                    )}
                    {/* Info popover */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="View ad details"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="left"
                        align="start"
                        className="w-72 p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-2">
                          <p className="font-medium text-sm">{ad.name}</p>
                          <div className="rounded-md border bg-muted overflow-hidden">
                            <img
                              src={ad.imageUrl}
                              alt={ad.name}
                              className="w-full h-auto max-h-40 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/placeholder.svg';
                              }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span>{ad.width}×{ad.height}</span>
                            {ad.createdAt && (
                              <span> • {format(new Date(ad.createdAt), 'MMM d, yyyy')}</span>
                            )}
                          </div>
                          {ad.clickUrl ? (
                            <a
                              href={ad.clickUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                            >
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{ad.clickUrl}</span>
                            </a>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No click URL set</p>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {isPlaced && (
                    <Badge variant="secondary" className="mt-2 text-xs">
                      Already in campaign
                    </Badge>
                  )}
                  {isSelected && !isPlaced && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <Label className="text-xs text-muted-foreground">Click URL override (optional)</Label>
                      <UrlInput
                        placeholder={ad.clickUrl || 'https://...'}
                        value={urlOverrides[ad.id] || ''}
                        onValueChange={(val) => setUrlOverrides(prev => ({ ...prev, [ad.id]: val }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedAdIds.size === 0 || isSubmitting}
          >
            {isSubmitting
              ? 'Adding...'
              : `Add ${selectedAdIds.size || ''} Ad${selectedAdIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdCardSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <Skeleton className="h-4 w-4 rounded-sm" />
      <Skeleton className="w-16 h-16 rounded-md" />
      <div className="flex-1">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
