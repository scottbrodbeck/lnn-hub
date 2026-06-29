import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, MonitorPlay, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAssignmentPlan } from '@/hooks/useQboInvoiceAssignments';

export interface ProvisionedCampaign {
  local_id: string | null;
  broadstreet_id: number;
  name: string;
  ad_type: string;
  site_name: string | null;
}

type AdTypeChoice = 'billboard' | 'skyscraper' | 'both' | '';

interface AdRow {
  lineKey: string;
  productName: string;
  siteId: string | null;
  adType: AdTypeChoice;
  startDate: string;
  infinite: boolean;
  endDate: string;
  notify: boolean;
  status: 'idle' | 'creating' | 'done' | 'error';
  error?: string;
  campaigns: ProvisionedCampaign[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealId: string;
  linkedOrgId: string | null;
  defaultStartDate?: string;
  onProvisioned?: (campaigns: ProvisionedCampaign[]) => void;
}

function inferAdType(productName: string): AdTypeChoice {
  if (/both/i.test(productName)) return 'both';
  if (/billboard/i.test(productName)) return 'billboard';
  if (/skyscraper/i.test(productName)) return 'skyscraper';
  return '';
}

export function DisplayAdsProvisionDialog({
  open,
  onOpenChange,
  dealId,
  linkedOrgId,
  defaultStartDate,
  onProvisioned,
}: Props) {
  const { data: plan, isLoading } = useAssignmentPlan({ dealId }, open);
  const [rows, setRows] = useState<AdRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: bsSites } = useQuery({
    queryKey: ['sites', 'broadstreet-enabled'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, name, broadstreet_config')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []).filter((s: any) => (s.broadstreet_config as any)?.enabled);
    },
  });

  useEffect(() => {
    if (!plan) return;
    const displayLines = plan.lines.filter((l) => l.assignment_kind === 'display_ad');
    const start = defaultStartDate || plan.invoice.txn_date || new Date().toISOString().slice(0, 10);
    setRows(displayLines.map((l) => {
      // Prefer the plan's site match, but only if that site is Broadstreet-enabled
      const planSiteOk = l.site_id && (bsSites ?? []).some((s: any) => s.id === l.site_id);
      return {
        lineKey: l.line_key,
        productName: l.product_name,
        siteId: planSiteOk ? l.site_id : null,
        adType: inferAdType(l.product_name),
        startDate: start,
        infinite: true,
        endDate: '',
        notify: false,
        status: 'idle' as const,
        campaigns: [],
      };
    }));
  }, [plan, bsSites, defaultStartDate]);

  const updateRow = (key: string, patch: Partial<AdRow>) => {
    setRows((arr) => arr.map((r) => (r.lineKey === key ? { ...r, ...patch } : r)));
  };

  const pendingRows = rows.filter((r) => r.status !== 'done');
  const rowBlockers = pendingRows.flatMap((r) => {
    const b: string[] = [];
    if (!r.siteId) b.push(`"${r.productName}" — pick a site`);
    if (!r.adType) b.push(`"${r.productName}" — pick an ad type`);
    if (!r.infinite && !r.endDate) b.push(`"${r.productName}" — set an end date or mark ongoing`);
    return b;
  });
  const canSubmit = !!linkedOrgId && pendingRows.length > 0 && rowBlockers.length === 0 && !submitting;

  const campaignCount = (r: AdRow) => (r.adType === 'both' ? 2 : 1);
  const totalToCreate = pendingRows.reduce((s, r) => s + campaignCount(r), 0);

  const submit = async () => {
    if (!linkedOrgId) return;
    setSubmitting(true);
    const allCreated: ProvisionedCampaign[] = [];

    try {
      for (const row of rows) {
        if (row.status === 'done') continue;
        updateRow(row.lineKey, { status: 'creating', error: undefined });

        const adTypes: Array<'billboard' | 'skyscraper'> =
          row.adType === 'both' ? ['billboard', 'skyscraper'] : [row.adType as 'billboard' | 'skyscraper'];
        const siteName = (bsSites ?? []).find((s: any) => s.id === row.siteId)?.name ?? null;
        const rowCampaigns: ProvisionedCampaign[] = [...row.campaigns];

        try {
          for (const adType of adTypes) {
            // Skip ad types already created on a previous partial run
            if (rowCampaigns.some((c) => c.ad_type === adType)) continue;

            const { data, error } = await supabase.functions.invoke('broadstreet-api', {
              body: {
                action: 'create-campaign',
                organizationId: linkedOrgId,
                siteId: row.siteId,
                adType,
                startDate: row.startDate,
                endDate: row.infinite ? null : row.endDate || null,
                notifyClient: row.notify,
              },
            });
            if (error) throw new Error(error.message);
            if (!data?.success) throw new Error(data?.error || 'Campaign creation failed');

            rowCampaigns.push({
              local_id: data.localCampaignId ?? null,
              broadstreet_id: data.campaignId,
              name: data.campaignName,
              ad_type: adType,
              site_name: siteName,
            });
          }
          updateRow(row.lineKey, { status: 'done', campaigns: rowCampaigns });
          allCreated.push(...rowCampaigns.filter((c) => !row.campaigns.includes(c)));
        } catch (err: any) {
          // Keep successes so a retry only re-runs what failed
          updateRow(row.lineKey, {
            status: 'error',
            error: err.message || 'Unknown error',
            campaigns: rowCampaigns,
          });
          allCreated.push(...rowCampaigns.filter((c) => !row.campaigns.includes(c)));
        }
      }

      if (allCreated.length > 0) {
        toast.success(`${allCreated.length} display campaign${allCreated.length === 1 ? '' : 's'} created`);
        onProvisioned?.(allCreated);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5" />
            Provision display ad campaigns
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Creates Broadstreet campaigns for the display ad products on this deal. Clients are
            not notified unless you turn it on per campaign.
          </p>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading deal products…
          </div>
        )}

        {!linkedOrgId && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              This deal's organization isn't linked to an admin client yet. Complete the client
              step first — campaigns are created under the admin client's Broadstreet advertiser.
            </span>
          </div>
        )}

        {plan && rows.length === 0 && !isLoading && (
          <div className="text-sm text-muted-foreground py-4">
            No display ad products on this deal.
          </div>
        )}

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.lineKey}
              className={`rounded-md border p-3 space-y-2 ${row.status === 'done' ? 'opacity-80 bg-muted/20' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm truncate">{row.productName}</div>
                {row.status === 'done' && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Created
                  </Badge>
                )}
                {row.status === 'error' && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" /> Failed
                  </Badge>
                )}
                {row.status === 'creating' && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>

              {row.status !== 'done' && (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="grid gap-1">
                      <Label className="text-xs">Site</Label>
                      <Select
                        value={row.siteId ?? ''}
                        onValueChange={(v) => updateRow(row.lineKey, { siteId: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          {(bsSites ?? []).map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Ad type</Label>
                      <Select
                        value={row.adType}
                        onValueChange={(v) => updateRow(row.lineKey, { adType: v as AdTypeChoice })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="billboard">Billboard</SelectItem>
                          <SelectItem value="skyscraper">Skyscraper</SelectItem>
                          <SelectItem value="both">Both (2 campaigns)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Start date</Label>
                      <Input
                        type="date"
                        value={row.startDate}
                        onChange={(e) => updateRow(row.lineKey, { startDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={row.infinite}
                        onCheckedChange={(v) => updateRow(row.lineKey, { infinite: !!v })}
                      />
                      <span className="text-xs">Ongoing (no end date)</span>
                    </label>
                    {!row.infinite && (
                      <Input
                        type="date"
                        className="w-40 h-8"
                        value={row.endDate}
                        onChange={(e) => updateRow(row.lineKey, { endDate: e.target.value })}
                      />
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={row.notify}
                        onCheckedChange={(v) => updateRow(row.lineKey, { notify: !!v })}
                      />
                      <span className="text-xs">Notify client</span>
                    </label>
                  </div>
                </>
              )}

              {row.campaigns.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {row.campaigns.map((c) => (
                    <div key={c.broadstreet_id}>✓ {c.name}</div>
                  ))}
                </div>
              )}
              {row.error && (
                <div className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {row.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {rowBlockers.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            Resolve before continuing: {rowBlockers.join(' · ')}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {rows.some((r) => r.status === 'done') ? 'Done' : 'Cancel'}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create {totalToCreate} campaign{totalToCreate === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
