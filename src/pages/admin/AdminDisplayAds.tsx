import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw, Image, Calendar, Building2, Globe, Filter, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { CreateDisplayCampaignDialog } from '@/components/CreateDisplayCampaignDialog';
import { CampaignStatsDialog } from '@/components/CampaignStatsDialog';
import { format, parseISO, isAfter, isBefore } from 'date-fns';

interface Organization {
  id: string;
  name: string;
  client_code: string;
  broadstreet_advertiser_id?: number | null;
}

interface Site {
  id: string;
  name: string;
  broadstreet_config: Record<string, unknown> | null;
}

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
  is_auto_created: boolean;
  created_at: string;
  organization?: { id: string; name: string; client_code: string } | null;
  site?: { id: string; name: string } | null;
}

type SortField = 'created_at' | 'start_date' | 'end_date';
type SortOrder = 'asc' | 'desc';

export default function AdminDisplayAds() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<LocalCampaign[]>([]);
  const [activeAdCounts, setActiveAdCounts] = useState<Record<string, number>>({});
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<'active' | 'past' | 'no_ads'>('active');
  const [sortBy, setSortBy] = useState<SortField>('start_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [statsDialogCampaign, setStatsDialogCampaign] = useState<LocalCampaign | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const deepLinkedCampaignId = searchParams.get('campaign');

    if (!deepLinkedCampaignId || campaigns.length === 0) {
      return;
    }

    const matchedCampaign = campaigns.find((campaign) => campaign.id === deepLinkedCampaignId);

    if (matchedCampaign) {
      setStatsDialogCampaign((current) => (current?.id === matchedCampaign.id ? current : matchedCampaign));
    }
  }, [campaigns, searchParams]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      const [orgsResult, sitesResult, campaignsResult, placementsResult] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, client_code, broadstreet_advertiser_id')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('sites')
          .select('id, name, broadstreet_config')
          .eq('is_active', true)
          .not('broadstreet_config', 'is', null)
          .order('name'),
        supabase
          .from('display_ad_campaigns')
          .select(`
            *,
            organization:organizations(id, name, client_code),
            site:sites(id, name)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('display_ad_placements')
          .select('campaign_id')
          .eq('is_active', true)
      ]);

      if (orgsResult.error) throw orgsResult.error;
      if (sitesResult.error) throw sitesResult.error;
      if (campaignsResult.error) throw campaignsResult.error;

      // Build active ad count map
      const counts: Record<string, number> = {};
      if (!placementsResult.error && placementsResult.data) {
        for (const p of placementsResult.data) {
          counts[p.campaign_id] = (counts[p.campaign_id] || 0) + 1;
        }
      }
      setActiveAdCounts(counts);

      setOrganizations(orgsResult.data || []);

      const enabledSites = (sitesResult.data || []).filter(site => {
        const config = site.broadstreet_config as Record<string, unknown> | null;
        return config?.enabled === true;
      });
      setSites(enabledSites as Site[]);

      setCampaigns((campaignsResult.data || []) as unknown as LocalCampaign[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load display ads data',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const handleCampaignCreated = () => {
    setIsCreateDialogOpen(false);
    fetchData();
    toast({
      title: 'Campaign Created',
      description: 'The display ad campaign was created successfully'
    });
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const openCampaignDetails = (campaign: LocalCampaign) => {
    setStatsDialogCampaign(campaign);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('campaign', campaign.id);
    setSearchParams(nextParams, { replace: true });
  };

  const handleStatsDialogOpenChange = (open: boolean) => {
    if (open) return;

    setStatsDialogCampaign(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('campaign');
    setSearchParams(nextParams, { replace: true });
  };

  const filteredAndSortedCampaigns = useMemo(() => {
    const now = new Date();

    let filtered = campaigns.filter(campaign => {
      if (selectedOrgId !== 'all' && campaign.organization_id !== selectedOrgId) {
        return false;
      }
      if (selectedSiteId !== 'all' && campaign.site_id !== selectedSiteId) {
        return false;
      }
      return true;
    });

    const isNotEnded = (campaign: LocalCampaign) => {
      if (!campaign.end_date || campaign.end_date === '2999-12-31') return true;
      return isAfter(parseISO(campaign.end_date), now);
    };

    if (campaignFilter === 'active') {
      filtered = filtered.filter(isNotEnded);
    } else if (campaignFilter === 'no_ads') {
      filtered = filtered.filter(campaign =>
        isNotEnded(campaign) && (activeAdCounts[campaign.id] || 0) === 0
      );
    } else {
      filtered = filtered.filter(campaign => {
        if (!campaign.end_date || campaign.end_date === '2999-12-31') return false;
        return isBefore(parseISO(campaign.end_date), now);
      });
    }

    filtered.sort((a, b) => {
      let aValue: Date;
      let bValue: Date;

      switch (sortBy) {
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'start_date':
          aValue = parseISO(a.start_date);
          bValue = parseISO(b.start_date);
          break;
        case 'end_date':
          aValue = a.end_date && a.end_date !== '2999-12-31' ? parseISO(a.end_date) : new Date('2999-12-31');
          bValue = b.end_date && b.end_date !== '2999-12-31' ? parseISO(b.end_date) : new Date('2999-12-31');
          break;
        default:
          return 0;
      }

      const comparison = aValue.getTime() - bValue.getTime();
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [campaigns, selectedOrgId, selectedSiteId, campaignFilter, sortBy, sortOrder]);

  const getStatusBadge = (campaign: LocalCampaign) => {
    const now = new Date();
    const startDate = parseISO(campaign.start_date);
    const endDate = campaign.end_date ? parseISO(campaign.end_date) : null;

    if (!campaign.is_active) {
      return <Badge variant="secondary">Paused</Badge>;
    }
    if (isBefore(now, startDate)) {
      return <Badge variant="outline" className="border-blue-500 text-blue-600">Scheduled</Badge>;
    }
    if (endDate && endDate !== parseISO('2999-12-31') && isBefore(endDate, now)) {
      return <Badge variant="secondary">Ended</Badge>;
    }
    return <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>;
  };

  const formatDateRange = (startDate: string, endDate: string | null) => {
    const start = format(parseISO(startDate), 'MMM d, yyyy');
    if (!endDate || endDate === '2999-12-31') {
      return `${start} — Infinite`;
    }
    const end = format(parseISO(endDate), 'MMM d, yyyy');
    return `${start} — ${end}`;
  };

  const getAdTypeDimensions = (adType: string) => {
    return adType === 'billboard' ? '600×300' : '300×600';
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-12 w-full mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Display Ads Management</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage display ad campaigns across all clients and sites
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter:</span>
        </div>

        <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
          <SelectTrigger className="w-52">
            <Building2 className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {organizations.map(org => (
              <SelectItem key={org.id} value={org.id}>
                {org.name} ({org.client_code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
          <SelectTrigger className="w-44">
            <Globe className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites.map(site => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v as 'active' | 'past' | 'no_ads')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Campaigns</SelectItem>
            <SelectItem value="past">Past Campaigns</SelectItem>
            <SelectItem value="no_ads">No Ads</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="w-44">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start_date">Sort by Start Date</SelectItem>
              <SelectItem value="end_date">Sort by End Date</SelectItem>
              <SelectItem value="created_at">Sort by Created</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={toggleSortOrder} title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}>
            {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {filteredAndSortedCampaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No campaigns found</h3>
            <p className="text-muted-foreground mb-4">
              {campaigns.length === 0
                ? 'Get started by creating your first display ad campaign'
                : campaignFilter === 'no_ads'
                  ? 'No campaigns are missing ads — all active campaigns have creatives'
                  : campaignFilter === 'active'
                    ? 'No active campaigns match the current filters'
                    : 'No past campaigns match the current filters'}
            </p>
            {campaigns.length === 0 && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCampaigns.map(campaign => (
                <TableRow
                  key={campaign.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openCampaignDetails(campaign)}
                >
                  <TableCell>
                    <span className="text-sm">
                      {campaign.organization?.name || 'Unknown'}
                      <span className="text-muted-foreground ml-1">
                        ({campaign.organization?.client_code || '—'})
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">
                    {campaign.name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {campaign.site?.name || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">
                      {campaign.ad_type}
                      <span className="text-muted-foreground ml-1">
                        ({getAdTypeDimensions(campaign.ad_type)})
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDateRange(campaign.start_date, campaign.end_date)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {getStatusBadge(campaign)}
                      {(activeAdCounts[campaign.id] || 0) === 0 && (
                        <Badge variant="outline" className="border-amber-500 text-amber-600 gap-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          No Ads
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateDisplayCampaignDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleCampaignCreated}
        organizations={organizations}
        sites={sites}
        defaultOrgId={selectedOrgId !== 'all' ? selectedOrgId : undefined}
        defaultSiteId={selectedSiteId !== 'all' ? selectedSiteId : undefined}
      />

      <CampaignStatsDialog
        open={!!statsDialogCampaign}
        onOpenChange={handleStatsDialogOpenChange}
        campaign={statsDialogCampaign}
        onCampaignUpdated={() => fetchData()}
      />
    </div>
  );
}
