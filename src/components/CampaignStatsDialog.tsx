import { useState, useEffect } from 'react';
import { Eye, MousePointer, TrendingUp, Hand, AlertCircle, RefreshCw, Image, ChevronDown, ChevronUp, Square, Calendar, Archive, Pencil, ExternalLink, Play, CalendarDays, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { EditAdDialog } from '@/components/EditAdDialog';
import { CreateAdDialog, type BroadstreetSite } from '@/components/CreateAdDialog';
import { AddExistingAdDialog } from '@/components/AddExistingAdDialog';
import { recordAudit } from '@/lib/audit';

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

interface AdStats {
  views: number;
  clicks: number;
  hovers: number;
}

interface ActiveAd {
  id: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  stats: AdStats;
  startedAt: string | null;
  clickUrl: string | null;
}

interface ArchivedAd {
  id: number;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  startedAt: string;
  endedAt: string;
  clickUrl: string | null;
  stats: AdStats;
}

interface CampaignStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: LocalCampaign | null;
  onAdRemoved?: () => void;
  onAdUpdated?: () => void;
  onCampaignUpdated?: () => void;
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ActiveAdCard({ 
  ad, 
  onStop, 
  onEdit,
  isStopping 
}: { 
  ad: ActiveAd; 
  onStop: () => void;
  onEdit: () => void;
  isStopping: boolean;
}) {
  const ctr = ad.stats.views > 0 ? (ad.stats.clicks / ad.stats.views * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        <img
          src={ad.imageUrl}
          alt={ad.name}
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
      </div>
      <CardContent className="p-3 space-y-3">
        <div>
          <p className="font-medium text-sm truncate">{ad.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{ad.width}×{ad.height}</span>
            {ad.startedAt && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Active since {format(parseISO(ad.startedAt), 'MMM d, yyyy')}
                </span>
              </>
            )}
          </div>
          {ad.clickUrl && (
            <a
              href={ad.clickUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 truncate max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{ad.clickUrl}</span>
            </a>
          )}
        </div>
        
        {/* Per-ad stats */}
        <div className="grid grid-cols-3 gap-2 text-center border-t pt-2">
          <div>
            <p className="font-semibold text-sm">{ad.stats.views.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Views</p>
          </div>
          <div>
            <p className="font-semibold text-sm">{ad.stats.clicks.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Clicks</p>
          </div>
          <div>
            <p className="font-semibold text-sm">{ctr.toFixed(2)}%</p>
            <p className="text-[10px] text-muted-foreground">CTR</p>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onStop}
            disabled={isStopping}
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            {isStopping ? 'Stopping...' : 'Stop Ad'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ArchivedAdCard({ ad, onRestart, isRestarting }: { ad: ArchivedAd; onRestart: () => void; isRestarting: boolean }) {
  const ctr = ad.stats.views > 0 ? (ad.stats.clicks / ad.stats.views * 100) : 0;

  return (
    <Card className="overflow-hidden opacity-70 hover:opacity-100 transition-opacity">
      <div className="aspect-video bg-muted relative">
        <img
          src={ad.imageUrl || '/placeholder.svg'}
          alt={ad.name}
          className="w-full h-full object-contain grayscale"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
        <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
          Stopped
        </Badge>
      </div>
      <CardContent className="p-3 space-y-2">
        <div>
          <p className="font-medium text-sm truncate">{ad.name}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Calendar className="h-3 w-3" />
            <span>
              {format(parseISO(ad.startedAt), 'MMM d')} — {format(parseISO(ad.endedAt), 'MMM d, yyyy')}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-center border-t pt-2">
          <div>
            <p className="font-semibold text-sm">{ad.stats.views.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Views</p>
          </div>
          <div>
            <p className="font-semibold text-sm">{ad.stats.clicks.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Clicks</p>
          </div>
          <div>
            <p className="font-semibold text-sm">{ctr.toFixed(2)}%</p>
            <p className="text-[10px] text-muted-foreground">CTR</p>
          </div>
        </div>

        {/* Restart button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onRestart}
          disabled={isRestarting}
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          {isRestarting ? 'Restarting...' : 'Restart Ad'}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CampaignStatsDialog({ open, onOpenChange, campaign, onAdRemoved, onAdUpdated, onCampaignUpdated }: CampaignStatsDialogProps) {
  const [stats, setStats] = useState<AdStats | null>(null);
  const [activeAds, setActiveAds] = useState<ActiveAd[]>([]);
  const [archivedAds, setArchivedAds] = useState<ArchivedAd[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stoppingAdId, setStoppingAdId] = useState<string | null>(null);
  const [confirmStopAd, setConfirmStopAd] = useState<ActiveAd | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<ActiveAd | null>(null);
  const [restartingAdId, setRestartingAdId] = useState<number | null>(null);
  const [confirmRestartAd, setConfirmRestartAd] = useState<ArchivedAd | null>(null);
  const [isEditingEndDate, setIsEditingEndDate] = useState(false);
  const [endDateValue, setEndDateValue] = useState<Date | undefined>(undefined);
  const [isInfinite, setIsInfinite] = useState(false);
  const [isSavingEndDate, setIsSavingEndDate] = useState(false);
  const [isEditingStartDate, setIsEditingStartDate] = useState(false);
  const [startDateValue, setStartDateValue] = useState<Date | undefined>(undefined);
  const [isSavingStartDate, setIsSavingStartDate] = useState(false);
  const [createAdOpen, setCreateAdOpen] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [broadstreetSites, setBroadstreetSites] = useState<BroadstreetSite[]>([]);
  const [confirmDeleteCampaign, setConfirmDeleteCampaign] = useState(false);
  const [isDeletingCampaign, setIsDeletingCampaign] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const fetchStats = async () => {
    if (!campaign) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'campaign-stats',
          campaignId: campaign.broadstreet_campaign_id.toString(),
          siteId: campaign.site_id,
          advertiserId: campaign.broadstreet_advertiser_id.toString(),
          dbCampaignId: campaign.id,
        }
      });
      
      if (invokeError) throw invokeError;
      
      setStats(data?.stats || { views: 0, clicks: 0, hovers: 0 });
      
      const adsData = (data?.ads || []).map((ad: any) => ({
        id: ad.id?.toString() || '',
        name: ad.name || 'Unnamed Ad',
        imageUrl: ad.active?.url || ad.image_url || '/placeholder.svg',
        width: ad.active?.width || ad.width || 600,
        height: ad.active?.height || ad.height || 300,
        stats: {
          views: ad.stats?.views || 0,
          clicks: ad.stats?.clicks || 0,
          hovers: ad.stats?.hovers || 0,
        },
        startedAt: ad.startedAt || null,
        clickUrl: ad.clickUrl || null,
      }));
      setActiveAds(adsData);

      
      setArchivedAds(data?.archivedAds || []);
    } catch (err) {
      console.error('Error fetching campaign stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch campaign statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopAd = async (ad: ActiveAd) => {
    if (!campaign) return;
    
    setStoppingAdId(ad.id);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'stop-ad',
          advertisementId: ad.id,
          adType: campaign.ad_type,
          campaignId: campaign.broadstreet_campaign_id.toString(),
          siteId: campaign.site_id,
          dbCampaignId: campaign.id,
        }
      });
      
      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'ad.stopped',
          entityType: 'display_ad_placement',
          entityId: String(ad.id),
          summary: `Stopped ad "${ad.name}" on campaign "${campaign.name}"`,
          before: { is_active: true, ad_name: ad.name },
          after: { is_active: false, ad_name: ad.name },
          metadata: { campaign_id: campaign.id },
        });
      }

      toast.success(`Stopped "${ad.name}" — stats preserved`);
      setConfirmStopAd(null);
      onAdRemoved?.();
      await fetchStats();
    } catch (err) {
      console.error('Error stopping ad:', err);
      toast.error('Failed to stop ad');
    } finally {
      setStoppingAdId(null);
    }
  };

  const handleRestartAd = async (ad: ArchivedAd) => {
    if (!campaign) return;
    
    setRestartingAdId(ad.id);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'add-ad-to-campaign',
          advertisementId: ad.id.toString(),
          campaignId: campaign.broadstreet_campaign_id.toString(),
          siteId: campaign.site_id,
          adType: campaign.ad_type,
          dbCampaignId: campaign.id,
          adName: ad.name,
          adImageUrl: ad.imageUrl,
          adWidth: ad.width,
          adHeight: ad.height,
          adClickUrl: ad.clickUrl || '',
        }
      });
      
      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'ad.restarted',
          entityType: 'display_ad_placement',
          entityId: String(ad.id),
          summary: `Restarted ad "${ad.name}" on campaign "${campaign.name}"`,
          before: { is_active: false, ad_name: ad.name },
          after: { is_active: true, ad_name: ad.name },
          metadata: { campaign_id: campaign.id },
        });
      }

      toast.success(`Restarted "${ad.name}" — now serving again`);
      setConfirmRestartAd(null);
      onAdUpdated?.();
      await fetchStats();
    } catch (err) {
      console.error('Error restarting ad:', err);
      toast.error('Failed to restart ad');
    } finally {
      setRestartingAdId(null);
    }
  };

  const handleUpdateAd = async (data: {
    adId: string;
    name?: string;
    clickUrl?: string;
  }) => {
    if (!campaign) return;
    
    // Call update-advertisement on Broadstreet
    const updateBody: Record<string, unknown> = {
      action: 'update-advertisement',
      advertiserId: campaign.broadstreet_advertiser_id.toString(),
      advertisementId: data.adId,
      siteId: campaign.site_id,
    };
    if (data.name) updateBody.name = data.name;
    if (data.clickUrl) updateBody.click_url = data.clickUrl;
    
    const { error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
      body: updateBody,
    });
    
    if (invokeError) throw invokeError;

    if (campaign.organization_id) {
      void recordAudit({
        organizationId: campaign.organization_id,
        action: 'ad.updated',
        entityType: 'display_ad_placement',
        entityId: data.adId,
        summary: `Updated ad ${data.name ? `name to "${data.name}"` : ''}${data.name && data.clickUrl ? ' & ' : ''}${data.clickUrl ? `click URL` : ''} on campaign "${campaign.name}"`,
        after: {
          ad_name: data.name,
          click_url: data.clickUrl,
        },
        metadata: { campaign_id: campaign.id },
      });
    }
    
    onAdUpdated?.();
    await fetchStats();
  };

  const handleDeleteCampaign = async () => {
    if (!campaign) return;
    setIsDeletingCampaign(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'delete-campaign',
          dbCampaignId: campaign.id,
          broadstreetCampaignId: campaign.broadstreet_campaign_id.toString(),
          advertiserId: campaign.broadstreet_advertiser_id.toString(),
          siteId: campaign.site_id,
        }
      });
      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'campaign.deleted',
          entityType: 'display_ad_campaign',
          entityId: campaign.id,
          summary: `Deleted campaign "${campaign.name}"`,
          before: {
            name: campaign.name,
            ad_type: campaign.ad_type,
            start_date: campaign.start_date,
            end_date: campaign.end_date,
            is_active: campaign.is_active,
            site_id: campaign.site_id,
          },
        });
      }

      toast.success('Campaign deleted successfully');
      setConfirmDeleteCampaign(false);
      onCampaignUpdated?.();
      onOpenChange(false);
    } catch (err) {
      console.error('Error deleting campaign:', err);
      toast.error('Failed to delete campaign');
    } finally {
      setIsDeletingCampaign(false);
    }
  };


  const handleSaveEndDate = async () => {
    if (!campaign) return;
    
    const newEndDate = isInfinite ? null : (endDateValue ? format(endDateValue, 'yyyy-MM-dd') : null);
    
    // Validate: don't allow past dates
    if (!isInfinite && endDateValue && isBefore(startOfDay(endDateValue), startOfDay(new Date()))) {
      toast.error('End date cannot be in the past');
      return;
    }
    
    setIsSavingEndDate(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'update-campaign-end-date',
          dbCampaignId: campaign.id,
          broadstreetCampaignId: campaign.broadstreet_campaign_id.toString(),
          advertiserId: campaign.broadstreet_advertiser_id.toString(),
          siteId: campaign.site_id,
          newEndDate,
        }
      });
      
      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'campaign.end_date_changed',
          entityType: 'display_ad_campaign',
          entityId: campaign.id,
          summary: `Changed end date of "${campaign.name}" from ${campaign.end_date ?? '—'} to ${newEndDate ?? 'no end date'}`,
          before: { end_date: campaign.end_date },
          after: { end_date: newEndDate },
        });
      }

      toast.success('Campaign end date updated');
      setIsEditingEndDate(false);

      // Update the campaign object in parent
      onCampaignUpdated?.();
    } catch (err) {
      console.error('Error updating end date:', err);
      toast.error('Failed to update end date');
    } finally {
      setIsSavingEndDate(false);
    }
  };

  const handleSaveStartDate = async () => {
    if (!campaign || !startDateValue) return;

    const newStartDate = format(startDateValue, 'yyyy-MM-dd');

    // Validate: start date must not be after end date
    const hasEndDate = campaign.end_date && campaign.end_date !== '2999-12-31';
    if (hasEndDate && startDateValue > parseISO(campaign.end_date!)) {
      toast.error('Start date cannot be after end date');
      return;
    }

    setIsSavingStartDate(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'update-campaign-start-date',
          dbCampaignId: campaign.id,
          broadstreetCampaignId: campaign.broadstreet_campaign_id.toString(),
          advertiserId: campaign.broadstreet_advertiser_id.toString(),
          siteId: campaign.site_id,
          newStartDate,
        }
      });

      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'campaign.start_date_changed',
          entityType: 'display_ad_campaign',
          entityId: campaign.id,
          summary: `Changed start date of "${campaign.name}" from ${campaign.start_date ?? '—'} to ${newStartDate}`,
          before: { start_date: campaign.start_date },
          after: { start_date: newStartDate },
        });
      }

      toast.success('Campaign start date updated');
      setIsEditingStartDate(false);
      onCampaignUpdated?.();
    } catch (err) {
      console.error('Error updating start date:', err);
      toast.error('Failed to update start date');
    } finally {
      setIsSavingStartDate(false);
    }
  };

  const handleSaveName = async () => {
    if (!campaign || !editingName.trim()) return;
    setIsSavingName(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'update-campaign-name',
          dbCampaignId: campaign.id,
          broadstreetCampaignId: campaign.broadstreet_campaign_id.toString(),
          advertiserId: campaign.broadstreet_advertiser_id.toString(),
          siteId: campaign.site_id,
          newName: editingName.trim(),
        }
      });
      if (invokeError) throw invokeError;

      if (campaign.organization_id) {
        void recordAudit({
          organizationId: campaign.organization_id,
          action: 'campaign.renamed',
          entityType: 'display_ad_campaign',
          entityId: campaign.id,
          summary: `Renamed campaign "${campaign.name}" → "${editingName.trim()}"`,
          before: { name: campaign.name },
          after: { name: editingName.trim() },
        });
      }

      toast.success('Campaign name updated');
      setIsEditingName(false);
      onCampaignUpdated?.();
    } catch (err) {
      console.error('Error updating campaign name:', err);
      toast.error('Failed to update campaign name');
    } finally {
      setIsSavingName(false);
    }
  };

  useEffect(() => {
    if (open && campaign) {
      setArchivedOpen(false);
      setIsEditingEndDate(false);
      setIsEditingStartDate(false);
      setIsEditingName(false);
      // Initialize end date state
      const hasEndDate = campaign.end_date && campaign.end_date !== '2999-12-31';
      setIsInfinite(!hasEndDate);
      setEndDateValue(hasEndDate ? parseISO(campaign.end_date!) : undefined);
      // Initialize start date state
      setStartDateValue(parseISO(campaign.start_date));
      fetchStats();

      // Fetch Broadstreet-enabled sites for zone config
      (async () => {
        const { data: sitesData } = await supabase
          .from('sites')
          .select('id, name, broadstreet_config')
          .not('broadstreet_config', 'is', null);

        const bsSites = (sitesData || [])
          .filter(s => (s.broadstreet_config as any)?.enabled)
          .map(s => {
            const config = s.broadstreet_config as any;
            return {
              id: s.id,
              name: s.name,
              billboardZoneId: config.billboard_zone_id ? Number(config.billboard_zone_id) : undefined,
              skyscraperZoneId: config.skyscraper_zone_id ? Number(config.skyscraper_zone_id) : undefined,
              skyscraperAZoneId: config.skyscraper_a_zone_id ? Number(config.skyscraper_a_zone_id) : undefined,
            };
          });
        setBroadstreetSites(bsSites);
      })();
    }
  }, [open, campaign?.id]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const handleCreateAd = async (params: {
    name: string;
    adType: 'billboard' | 'skyscraper';
    clickUrl: string;
    imageFile: File;
    campaignId?: string;
    siteId?: string;
  }) => {
    if (!campaign) throw new Error('No campaign');

    const advertiserId = campaign.broadstreet_advertiser_id;
    const { name, adType, clickUrl, imageFile, siteId } = params;
    const dimensions = { billboard: { width: 600, height: 300 }, skyscraper: { width: 300, height: 600 } };
    const { width, height } = dimensions[adType];
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // 1. Upload image
    const directUrl = (imageFile as any).__directUrl;
    let creativeUrl: string;

    if (directUrl) {
      creativeUrl = directUrl;
    } else {
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const actualDimensions = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new window.Image();
        img.onload = () => { URL.revokeObjectURL(img.src); resolve({ width: img.width, height: img.height }); };
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = URL.createObjectURL(imageFile);
      });

      const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-display-ad-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, filename: imageFile.name, width, height, actualWidth: actualDimensions.width, actualHeight: actualDimensions.height, fileSize: imageFile.size }),
      });
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload image');
      }
      creativeUrl = (await uploadResponse.json()).url;
    }

    // 2. Create advertisement in Broadstreet
    const queryParams = new URLSearchParams({ ...(siteId && { siteId }) });
    const response = await fetch(`${supabaseUrl}/functions/v1/broadstreet-api/create-advertisement?${queryParams}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ advertiserId: advertiserId.toString(), name, creative_url: creativeUrl, click_url: clickUrl, width, height }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create advertisement');
    }
    const newAd = await response.json();
    const adId = newAd?.advertisement?.id || newAd?.id;

    if (!adId) {
      toast.error('Ad created but ID was not returned. Add it manually via "Add Existing".');
      return;
    }

    // 3. Create placements
    let collectedPlacementIds: number[] = [];
    const selectedSite = broadstreetSites.find(s => s.id === (siteId || campaign.site_id));
    const primaryZoneId = selectedSite ? (adType === 'billboard' ? selectedSite.billboardZoneId : selectedSite.skyscraperZoneId) : null;
    const secondaryZoneId = adType === 'skyscraper' && selectedSite?.skyscraperAZoneId ? selectedSite.skyscraperAZoneId : null;
    const zoneIds = [primaryZoneId, secondaryZoneId].filter((id): id is number => id !== null);

    if (zoneIds.length > 0) {
      const placementResponses = await Promise.all(
        zoneIds.map(zoneId =>
          fetch(`${supabaseUrl}/functions/v1/broadstreet-api/create-placement?${queryParams}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: campaign.broadstreet_campaign_id, advertisement_id: adId, zone_id: zoneId }),
          })
        )
      );
      for (const resp of placementResponses.filter(r => r.ok)) {
        try {
          const data = await resp.json();
          const pid = data?.placement?.id || data?.id;
          if (pid) collectedPlacementIds.push(Number(pid));
        } catch { /* ignore */ }
      }
      const failedCount = placementResponses.filter(r => !r.ok).length;
      if (failedCount > 0) {
        toast.error(`Ad created, but ${failedCount} placement(s) failed`);
      } else {
        toast.success(`Ad "${name}" created and placed in ${zoneIds.length} zone(s)`);
      }
    }

    // 4. Track in local DB
    try {
      await supabase.functions.invoke('broadstreet-api', {
        body: {
          action: 'track-ad-creation',
          campaignId: campaign.id,
          advertisementId: adId,
          adName: name,
          adImageUrl: creativeUrl,
          adWidth: width,
          adHeight: height,
          clickUrl: clickUrl || null,
          placementIds: collectedPlacementIds.length > 0 ? collectedPlacementIds : null,
        },
      });
    } catch (dbErr) {
      console.error('Error inserting display_ad_placements record:', dbErr);
    }

    // 5. Refresh
    await fetchStats();
    onAdUpdated?.();
  };

  const totalCtr = stats && stats.views > 0 ? (stats.clicks / stats.views * 100) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isEditingName ? (
                <span className="flex items-center gap-2 flex-1">
                  <input
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    autoFocus
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveName} disabled={isSavingName || !editingName.trim()}>
                    {isSavingName ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIsEditingName(false)} disabled={isSavingName}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <>
                  <span>{campaign?.organization?.name || campaign?.name}</span>
                  {onCampaignUpdated && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingName(campaign?.name || '');
                        setIsEditingName(true);
                      }}
                      title="Edit campaign name"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span>{campaign?.site?.name} • {campaign?.ad_type === 'billboard' ? 'Billboard' : 'Skyscraper'}</span>
              {campaign && (
                <span className="flex items-center gap-1.5 flex-wrap">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    {format(parseISO(campaign.start_date), 'MMM d, yyyy')} — {' '}
                    {campaign.end_date && campaign.end_date !== '2999-12-31'
                      ? format(parseISO(campaign.end_date), 'MMM d, yyyy')
                      : 'No end date'}
                  </span>
                  {onCampaignUpdated && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setIsEditingStartDate(true);
                          setIsEditingEndDate(false);
                        }}
                        title="Edit start date"
                      >
                        <Pencil className="h-3 w-3" />
                        <span className="text-[10px] ml-0.5">Start</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setIsEditingEndDate(true);
                          setIsEditingStartDate(false);
                        }}
                        title="Edit end date"
                      >
                        <Pencil className="h-3 w-3" />
                        <span className="text-[10px] ml-0.5">End</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteCampaign(true)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Edit Start Date Section */}
          {isEditingStartDate && campaign && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Edit Start Date</h4>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setIsEditingStartDate(false)}>
                  Cancel
                </Button>
              </div>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDateValue && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {startDateValue ? format(startDateValue, 'PPP') : 'Select start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDateValue}
                    onSelect={setStartDateValue}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveStartDate}
                disabled={isSavingStartDate || !startDateValue}
              >
                {isSavingStartDate ? 'Saving...' : 'Save Start Date'}
              </Button>
            </div>
          )}

          {/* Edit End Date Section */}
          {isEditingEndDate && campaign && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Edit End Date</h4>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setIsEditingEndDate(false)}>
                  Cancel
                </Button>
              </div>
              
              <div className="flex items-center gap-3">
                <Switch
                  id="infinite-toggle"
                  checked={isInfinite}
                  onCheckedChange={(checked) => {
                    setIsInfinite(checked);
                    if (checked) setEndDateValue(undefined);
                  }}
                />
                <Label htmlFor="infinite-toggle" className="text-sm">No end date (infinite)</Label>
              </div>
              
              {!isInfinite && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDateValue && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {endDateValue ? format(endDateValue, 'PPP') : 'Select end date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDateValue}
                      onSelect={setEndDateValue}
                      disabled={(date) => isBefore(startOfDay(date), startOfDay(new Date()))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              )}
              
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveEndDate}
                disabled={isSavingEndDate || (!isInfinite && !endDateValue)}
              >
                {isSavingEndDate ? 'Saving...' : 'Save End Date'}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
              <Skeleton className="h-40" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={fetchStats}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Campaign-level stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Eye} label="Views" value={formatNumber(stats?.views || 0)} />
                <StatCard icon={MousePointer} label="Clicks" value={formatNumber(stats?.clicks || 0)} />
                <StatCard icon={TrendingUp} label="CTR" value={`${totalCtr.toFixed(2)}%`} />
                <StatCard icon={Hand} label="Hovers" value={formatNumber(stats?.hovers || 0)} />
              </div>


              {/* Active Ads */}
              {activeAds.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium flex items-center gap-2">
                      Active Ads
                      <Badge variant="secondary">{activeAds.length}</Badge>
                    </h4>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAddExistingOpen(true)}>
                        <Image className="h-3.5 w-3.5 mr-1" />
                        Add Existing
                      </Button>
                      <Button size="sm" onClick={() => setCreateAdOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Upload Ad
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeAds.map(ad => (
                      <ActiveAdCard
                        key={ad.id}
                        ad={ad}
                        onStop={() => setConfirmStopAd(ad)}
                        onEdit={() => setEditingAd(ad)}
                        isStopping={stoppingAdId === ad.id}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Image className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active ads in this campaign</p>
                  <div className="flex justify-center gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => setAddExistingOpen(true)}>
                      <Image className="h-3.5 w-3.5 mr-1" />
                      Add Existing
                    </Button>
                    <Button size="sm" onClick={() => setCreateAdOpen(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Upload Ad
                    </Button>
                  </div>
                </div>
              )}

              {/* Archived Ads */}
              {archivedAds.length > 0 && (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        Stopped Ads
                        <Badge variant="outline">{archivedAds.length}</Badge>
                      </span>
                      {archivedOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {archivedAds.map((ad, idx) => (
                        <ArchivedAdCard
                          key={`archived-${ad.id}-${idx}`}
                          ad={ad}
                          onRestart={() => setConfirmRestartAd(ad)}
                          isRestarting={restartingAdId === ad.id}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for stopping ad */}
      <AlertDialog open={!!confirmStopAd} onOpenChange={(open) => !open && setConfirmStopAd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Ad?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to stop serving this ad? Its stats will be saved, and it can be reused later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmStopAd && handleStopAd(confirmStopAd)}
            >
              Stop Ad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for restarting ad */}
      <AlertDialog open={!!confirmRestartAd} onOpenChange={(open) => !open && setConfirmRestartAd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart Ad?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restart this ad? It will begin accumulating new stats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRestartAd && handleRestartAd(confirmRestartAd)}
            >
              Restart Ad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Ad Dialog */}
      <EditAdDialog
        open={!!editingAd}
        onOpenChange={(open) => !open && setEditingAd(null)}
        ad={editingAd ? {
          id: editingAd.id,
          name: editingAd.name,
          clickUrl: editingAd.clickUrl || '',
          imageUrl: editingAd.imageUrl,
          width: editingAd.width,
          height: editingAd.height,
          type: editingAd.width > editingAd.height ? 'billboard' : 'skyscraper',
        } : null}
        onUpdateAd={handleUpdateAd}
      />

      {/* Create Ad Dialog */}
      <CreateAdDialog
        open={createAdOpen}
        onOpenChange={setCreateAdOpen}
        campaigns={[]}
        sites={broadstreetSites}
        onCreateAd={handleCreateAd}
        selectedCampaign={campaign ? {
          id: campaign.id,
          name: campaign.name,
          ad_type: campaign.ad_type,
          site_id: campaign.site_id,
          broadstreet_campaign_id: campaign.broadstreet_campaign_id,
          organization: campaign.organization ? { name: campaign.organization.name, client_code: campaign.organization.client_code } : null,
        } : undefined}
        organizationName={campaign?.organization?.name || null}
      />

      {/* Add Existing Ad Dialog */}
      <AddExistingAdDialog
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        campaign={campaign ? {
          id: campaign.id,
          broadstreet_campaign_id: campaign.broadstreet_campaign_id,
          broadstreet_advertiser_id: campaign.broadstreet_advertiser_id,
          name: campaign.name,
          ad_type: campaign.ad_type,
          site_id: campaign.site_id,
        } : null}
        onSuccess={() => fetchStats()}
      />

      {/* Confirmation dialog for deleting campaign */}
      <AlertDialog open={confirmDeleteCampaign} onOpenChange={setConfirmDeleteCampaign}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will permanently delete the campaign <strong>"{campaign?.name}"</strong>.</span>
              <span className="block">• All active ads will be stopped and removed from Broadstreet</span>
              <span className="block">• The Broadstreet campaign will be deleted</span>
              <span className="block">• All local records will be permanently removed</span>
              <span className="block font-medium text-destructive">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCampaign}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteCampaign}
              disabled={isDeletingCampaign}
            >
              {isDeletingCampaign ? 'Deleting...' : 'Delete Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
