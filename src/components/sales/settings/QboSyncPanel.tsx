import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Search, FileClock, Users, Plug } from 'lucide-react';
import {
  useQboIncomeAccounts,
  useQboSettings,
  useUpdateQboSettings,
  useQboMatchProducts,
  useQboLinkProduct,
  useQboUpdateProducts,
  useQboSyncRuns,
  type QboMatchResult,
} from '@/hooks/useQboProductSync';
import { useQboRefreshAllBalances } from '@/hooks/useQboCustomerSync';
import { formatDistanceToNow, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function QboSyncPanel({ canEdit }: { canEdit: boolean }) {
  const { data: settings, isLoading: settingsLoading } = useQboSettings();
  const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts, error: accountsError } = useQboIncomeAccounts(true);
  const updateSettings = useUpdateQboSettings();
  const match = useQboMatchProducts();
  const link = useQboLinkProduct();
  
  const update = useQboUpdateProducts();
  const refreshBalances = useQboRefreshAllBalances();
  const { data: runs = [] } = useQboSyncRuns(15);

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchData, setMatchData] = useState<QboMatchResult | null>(null);
  const [acctSelection, setAcctSelection] = useState<string | undefined>();
  const [connecting, setConnecting] = useState(false);

  const selectedAcctId = acctSelection ?? settings?.default_income_account_id;

  const handleConnectQbo = async () => {
    setConnecting(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You must be signed in');
      const returnTo = `${window.location.origin}${window.location.pathname}`;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/qbo-oauth?action=start&return_to=${encodeURIComponent(returnTo)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to start QuickBooks connection');
      window.location.href = payload.auth_url as string;
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  };

  const handleSaveAccount = () => {
    if (!selectedAcctId || !accounts) return;
    const acct = accounts.find((a) => a.id === selectedAcctId);
    if (!acct) return;
    updateSettings.mutate({
      ...(settings ?? {}),
      default_income_account_id: acct.id,
      default_income_account_name: acct.name,
    });
  };

  const runMatch = async () => {
    const result = await match.mutateAsync();
    setMatchData(result);
    setMatchOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>QuickBooks Online</CardTitle>
          <CardDescription>
            Push CRM product names, descriptions and prices to QBO. Local DB is the source of truth — changes flow one-way to QBO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border rounded-md p-3 bg-muted/30 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Connection</p>
              <p className="text-xs text-muted-foreground">
                Authorize this app with your QuickBooks Online company. Use this after rotating client credentials or to switch the connected company.
              </p>
            </div>
            <Button onClick={handleConnectQbo} disabled={!canEdit || connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
              Connect QuickBooks Online
            </Button>
          </div>

          <div className="grid gap-2 max-w-xl">
            <Label>Default income account (used for new QBO items)</Label>
            <div className="flex gap-2">
              <Select
                value={selectedAcctId}
                onValueChange={setAcctSelection}
                disabled={!canEdit || accountsLoading || settingsLoading || !!accountsError}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={accountsLoading ? 'Loading accounts…' : accountsError ? 'Failed to load accounts' : 'Select an income account'} />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.subType ? ` — ${a.subType}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetchAccounts()} disabled={accountsLoading}>
                <RefreshCw className={`h-4 w-4 ${accountsLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button onClick={handleSaveAccount} disabled={!canEdit || !selectedAcctId || selectedAcctId === settings?.default_income_account_id || updateSettings.isPending}>
                Save
              </Button>
            </div>
            {settings?.default_income_account_name && (
              <p className="text-xs text-muted-foreground">
                Currently saved: <strong>{settings.default_income_account_name}</strong>
              </p>
            )}
            {accountsError && (
              <p className="text-xs text-destructive">
                {(accountsError as Error).message}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runMatch} disabled={!canEdit || match.isPending}>
              {match.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              Match existing QBO items
            </Button>
            <Button
              variant="outline"
              onClick={() => update.mutate({})}
              disabled={!canEdit || update.isPending}
            >
              {update.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sync price/name updates
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2 flex items-center gap-2"><Users className="h-4 w-4" /> Customer balances</p>
            <p className="text-xs text-muted-foreground mb-3">
              Link organizations to QBO customers from each organization's detail panel. Use the buttons below to refresh cached balances.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!canEdit || refreshBalances.isPending}
                onClick={() => refreshBalances.mutate({ only_active: true })}
              >
                {refreshBalances.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Refresh active customers
              </Button>
              <Button
                variant="ghost"
                disabled={!canEdit || refreshBalances.isPending}
                onClick={() => refreshBalances.mutate({ only_active: false })}
              >
                Refresh all linked
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="h-4 w-4" />
            Recent QBO sync activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No QBO sync runs yet.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border rounded-md p-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
                      <Badge variant={r.status === 'success' ? 'default' : r.status === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {r.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {format(new Date(r.started_at), 'MMM d, h:mm a')} · {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </span>
                    </div>
                    {r.error && <p className="text-xs text-destructive mt-1 truncate">{r.error}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.matched_count ? `${r.matched_count} matched · ` : ''}
                    {r.created_count ? `${r.created_count} created · ` : ''}
                    {r.updated_count ? `${r.updated_count} updated · ` : ''}
                    {r.unchanged_count ? `${r.unchanged_count} unchanged · ` : ''}
                    {r.error_count ? `${r.error_count} errors` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MatchResultsDialog
        open={matchOpen}
        onOpenChange={setMatchOpen}
        data={matchData}
        onLink={(product_id, qbo_item_id) => link.mutate({ product_id, qbo_item_id })}
        linking={link.isPending}
      />
    </div>
  );
}

function MatchResultsDialog({
  open, onOpenChange, data, onLink, linking,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: QboMatchResult | null;
  onLink: (product_id: string, qbo_item_id: string) => void;
  linking: boolean;
}) {
  const exact = data?.exact ?? [];
  const fuzzy = data?.fuzzy ?? [];
  const fmt = useMemo(() => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match candidates</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <section>
            <h3 className="font-medium mb-2">Exact name matches ({exact.length})</h3>
            {exact.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exact matches found.</p>
            ) : (
              <div className="space-y-2">
                {exact.map((m) => (
                  <div key={m.product_id} className="flex items-center justify-between border rounded-md p-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{m.product_name}</div>
                      <div className="text-xs text-muted-foreground">↔ {m.qbo_name} · {fmt.format(m.qbo_price)}</div>
                    </div>
                    <Button size="sm" disabled={linking} onClick={() => onLink(m.product_id, m.qbo_item_id)}>Link</Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-medium mb-2">Likely matches ({fuzzy.length})</h3>
            {fuzzy.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fuzzy candidates.</p>
            ) : (
              <div className="space-y-3">
                {fuzzy.map((row) => (
                  <div key={row.product_id} className="border rounded-md p-2">
                    <div className="font-medium text-sm">{row.product_name}</div>
                    <div className="mt-2 space-y-1">
                      {row.suggestions.map((s) => (
                        <div key={s.qbo_item_id} className="flex items-center justify-between text-sm">
                          <div className="text-muted-foreground">
                            {s.qbo_name} · {fmt.format(s.qbo_price)} <Badge variant="outline" className="ml-1 text-[10px]">{s.score}%</Badge>
                          </div>
                          <Button size="sm" variant="outline" disabled={linking} onClick={() => onLink(row.product_id, s.qbo_item_id)}>Link</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
