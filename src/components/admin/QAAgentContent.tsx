import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Globe, Image, Mail, EyeOff, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface CheckItem {
  name: string;
  pass: boolean;
  expected: any;
  actual: any;
}

interface QACheck {
  id: string;
  entity_type: string;
  entity_id: string;
  external_id: string | null;
  site_id: string | null;
  status: string;
  checks: CheckItem[];
  error_message: string | null;
  checked_at: string;
  is_dismissed: boolean;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: 'text-primary', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-destructive', label: 'Fail' },
  error: { icon: AlertTriangle, color: 'text-muted-foreground', label: 'Error' },
  pending: { icon: RefreshCw, color: 'text-muted-foreground', label: 'Pending' },
};

const ENTITY_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  wordpress_post: { label: 'WP Post', icon: Globe },
  beehiiv_blast: { label: 'Email Blast', icon: Mail },
  broadstreet_ad: { label: 'Display Ad', icon: Image },
};

export function QAAgentContent() {
  const [checks, setChecks] = useState<QACheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entityNames, setEntityNames] = useState<Record<string, string>>({});
  const [qaEnabled, setQaEnabled] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [totalActiveIssues, setTotalActiveIssues] = useState(0);
  const [dismissingAll, setDismissingAll] = useState(false);

  const fetchActiveIssueCount = async () => {
    const { count, error } = await supabase
      .from('qa_checks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['fail', 'error'])
      .eq('is_dismissed', false);

    if (!error) {
      setTotalActiveIssues(count || 0);
    }
  };

  const fetchChecks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('qa_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      const typedData = data.map(row => ({
        ...row,
        checks: (row.checks as unknown as CheckItem[]) || [],
        is_dismissed: row.is_dismissed ?? false,
      }));
      // Sort: undismissed first, then fail/error before pass, then by date
      typedData.sort((a, b) => {
        if (a.is_dismissed !== b.is_dismissed) return a.is_dismissed ? 1 : -1;
        const statusOrder: Record<string, number> = { fail: 0, error: 1, pending: 2, pass: 3 };
        const aOrder = statusOrder[a.status] ?? 2;
        const bOrder = statusOrder[b.status] ?? 2;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime();
      });
      setChecks(typedData);
      resolveEntityNames(typedData);
    }
    setLoading(false);
  };

  const refreshChecks = async () => {
    await Promise.all([fetchChecks(), fetchActiveIssueCount()]);
  };

  const fetchToggle = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'qa_agent_enabled')
      .maybeSingle();
    setQaEnabled((data?.value as any)?.enabled !== false);
  };

  const resolveEntityNames = async (qaChecks: QACheck[]) => {
    const postIds = qaChecks.filter(c => c.entity_type === 'wordpress_post').map(c => c.entity_id);
    const blastIds = qaChecks.filter(c => c.entity_type === 'beehiiv_blast').map(c => c.entity_id);
    const adIds = qaChecks.filter(c => c.entity_type === 'broadstreet_ad').map(c => c.entity_id);
    const names: Record<string, string> = {};

    if (postIds.length > 0) {
      const { data: posts } = await supabase.from('posts').select('id, headline').in('id', postIds);
      (posts || []).forEach(p => { names[p.id] = p.headline; });
    }

    if (blastIds.length > 0) {
      const { data: blasts } = await supabase.from('email_blasts').select('id, title').in('id', blastIds);
      (blasts || []).forEach(b => { names[b.id] = b.title; });
    }

    if (adIds.length > 0) {
      const { data: placements } = await supabase.from('display_ad_placements').select('id, ad_name').in('id', adIds);
      (placements || []).forEach(p => { names[p.id] = p.ad_name; });
    }

    setEntityNames(names);
  };

  useEffect(() => {
    refreshChecks();
    fetchToggle();

    const channel = supabase
      .channel('qa-agent-content')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qa_checks' },
        () => {
          refreshChecks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleQaEnabled = async (enabled: boolean) => {
    setTogglingEnabled(true);
    const { error } = await supabase
      .from('admin_settings')
      .update({ value: { enabled } as any })
      .eq('key', 'qa_agent_enabled');
    if (!error) {
      setQaEnabled(enabled);
      toast({ title: `QA Agent ${enabled ? 'enabled' : 'disabled'}` });
    }
    setTogglingEnabled(false);
  };

  const recheckOne = async (check: QACheck) => {
    setRecheckingId(check.id);
    try {
      const { error } = await supabase.functions.invoke('qa-agent', {
        body: { action: 'run_check', entity_type: check.entity_type, entity_id: check.entity_id },
      });
      if (error) throw error;
      await refreshChecks();
    } catch (e: any) {
      toast({ title: 'Re-check Error', description: e.message, variant: 'destructive' });
    }
    setRecheckingId(null);
  };

  const dismissOne = async (id: string) => {
    const { error } = await supabase.from('qa_checks').update({ is_dismissed: true }).eq('id', id);
    if (error) {
      toast({ title: 'Dismiss Error', description: error.message, variant: 'destructive' });
      return;
    }
    await refreshChecks();
  };

  const undismissOne = async (id: string) => {
    const { error } = await supabase.from('qa_checks').update({ is_dismissed: false }).eq('id', id);
    if (error) {
      toast({ title: 'Un-dismiss Error', description: error.message, variant: 'destructive' });
      return;
    }
    await refreshChecks();
  };

  const dismissAll = async () => {
    if (totalActiveIssues === 0) return;

    setDismissingAll(true);
    const { error } = await supabase
      .from('qa_checks')
      .update({ is_dismissed: true })
      .in('status', ['fail', 'error'])
      .eq('is_dismissed', false);

    if (error) {
      toast({ title: 'Dismiss All Error', description: error.message, variant: 'destructive' });
      setDismissingAll(false);
      return;
    }

    await refreshChecks();
    toast({ title: `Dismissed ${totalActiveIssues} issue(s)` });
    setDismissingAll(false);
  };

  const filtered = checks.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (typeFilter !== 'all' && c.entity_type !== typeFilter) return false;
    return true;
  });

  const activeIssues = filtered.filter(c => !c.is_dismissed && (c.status === 'fail' || c.status === 'error'));
  const hiddenActiveIssues = Math.max(totalActiveIssues - activeIssues.length, 0);
  const statusCounts = {
    all: checks.length,
    pass: checks.filter(c => c.status === 'pass').length,
    fail: checks.filter(c => c.status === 'fail').length,
    error: checks.filter(c => c.status === 'error').length,
  };

  const renderCheckRow = (check: QACheck) => {
    const statusConfig = STATUS_CONFIG[check.status] || STATUS_CONFIG.pending;
    const StatusIcon = statusConfig.icon;
    const entityConfig = ENTITY_LABELS[check.entity_type] || { label: check.entity_type, icon: Globe };
    const EntityIcon = entityConfig.icon;
    const isExpanded = expandedId === check.id;
    const failedChecks = check.checks.filter(c => !c.pass);

    const hasMeaningfulWhitespace = (value: string) =>
      value !== value.trim() || /\s{2,}/.test(value) || value.includes('\u00A0') || /[\n\r\t]/.test(value);

    const makeWhitespaceVisible = (value: string) =>
      value
        .replace(/ /g, '·')
        .replace(/\u00A0/g, '⍽')
        .replace(/\t/g, '⇥')
        .replace(/\r/g, '↩')
        .replace(/\n/g, '↵');

    const fmt = (value: any) => {
      if (value === null || value === undefined || value === '') return '(none)';
      if (typeof value !== 'string') return String(value);
      return hasMeaningfulWhitespace(value)
        ? `${makeWhitespaceVisible(value)} [whitespace visible]`
        : value;
    };

    return (
      <Collapsible key={check.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : check.id)} asChild>
        <>
          <CollapsibleTrigger asChild>
            <TableRow className={`cursor-pointer ${check.is_dismissed ? 'opacity-50' : ''}`}>
              <TableCell>
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <EntityIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">{entityConfig.label}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate font-medium">
                {entityNames[check.entity_id] || check.entity_id.substring(0, 8) + '...'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground font-mono">
                {check.external_id || '—'}
              </TableCell>
              <TableCell>
                <Badge variant={check.status === 'pass' ? 'default' : check.status === 'fail' ? 'destructive' : 'secondary'} className="gap-1">
                  <StatusIcon className={`h-3 w-3 ${statusConfig.color}`} />
                  {statusConfig.label}
                  {failedChecks.length > 0 && ` (${failedChecks.length})`}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(check.checked_at).toLocaleString()}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); recheckOne(check); }}
                    disabled={recheckingId === check.id}
                    title="Re-check"
                  >
                    <RefreshCw className={`h-3 w-3 ${recheckingId === check.id ? 'animate-spin' : ''}`} />
                  </Button>
                  {!check.is_dismissed && (check.status === 'fail' || check.status === 'error') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); dismissOne(check.id); }}
                      title="Dismiss"
                    >
                      <EyeOff className="h-3 w-3" />
                    </Button>
                  )}
                  {check.is_dismissed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); undismissOne(check.id); }}
                      title="Un-dismiss"
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          </CollapsibleTrigger>
          <CollapsibleContent asChild>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={7} className="p-0">
                <div className="px-6 py-4 space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Check Details — {check.checks.filter(c => c.pass).length}/{check.checks.length} passed
                  </div>

                  {check.error_message && (
                    <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">
                      <strong>Error:</strong> {check.error_message}
                    </div>
                  )}

                  <div className="space-y-2">
                    {check.checks.map((c, i) => {
                      return (
                        <div key={i} className={`rounded-md border px-3 py-2 ${!c.pass ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-background'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {c.pass
                              ? <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                              : <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                            }
                            <span className="font-medium text-sm">{c.name.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="ml-6 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                            <span className="text-muted-foreground font-medium">Expected:</span>
                            <code className="rounded bg-muted px-1 text-foreground">{fmt(c.expected)}</code>
                            <span className="text-muted-foreground font-medium">Actual:</span>
                            <code className="rounded bg-muted px-1 text-foreground">{fmt(c.actual)}</code>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t pt-2 mt-2 text-xs text-muted-foreground font-mono space-y-0.5">
                    <div>Entity ID: {check.entity_id}</div>
                    {check.external_id && <div>External ID: {check.external_id}</div>}
                    {check.site_id && <div>Site ID: {check.site_id}</div>}
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </CollapsibleContent>
        </>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={refreshChecks} disabled={loading || dismissingAll}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>

        {totalActiveIssues > 0 && (
          <Button variant="outline" size="sm" onClick={dismissAll} disabled={dismissingAll}>
            <EyeOff className="h-4 w-4 mr-2" />
            {dismissingAll ? 'Dismissing…' : `Dismiss All (${totalActiveIssues})`}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="qa-toggle"
              checked={qaEnabled}
              onCheckedChange={toggleQaEnabled}
              disabled={togglingEnabled}
            />
            <Label htmlFor="qa-toggle" className="text-sm text-muted-foreground cursor-pointer">
              Auto QA
            </Label>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({statusCounts.all})</SelectItem>
              <SelectItem value="pass">Pass ({statusCounts.pass})</SelectItem>
              <SelectItem value="fail">Fail ({statusCounts.fail})</SelectItem>
              <SelectItem value="error">Error ({statusCounts.error})</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="wordpress_post">WP Posts</SelectItem>
              <SelectItem value="beehiiv_blast">Email Blasts</SelectItem>
              <SelectItem value="broadstreet_ad">Display Ads</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{totalActiveIssues} active issue{totalActiveIssues === 1 ? '' : 's'} total</span>
        {hiddenActiveIssues > 0 && (
          <span>• {hiddenActiveIssues} outside the current 100 loaded checks</span>
        )}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          {checks.length === 0 ? 'No QA checks yet. Checks run automatically when posts are published, ads are created, or email blasts are sent.' : 'No results match the current filters.'}
        </div>
      )}

      {filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Type</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(renderCheckRow)}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
