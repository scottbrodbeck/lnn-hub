import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getAppBaseUrl } from '@/lib/utils';
import { recordAudit } from '@/lib/audit';
import type { BroadstreetSite } from '@/components/CreateAdDialog';

interface CreateAdParams {
  name: string;
  adType: 'billboard' | 'skyscraper';
  clickUrl: string;
  imageFile: File;
  campaignId?: string;
  siteId?: string;
}

interface UseBroadstreetAdsReturn {
  sites: BroadstreetSite[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isConfigured: boolean;
  advertiserId: number | null;
  advertiserName: string | null;
  refresh: () => Promise<void>;
  createAd: (params: CreateAdParams) => Promise<void>;
}

// Helper to get zone ID for a given ad type from site config
function getZoneIdForAdType(
  site: BroadstreetSite,
  adType: 'billboard' | 'skyscraper'
): number | null {
  switch (adType) {
    case 'billboard':
      return site.billboardZoneId ?? null;
    case 'skyscraper':
      return site.skyscraperZoneId ?? null;
  }
}

export function useBroadstreetAds(): UseBroadstreetAdsReturn {
  const { user, activeOrganizationId, role } = useAuth();
  const [sites, setSites] = useState<BroadstreetSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advertiserId, setAdvertiserId] = useState<number | null>(null);
  const [advertiserName, setAdvertiserName] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  
  const organizationId = activeOrganizationId;

  // Fetch organization's Broadstreet advertiser ID
  const fetchAdvertiserConfig = useCallback(async () => {
    if (!organizationId) return null;
    
    const { data, error } = await supabase
      .from('organizations')
      .select('broadstreet_advertiser_id, broadstreet_advertiser_name')
      .eq('id', organizationId)
      .single();
    
    if (error) {
      console.error('Error fetching organization:', error);
      return null;
    }
    
    return data;
  }, [organizationId]);

  // Fetch sites with Broadstreet config for this organization
  const fetchBroadstreetSites = useCallback(async (): Promise<BroadstreetSite[]> => {
    if (!organizationId) return [];

    try {
      const { data, error } = await supabase
        .from('sites')
        .select(`
          id,
          name,
          broadstreet_config
        `)
        .not('broadstreet_config', 'is', null);

      if (error) {
        console.error('Error fetching sites:', error);
        return [];
      }

      const broadstreetSites: BroadstreetSite[] = (data || [])
        .filter(site => {
          const config = site.broadstreet_config as Record<string, any> | null;
          return config?.enabled === true;
        })
        .map(site => {
          const config = site.broadstreet_config as Record<string, any>;
          return {
            id: site.id,
            name: site.name,
            billboardZoneId: config.billboard_zone_id ? Number(config.billboard_zone_id) : undefined,
            skyscraperZoneId: config.skyscraper_zone_id ? Number(config.skyscraper_zone_id) : undefined,
            skyscraperAZoneId: config.skyscraper_a_zone_id ? Number(config.skyscraper_a_zone_id) : undefined,
            hasCustomCredentials: !!(config.access_token && config.network_id),
          };
        });

      return broadstreetSites;
    } catch (err) {
      console.error('Error in fetchBroadstreetSites:', err);
      return [];
    }
  }, [organizationId]);

  // Fetch config and sites only (no Broadstreet API calls)
  const fetchAdsData = useCallback(async (forceRefresh: boolean = false) => {
    if (!organizationId || !user) {
      setIsLoading(false);
      return;
    }
    
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      
      // Fetch org config and sites in parallel
      const [orgConfig, broadstreetSites] = await Promise.all([
        fetchAdvertiserConfig(),
        fetchBroadstreetSites()
      ]);

      setSites(broadstreetSites);
      
      if (!orgConfig?.broadstreet_advertiser_id) {
        setIsConfigured(false);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }
      
      setIsConfigured(true);
      setAdvertiserId(orgConfig.broadstreet_advertiser_id);
      setAdvertiserName(orgConfig.broadstreet_advertiser_name);
      
    } catch (err) {
      console.error('Error fetching Broadstreet config:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch display ads config');
      toast({
        title: 'Error loading ads config',
        description: err instanceof Error ? err.message : 'Failed to fetch display ads config',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [organizationId, user, fetchAdvertiserConfig, fetchBroadstreetSites]);

  // Create a new ad with image upload via edge function
  const createAd = useCallback(async (params: CreateAdParams): Promise<void> => {
    if (!advertiserId) {
      throw new Error('Advertiser not configured');
    }

    const { name, adType, clickUrl, imageFile, campaignId, siteId } = params;
    
    const dimensions = {
      billboard: { width: 600, height: 300 },
      skyscraper: { width: 300, height: 600 },
    };
    
    const { width, height } = dimensions[adType];
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    // Check if this is an animated image with a direct URL already uploaded
    const directUrl = (imageFile as any).__directUrl;
    let creativeUrl: string;
    
    if (directUrl) {
      // Use the direct URL for animated images (already uploaded to Supabase storage)
      creativeUrl = directUrl;
    } else {
      // Process via Cloudinary for static images
      const toDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };
      
      // Get actual image dimensions for smart processing
      const getImageDimensions = (file: File): Promise<{width: number, height: number}> => {
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
      
      const [imageData, actualDimensions] = await Promise.all([
        toDataURL(imageFile),
        getImageDimensions(imageFile)
      ]);
      
      const uploadResponse = await fetch(
        `${supabaseUrl}/functions/v1/upload-display-ad-image`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData,
            filename: imageFile.name,
            width,
            height,
            actualWidth: actualDimensions.width,
            actualHeight: actualDimensions.height,
            fileSize: imageFile.size,
          }),
        }
      );
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload image');
      }
      
      const uploadResult = await uploadResponse.json();
      creativeUrl = uploadResult.url;
    }
    
    const queryParams = new URLSearchParams({
      ...(organizationId && { organizationId }),
      ...(siteId && { siteId }),
    });
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/broadstreet-api/create-advertisement?${queryParams}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          advertiserId: advertiserId.toString(),
          name,
          creative_url: creativeUrl,
          click_url: clickUrl,
          width,
          height,
        }),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create advertisement');
    }
    
    const newAd = await response.json();
    const adId = newAd?.advertisement?.id || newAd?.id;
    
    if (campaignId && siteId && adId) {
      let collectedPlacementIds: number[] = [];
      // Look up the Broadstreet campaign ID from local database
      const { data: campaignRecord } = await supabase
        .from('display_ad_campaigns')
        .select('broadstreet_campaign_id')
        .eq('id', campaignId)
        .single();
      
      const broadstreetCampaignId = campaignRecord?.broadstreet_campaign_id;
      
      if (!broadstreetCampaignId) {
        console.error('Could not find broadstreet_campaign_id for local campaign:', campaignId);
        toast({
          title: 'Ad created, but not placed in campaign',
          description: 'Could not find the Broadstreet campaign ID for this campaign. Please add the ad manually using "Add Existing".',
          variant: 'destructive'
        });
      } else {
        const selectedSite = sites.find(s => s.id === siteId);
        const primaryZoneId = selectedSite ? getZoneIdForAdType(selectedSite, adType) : null;
        
        // For skyscraper ads, also check for secondary zone
        const secondaryZoneId = adType === 'skyscraper' && selectedSite?.skyscraperAZoneId
          ? selectedSite.skyscraperAZoneId
          : null;
        
        // Collect all zone IDs to create placements for
        const zoneIds = [primaryZoneId, secondaryZoneId].filter((id): id is number => id !== null);
        
        if (zoneIds.length > 0) {
          try {
            // Create placements for all configured zones
            const placementPromises = zoneIds.map(zoneId =>
              fetch(
                `${supabaseUrl}/functions/v1/broadstreet-api/create-placement?${queryParams}`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${anonKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    campaignId: broadstreetCampaignId,
                    advertisement_id: adId,
                    zone_id: zoneId,
                  }),
                }
              )
            );
            
            const placementResponses = await Promise.all(placementPromises);
            const failedPlacements = placementResponses.filter(r => !r.ok);
            
            // Extract placement IDs from successful responses
            for (const resp of placementResponses.filter(r => r.ok)) {
              try {
                const data = await resp.json();
                const pid = data?.placement?.id || data?.id;
                if (pid) collectedPlacementIds.push(Number(pid));
              } catch { /* ignore parse errors */ }
            }
            
            if (failedPlacements.length > 0) {
              console.error(`${failedPlacements.length} placement(s) failed`);
              toast({
                title: 'Ad created, but some placements failed',
                description: `Created ${zoneIds.length - failedPlacements.length} of ${zoneIds.length} zone placements`,
                variant: 'destructive'
              });
            } else {
              const zoneText = zoneIds.length > 1 ? `${zoneIds.length} zones` : `zone ${zoneIds[0]}`;
              toast({
                title: 'Ad and placements created',
                description: `Ad "${name}" assigned to ${zoneText}`,
              });
            }
          } catch (placementErr) {
            console.error('Error creating placements:', placementErr);
            toast({
              title: 'Ad created, but placements failed',
              description: placementErr instanceof Error ? placementErr.message : 'Unknown error',
              variant: 'destructive'
            });
          }
        } else {
          console.log(`No zone configured for ad type ${adType} on site ${siteId}`);
        }
      }
      
      // Insert tracking record via backend (bypasses RLS for client users)
      try {
        const { error: trackError } = await supabase.functions.invoke('broadstreet-api', {
          body: {
            action: 'track-ad-creation',
            campaignId,
            advertisementId: adId,
            adName: name,
            adImageUrl: creativeUrl,
            adWidth: width,
            adHeight: height,
            clickUrl: clickUrl || null,
            placementIds: collectedPlacementIds.length > 0 ? collectedPlacementIds : null,
          },
        });
        
        if (trackError) {
          console.error('Failed to insert display_ad_placements record via backend:', trackError);
        } else {
          console.log('Successfully inserted display_ad_placements record for ad', adId);

          if (organizationId) {
            void recordAudit({
              organizationId,
              action: 'ad.created',
              entityType: 'display_ad_placement',
              entityId: String(adId),
              summary: `Added ad "${name}" (${width}×${height}) to campaign`,
              after: {
                ad_name: name,
                ad_image_url: creativeUrl,
                click_url: clickUrl || null,
                ad_width: width,
                ad_height: height,
                is_active: true,
              },
              metadata: { campaign_id: campaignId, broadstreet_ad_id: adId },
            });
          }

          // Send notification if user is a client (not admin)
          if (role === 'client') {
            try {
              const selectedSite = sites.find(s => s.id === siteId);
              const { data: campaignData } = await supabase
                .from('display_ad_campaigns')
                .select('name')
                .eq('id', campaignId)
                .single();

              const { data: orgData } = await supabase
                .from('organizations')
                .select('name')
                .eq('id', organizationId!)
                .single();

              const { data: currentUser } = await supabase.auth.getUser();
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', currentUser?.user?.id ?? '')
                .single();

              await supabase.functions.invoke('notify-admins', {
                body: {
                  event_type: 'ad_submitted',
                  user_id: currentUser?.user?.id,
                  user_name: profile?.full_name || profile?.email || 'Unknown',
                  user_email: profile?.email || '',
                  organization_id: organizationId,
                  organization_name: orgData?.name || '',
                  admin_link: `${getAppBaseUrl()}/admin/display-ads?campaign=${campaignId}`,
                  timestamp: new Date().toISOString(),
                  additional_data: {
                    ad_name: name,
                    click_url: clickUrl,
                    image_url: creativeUrl,
                    ad_dimensions: `${width}×${height}`,
                    campaign_name: campaignData?.name || '',
                    site_name: selectedSite?.name || '',
                  },
                },
              });
            } catch (notifyErr) {
              console.error('Failed to send ad submitted notification:', notifyErr);
            }
          }
        }
      } catch (dbErr) {
        console.error('Error inserting display_ad_placements record:', dbErr);
      }
    } else if (campaignId && siteId && !adId) {
      console.error('Ad created but ID was not returned. Cannot create placement.', newAd);
      toast({
        title: 'Ad created, but not placed in campaign',
        description: 'The ad was created but could not be added to the campaign. Please add it manually using "Add Existing".',
        variant: 'destructive'
      });
    }
    
    await fetchAdsData(true);
    
    return newAd;
  }, [advertiserId, organizationId, sites, fetchAdsData, role]);

  // Refresh data
  const refresh = useCallback(async () => {
    await fetchAdsData(true);
  }, [fetchAdsData]);

  // Initial load
  useEffect(() => {
    fetchAdsData(false);
  }, [fetchAdsData]);

  return {
    sites,
    isLoading,
    isRefreshing,
    error,
    isConfigured,
    advertiserId,
    advertiserName,
    refresh,
    createAd,
  };
}
