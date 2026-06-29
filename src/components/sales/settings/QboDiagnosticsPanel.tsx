import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQboDiagnostics, type QboDiagAction, type QboDiagPayload } from '@/hooks/useQboDiagnostics';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type RunResult = {
  ok: boolean;
  ms?: number;
  data?: any;
  error?: string;
  at: string;
};

type CreatedEntity = {
  type: 'Customer' | 'Item' | 'Invoice';
  Id: string;
  SyncToken: string;
  label: string;
};

interface Props {
  canEdit: boolean;
}

export function QboDiagnosticsPanel({ canEdit }: Props) {
  const diag = useQboDiagnostics();
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [sql, setSql] = useState("SELECT * FROM CompanyInfo");
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [created, setCreated] = useState<CreatedEntity[]>([]);

  const run = async (key: string, payload: QboDiagPayload) => {
    try {
      const data = await diag.mutateAsync(payload);
      setResults((r) => ({
        ...r,
        [key]: {
          ok: !!data?.ok,
          ms: data?.ms,
          data,
          error: data?.error ?? data?.result?.error,
          at: new Date().toLocaleTimeString(),
        },
      }));
      return data;
    } catch (e: any) {
      setResults((r) => ({
        ...r,
        [key]: { ok: false, error: e?.message ?? String(e), at: new Date().toLocaleTimeString() },
      }));
      throw e;
    }
  };

  const trackEntity = (data: any, type: CreatedEntity['type'], labelKey: string) => {
    const ent = data?.entity;
    if (!ent?.Id) return;
    setCreated((arr) => [
      { type, Id: ent.Id, SyncToken: String(ent.SyncToken ?? '0'), label: ent[labelKey] ?? ent.Id },
      ...arr,
    ]);
  };

  const cleanup = async (e: CreatedEntity) => {
    try {
      await run(`cleanup-${e.type}-${e.Id}`, {
        action: 'delete-test-entity',
        entity_type: e.type,
        entity_id: e.Id,
        sync_token: e.SyncToken,
      });
      setCreated((arr) => arr.filter((x) => !(x.type === e.type && x.Id === e.Id)));
      toast.success(`${e.type} ${e.Id} cleaned up`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Cleanup failed');
    }
  };

  const ResultBadge = ({ k }: { k: string }) => {
    const r = results[k];
    if (!r) return null;
    return (
      <Badge variant={r.ok ? 'default' : 'destructive'} className="ml-2 gap-1">
        {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {r.ok ? `OK${r.ms != null ? ` · ${r.ms}ms` : ''}` : 'FAIL'}
      </Badge>
    );
  };

  const ResultBlock = ({ k }: { k: string }) => {
    const r = results[k];
    if (!r) return null;
    return (
      <div className="mt-2 rounded-md border bg-muted/30 p-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{r.at}</span>
          {r.error && <span className="text-destructive">{r.error}</span>}
        </div>
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(r.data ?? r, null, 2)}
        </pre>
      </div>
    );
  };

  const Btn = ({
    k, label, payload, variant = 'outline', after,
  }: {
    k: string;
    label: string;
    payload: QboDiagPayload;
    variant?: 'default' | 'outline' | 'destructive' | 'secondary';
    after?: (data: any) => void;
  }) => (
    <div className="space-y-1">
      <div className="flex items-center">
        <Button
          size="sm"
          variant={variant}
          disabled={!canEdit || diag.isPending}
          onClick={async () => {
            const data = await run(k, payload).catch(() => null);
            if (data && after) after(data);
          }}
        >
          {diag.isPending && diag.variables?.action === payload.action ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : null}
          {label}
        </Button>
        <ResultBadge k={k} />
      </div>
      <ResultBlock k={k} />
    </div>
  );

  const env = results['env-info']?.data?.environment;
  const accounts = results['list-accounts']?.data?.accounts ?? [];
  const lastCustomer = created.find((c) => c.type === 'Customer');
  const lastItem = created.find((c) => c.type === 'Item');

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>QuickBooks diagnostics</AlertTitle>
        <AlertDescription>
          Use these tools to verify the connection, inspect data, and exercise the
          create/void flows. Test entities you create here can be cleaned up from the
          "Created entities" list at the bottom.
          {env && (
            <span className="ml-2">
              Connected to <Badge variant={env === 'sandbox' ? 'secondary' : 'default'}>{env}</Badge>
            </span>
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Connectivity</CardTitle>
          <CardDescription>Verify auth and basic API reachability.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Btn k="env-info" label="Show environment & token state" payload={{ action: 'env-info' }} />
          <Btn k="token-refresh" label="Force access-token refresh" payload={{ action: 'token-refresh' }} />
          <Btn k="ping" label="Ping (count customers)" payload={{ action: 'ping' }} />
          <Btn k="company-info" label="Get company info" payload={{ action: 'company-info' }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Read tests</CardTitle>
          <CardDescription>List recent records of each entity type.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Btn k="list-accounts" label="List income accounts" payload={{ action: 'list-accounts' }} />
          <Btn k="list-customers" label="List customers (25)" payload={{ action: 'list-customers' }} />
          <Btn k="list-items" label="List items (25)" payload={{ action: 'list-items' }} />
          <Btn k="list-invoices" label="List invoices (25)" payload={{ action: 'list-invoices' }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Custom query</CardTitle>
          <CardDescription>Run a read-only QBO SQL query (SELECT only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            rows={3}
            className="font-mono text-xs"
            placeholder="SELECT * FROM CompanyInfo"
          />
          <Button
            size="sm"
            disabled={!canEdit || diag.isPending}
            onClick={() => run('query', { action: 'query', sql })}
          >
            Run query
          </Button>
          <ResultBadge k="query" />
          <ResultBlock k="query" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">4. Write tests</CardTitle>
          <CardDescription>
            Create disposable Customer/Item/Invoice records. Use the cleanup buttons
            below to void/deactivate them when done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Btn
            k="create-customer"
            label="Create test customer"
            variant="secondary"
            payload={{ action: 'create-test-customer' }}
            after={(d) => trackEntity(d, 'Customer', 'DisplayName')}
          />

          <Separator />

          <div className="space-y-2">
            <Label>Income account ID (required for item creation)</Label>
            <div className="flex gap-2">
              <Input
                value={incomeAccountId}
                onChange={(e) => setIncomeAccountId(e.target.value)}
                placeholder="e.g. 79"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || diag.isPending}
                onClick={() => run('list-accounts', { action: 'list-accounts' })}
              >
                Reload accounts
              </Button>
            </div>
            {accounts.length > 0 && (
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="mb-1 font-medium">Income / revenue accounts:</div>
                <div className="grid gap-1">
                  {accounts
                    .filter((a: any) =>
                      ['Income', 'Other Income', 'Revenue'].includes(a.AccountType) ||
                      a.Classification === 'Revenue',
                    )
                    .slice(0, 20)
                    .map((a: any) => (
                      <button
                        key={a.Id}
                        type="button"
                        className="flex justify-between gap-2 rounded px-1 text-left hover:bg-muted"
                        onClick={() => setIncomeAccountId(a.Id)}
                      >
                        <span className="truncate">
                          {a.Name}{' '}
                          <span className="text-muted-foreground">
                            ({a.AccountType}/{a.AccountSubType})
                          </span>
                        </span>
                        <code className="text-muted-foreground">#{a.Id}</code>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <Btn
            k="create-item"
            label="Create test item ($9.99 service)"
            variant="secondary"
            payload={{ action: 'create-test-item', income_account_id: incomeAccountId }}
            after={(d) => trackEntity(d, 'Item', 'Name')}
          />

          <Separator />

          <div className="text-xs text-muted-foreground">
            Last created customer:{' '}
            <code>{lastCustomer ? `${lastCustomer.label} (#${lastCustomer.Id})` : '—'}</code>
            <br />
            Last created item:{' '}
            <code>{lastItem ? `${lastItem.label} (#${lastItem.Id})` : '—'}</code>
          </div>

          <Btn
            k="create-invoice"
            label="Create test invoice (uses last customer + item)"
            variant="secondary"
            payload={{
              action: 'create-test-invoice',
              customer_id: lastCustomer?.Id ?? '',
              item_id: lastItem?.Id ?? '',
            }}
            after={(d) => trackEntity(d, 'Invoice', 'DocNumber')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">5. Created entities</CardTitle>
          <CardDescription>
            Clean up any test data created above. Invoices are voided; customers and
            items are deactivated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {created.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test entities created yet.</p>
          ) : (
            <div className="space-y-2">
              {created.map((e) => (
                <div
                  key={`${e.type}-${e.Id}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <Badge variant="outline" className="mr-2">{e.type}</Badge>
                    {e.label} <span className="text-muted-foreground">#{e.Id}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEdit || diag.isPending}
                    onClick={() => cleanup(e)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Cleanup
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
