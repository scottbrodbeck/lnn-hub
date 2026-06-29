import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, Eye, MousePointer, TrendingUp, Hand, Palette, 
  RefreshCw, AlertCircle, ImageOff, Settings, Calendar,
  ChevronDown, BarChart3, Image, PlayCircle, Clock, History
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DesignRequestDialog } from '@/components/DesignRequestDialog';
import { CreateAdDialog } from '@/components/CreateAdDialog';
import { CampaignStatsDialog } from '@/components/CampaignStatsDialog';
import { AddExistingAdDialog } from '@/components/AddExistingAdDialog';
import { useBroadstreetAds } from '@/hooks/useBroadstreetAds';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isAfter, isBefore, isToday, formatDistanceToNow } from 'date-fns';

// Local campaign type from database
interface LocalCampaign {
  id: string;
  organization_id: string;
  site_id: string;
  broadstreet_advertiser_id: number;
  broadstreet_campaign_id: number;
  name: string;
  ad_type: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  organization?: { id: string; name: string; client_code: string } | null;
  site?: { id: string; name: string } | null;
}

interface CampaignStats {
  views: number;
  clicks: number;
  ctr: number;
  hovers: number;
}

interface CampaignWithStats extends LocalCampaign {
  stats: CampaignStats;
  adCount: number;
  adPreviews: string[];
  status: 'active' | 'scheduled' | 'ended';
  hasError: boolean;
}

function getCampaignStatus(campaign: LocalCampaign): 'active' | 'scheduled' | 'ended' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const startDate = parseISO(campaign.start_date);
  const endDate = campaign.end_date ? parseISO(campaign.end_date) : null;
  
  // Check if end_date is 2999-12-31 (infinite)
  const isInfinite = campaign.end_date === '2999-12-31';
  
  if (isAfter(startDate, today)) {
    return 'scheduled';
  }
  
  if (endDate && !isInfinite && isBefore(endDate, today)) {
    return 'ended';
  }
  
  return 'active';
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const start = format(parseISO(startDate), 'MMM d, yyyy');
  
  if (!endDate || endDate === '2999-12-31') {
    return `${start} - Ongoing`;
  }
  
  const end = format(parseISO(endDate), 'MMM d, yyyy');
  return `${start} - ${end}`;
}

function CampaignCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-4 w-2/3 mb-4" />
        <div className="grid grid-cols-3 gap-4 border-t pt-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </CardContent>
    </Card>
  );
}

interface CampaignCardProps {
  campaign: CampaignWithStats;
  onViewStats: (campaign: CampaignWithStats) => void;
  onCreateAd: (campaign: CampaignWithStats) => void;
  onAddExisting: (campaign: CampaignWithStats) => void;
}

function CampaignCard({ campaign, onViewStats, onCreateAd, onAddExisting }: CampaignCardProps) {
  const statusConfig = {
    active: { 
      color: 'bg-green-500/10 text-green-600 border-green-500/20',
      label: 'Active'
    },
    scheduled: { 
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      label: 'Scheduled'
    },
    ended: { 
      color: 'bg-muted text-muted-foreground border-border',
      label: 'Ended'
    }
  };

  const adTypeLabels: Record<string, string> = {
    billboard: 'Billboard',
    skyscraper: 'Skyscraper',
    skyscraper_a: 'Skyscraper',
  };

  const isScheduled = campaign.status === 'scheduled';
  const startDate = parseISO(campaign.start_date);
  const startsInText = isScheduled 
    ? formatDistanceToNow(startDate, { addSuffix: true })
    : null;

  return (
    <Card 
      className={`overflow-hidden cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/20 ${campaign.status === 'ended' ? 'opacity-60' : ''}`}
      onClick={() => onViewStats(campaign)}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className="font-semibold text-base line-clamp-2 cursor-pointer">
                    {campaign.name}
                  </h3>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>{campaign.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>{campaign.site?.name}</span>
              <span>•</span>
              <span>{adTypeLabels[campaign.ad_type] || campaign.ad_type}</span>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={statusConfig[campaign.status].color}
          >
            {statusConfig[campaign.status].label}
          </Badge>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDateRange(campaign.start_date, campaign.end_date)}</span>
        </div>

        {/* Ad previews or empty state */}
        {campaign.adPreviews.length > 0 ? (
          <div className="flex gap-2 mb-4 overflow-hidden">
            {campaign.adPreviews.slice(0, 3).map((url, idx) => (
              <div 
                key={idx}
                className="w-16 h-16 rounded-md bg-muted overflow-hidden flex-shrink-0"
              >
                <img 
                  src={url} 
                  alt="Ad preview" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.svg';
                  }}
                />
              </div>
            ))}
            {campaign.adCount > 3 && (
              <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center text-sm text-muted-foreground flex-shrink-0">
                +{campaign.adCount - 3}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 py-2">
            <ImageOff className="h-4 w-4" />
            <span>No ads uploaded yet</span>
          </div>
        )}

        {/* Stats row - contextual based on campaign status */}
        {isScheduled ? (
          <div className="border-t pt-3 mb-3">
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600 py-2">
              <Clock className="h-4 w-4" />
              <span>Starts {startsInText}</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 border-t pt-3 mb-3">
            {campaign.hasError ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="col-span-3 flex items-center justify-center gap-2 text-sm text-muted-foreground py-2 cursor-help">
                      <AlertCircle className="h-4 w-4" />
                      <span>Stats temporarily unavailable</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>We couldn't reach the ad server for this campaign. Click the campaign to retry, or use the Refresh button at the top of the page.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                    <Eye className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-semibold text-sm">{campaign.stats.views.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Views</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                    <MousePointer className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-semibold text-sm">{campaign.stats.clicks.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Clicks</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <p className="font-semibold text-sm">{campaign.stats.ctr.toFixed(2)}%</p>
                  <p className="text-xs text-muted-foreground">CTR</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions - stop propagation so clicking buttons doesn't open stats */}
        <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {(campaign.status === 'active' || campaign.status === 'scheduled') && (
            <>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onAddExisting(campaign)}
              >
                <Image className="h-3.5 w-3.5 mr-1" />
                Add Existing
              </Button>
              <Button 
                size="sm" 
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onCreateAd(campaign)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Upload Ad
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NotConfiguredState() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Settings className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Display Ads Not Configured</h3>
        <p className="text-muted-foreground mb-4">
          Your organization hasn't been linked to a Broadstreet advertiser account yet. 
          Please contact your administrator to set up display ad management.
        </p>
      </div>
    </Card>
  );
}

function NoCampaignsState() {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="rounded-full bg-muted p-3 mb-4">
          <Image className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Active Campaigns</h3>
        <p className="text-muted-foreground">
          You don't have any display ad campaigns set up yet. Contact your administrator
          to provision a new campaign for your organization.
        </p>
      </div>
    </Card>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="p-8">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="rounded-full bg-destructive/10 p-3 mb-4">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Failed to Load Campaigns</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </Card>
  );
}

export default function ClientDisplayAds() {
  const { activeOrganizationId } = useAuth();
  const [designDialogOpen, setDesignDialogOpen] = useState(false);
  const [createAdDialogOpen, setCreateAdDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [addExistingDialogOpen, setAddExistingDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithStats | null>(null);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  
  // Local campaigns from database
  const [localCampaigns, setLocalCampaigns] = useState<LocalCampaign[]>([]);
  const [campaignsWithStats, setCampaignsWithStats] = useState<CampaignWithStats[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Use existing hook for config and sites (no Broadstreet API calls on load)
  const { 
    sites,
    isConfigured,
    advertiserName,
    refresh: refreshBroadstreet,
    createAd,
  } = useBroadstreetAds();

  // Fetch local campaigns from database
  const fetchLocalCampaigns = useCallback(async () => {
    if (!activeOrganizationId) return;
    
    try {
      const { data, error } = await supabase
        .from('display_ad_campaigns')
        .select(`
          *,
          site:sites(id, name),
          organization:organizations(id, name, client_code)
        `)
        .eq('organization_id', activeOrganizationId)
        .eq('is_active', true)
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      setLocalCampaigns(data || []);
      setCampaignsError(null);
    } catch (err) {
      console.error('Error fetching local campaigns:', err);
      setCampaignsError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [activeOrganizationId]);

  // Fetch stats for all campaigns in ONE bulk request (server-side cached + throttled).
  // This replaces the previous per-tile fan-out that caused intermittent 0s due to
  // Broadstreet rate-limiting under concurrent load.
  const fetchCampaignStats = useCallback(async (campaigns: LocalCampaign[], forceRefresh = false) => {
    if (campaigns.length === 0) {
      setCampaignsWithStats([]);
      return;
    }

    setIsLoadingStats(true);

    try {
      const { data, error } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'campaign-stats-bulk',
          campaignIds: campaigns.map(c => c.id),
          forceRefresh,
        },
      });

      if (error) throw error;

      const byId = new Map<string, any>();
      for (const row of (data?.campaigns || [])) {
        byId.set(row.campaignId, row);
      }

      const results: CampaignWithStats[] = campaigns.map(campaign => {
        const row = byId.get(campaign.id);
        const views = Number(row?.views) || 0;
        const clicks = Number(row?.clicks) || 0;
        return {
          ...campaign,
          stats: {
            views,
            clicks,
            ctr: views > 0 ? (clicks / views * 100) : 0,
            hovers: Number(row?.hovers) || 0,
          },
          adCount: Number(row?.adCount) || 0,
          adPreviews: Array.isArray(row?.adPreviews) ? row.adPreviews : [],
          status: getCampaignStatus(campaign),
          hasError: !!row?.hasError,
        };
      });

      setCampaignsWithStats(results);
    } catch (err) {
      console.error('Error fetching campaign stats (bulk):', err);
      // Render campaigns with error flag rather than silent zeros
      setCampaignsWithStats(campaigns.map(campaign => ({
        ...campaign,
        stats: { views: 0, clicks: 0, ctr: 0, hovers: 0 },
        adCount: 0,
        adPreviews: [],
        status: getCampaignStatus(campaign),
        hasError: true,
      })));
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Load campaigns on mount
  useEffect(() => {
    fetchLocalCampaigns();
  }, [fetchLocalCampaigns]);

  // Load stats when campaigns change
  useEffect(() => {
    if (localCampaigns.length > 0 && !isLoadingCampaigns) {
      fetchCampaignStats(localCampaigns);
    } else if (localCampaigns.length === 0 && !isLoadingCampaigns) {
      setCampaignsWithStats([]);
    }
  }, [localCampaigns, isLoadingCampaigns, fetchCampaignStats]);

  // Refresh handler — forces server-side cache bypass for fresh numbers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchLocalCampaigns(),
        refreshBroadstreet()
      ]);
      if (localCampaigns.length > 0) {
        await fetchCampaignStats(localCampaigns, true);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchLocalCampaigns, refreshBroadstreet, localCampaigns, fetchCampaignStats]);

  const handleViewStats = useCallback((campaign: CampaignWithStats) => {
    setSelectedCampaign(campaign);
    setStatsDialogOpen(true);
  }, []);

  const handleCreateAdForCampaign = useCallback((campaign: CampaignWithStats) => {
    setSelectedCampaign(campaign);
    setCreateAdDialogOpen(true);
  }, []);

  const handleAddExistingForCampaign = useCallback((campaign: CampaignWithStats) => {
    setSelectedCampaign(campaign);
    setAddExistingDialogOpen(true);
  }, []);

  const handleAddExistingSuccess = useCallback(async () => {
    // Refresh stats after adding ads
    if (localCampaigns.length > 0) {
      await fetchCampaignStats(localCampaigns);
    }
  }, [localCampaigns, fetchCampaignStats]);

  const handleCreateAd = useCallback(async (data: {
    name: string;
    adType: 'billboard' | 'skyscraper';
    clickUrl: string;
    imageFile: File;
    campaignId?: string;
    siteId?: string;
  }) => {
    await createAd(data);
    // Refresh stats after creating ad
    if (localCampaigns.length > 0) {
      await fetchCampaignStats(localCampaigns);
    }
  }, [createAd, localCampaigns, fetchCampaignStats]);

  // Get unique sites for filter
  const uniqueSites = Array.from(
    new Map(localCampaigns.map(c => [c.site_id, c.site])).values()
  ).filter(Boolean);

  // Filter campaigns by site
  const filteredCampaigns = selectedSiteFilter === 'all'
    ? campaignsWithStats
    : campaignsWithStats.filter(c => c.site_id === selectedSiteFilter);

  // Group campaigns by status
  const activeCampaigns = filteredCampaigns.filter(c => c.status === 'active');
  const scheduledCampaigns = filteredCampaigns.filter(c => c.status === 'scheduled');
  const endedCampaigns = filteredCampaigns.filter(c => c.status === 'ended');

  // Aggregate stats — exclude campaigns whose stats failed to load so the
  // page-level totals don't silently undercount due to transient errors.
  const totalStats = filteredCampaigns
    .filter(c => !c.hasError)
    .reduce(
      (acc, c) => ({
        views: acc.views + c.stats.views,
        clicks: acc.clicks + c.stats.clicks,
        hovers: acc.hovers + c.stats.hovers
      }),
      { views: 0, clicks: 0, hovers: 0 }
    );
  const totalCtr = totalStats.views > 0 ? (totalStats.clicks / totalStats.views * 100) : 0;

  const isLoading = isLoadingCampaigns || isLoadingStats;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Display Ads</h1>
          <p className="text-muted-foreground">
            {advertiserName 
              ? `Managing campaigns for ${advertiserName}` 
              : 'Manage your display ad campaigns'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDesignDialogOpen(true)}>
            <Palette className="h-4 w-4 mr-2" />
            Request Design
          </Button>
        </div>
      </div>

      <DesignRequestDialog
        open={designDialogOpen}
        onOpenChange={setDesignDialogOpen}
        defaultType="display_ad"
      />

      <CreateAdDialog
        open={createAdDialogOpen}
        onOpenChange={(open) => {
          setCreateAdDialogOpen(open);
          if (!open) {
            setSelectedCampaign(null);
          }
        }}
        campaigns={localCampaigns}
        sites={sites}
        onCreateAd={handleCreateAd}
        selectedCampaign={selectedCampaign}
        organizationName={advertiserName}
      />

      <CampaignStatsDialog
        open={statsDialogOpen}
        onOpenChange={setStatsDialogOpen}
        campaign={selectedCampaign}
        onAdRemoved={() => {
          if (localCampaigns.length > 0) {
            fetchCampaignStats(localCampaigns);
          }
        }}
      />

      <AddExistingAdDialog
        open={addExistingDialogOpen}
        onOpenChange={(open) => {
          setAddExistingDialogOpen(open);
          if (!open) {
            setSelectedCampaign(null);
          }
        }}
        campaign={selectedCampaign}
        onSuccess={handleAddExistingSuccess}
      />

      {/* Not configured state */}
      {!isLoading && !isConfigured && <NotConfiguredState />}

      {/* Error state */}
      {!isLoading && campaignsError && (
        <ErrorState error={campaignsError} onRetry={handleRefresh} />
      )}

      {/* Main content */}
      {(isLoading || (isConfigured && !campaignsError)) && (
        <>
          {/* Aggregate stats header */}
          {!isLoadingCampaigns && campaignsWithStats.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{totalStats.views.toLocaleString()}</span>
                  <span className="text-muted-foreground">views</span>
                </div>
                <div className="flex items-center gap-2">
                  <MousePointer className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{totalStats.clicks.toLocaleString()}</span>
                  <span className="text-muted-foreground">clicks</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{totalCtr.toFixed(2)}%</span>
                  <span className="text-muted-foreground">CTR</span>
                </div>
              </div>
              
              {/* Site filter */}
              {uniqueSites.length > 1 && (
                <Select value={selectedSiteFilter} onValueChange={setSelectedSiteFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sites</SelectItem>
                    {uniqueSites.map(site => (
                      <SelectItem key={site?.id} value={site?.id || ''}>
                        {site?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <CampaignCardSkeleton />
              <CampaignCardSkeleton />
              <CampaignCardSkeleton />
            </div>
          )}

          {/* No campaigns state */}
          {!isLoading && campaignsWithStats.length === 0 && <NoCampaignsState />}

          {/* Campaign cards by status */}
          {!isLoading && campaignsWithStats.length > 0 && (
            <div className="space-y-8">
              {/* Active Campaigns */}
              {activeCampaigns.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <PlayCircle className="h-5 w-5 text-green-500" />
                    Active Campaigns
                    <Badge variant="secondary">{activeCampaigns.length}</Badge>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeCampaigns.map(campaign => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        onViewStats={handleViewStats}
                        onCreateAd={handleCreateAdForCampaign}
                        onAddExisting={handleAddExistingForCampaign}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Scheduled Campaigns */}
              {scheduledCampaigns.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                    Scheduled Campaigns
                    <Badge variant="secondary">{scheduledCampaigns.length}</Badge>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {scheduledCampaigns.map(campaign => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        onViewStats={handleViewStats}
                        onCreateAd={handleCreateAdForCampaign}
                        onAddExisting={handleAddExistingForCampaign}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Ended Campaigns */}
              {endedCampaigns.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                    <History className="h-5 w-5" />
                    Ended Campaigns
                    <Badge variant="outline">{endedCampaigns.length}</Badge>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {endedCampaigns.slice(0, 3).map(campaign => (
                      <CampaignCard
                        key={campaign.id}
                        campaign={campaign}
                        onViewStats={handleViewStats}
                        onCreateAd={handleCreateAdForCampaign}
                        onAddExisting={handleAddExistingForCampaign}
                      />
                    ))}
                  </div>
                  {endedCampaigns.length > 3 && (
                    <p className="text-sm text-muted-foreground mt-3">
                      + {endedCampaigns.length - 3} more ended campaigns
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
