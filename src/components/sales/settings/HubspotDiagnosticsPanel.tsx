import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, Loader2, ChevronDown, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useHubspotDiagnostics, type HsDiagEntity, type HsDiagResult } from '@/hooks/useHubspotDiagnostics';

interface Props {
  canEdit: boolean;
}

const ENTITIES: { key: HsDiagEntity; label: string; description: string }[] = [
  { key: 'company',   label: 'Company',   description: 'Create → read → update → read → archive a company.' },
  { key: 'contact',   label: 'Contact',   description: 'Create → read → update → read → archive a contact.' },
  { key: 'deal',      label: 'Deal',      description: 'Creates company + contact, associates them to a deal, updates, then archives all three.' },
  { key: 'line_item', label: 'Line Item', description: 'Create → read → update → read → archive a line item.' },
  { key: 'note',      label: 'Note',      description: 'Create → read → update → read → archive a note engagement.' },
  { key: 'task',      label: 'Task',      description: 'Create → read → update → read → archive a task engagement.' },
];

export function HubspotDiagnosticsPanel({ canEdit }: Props) {
  const diag = useHubspotDiagnostics();
  const [results, setResults] = useState<Record<string, HsDiagResult>>({});
  const [running, setRunning] = useState<string | null>(null);

  const run = async (key: string, payload: Parameters<typeof diag.mutateAsync>[0]) => {
    setRunning(key);
    try {
      const r = await diag.mutateAsync(payload);
      setResults((prev) => ({ ...prev, [key]: r }));
      if (r.ok) toast.success(`${key}: success`);
      else toast.error(`${key}: ${r.summary ?? r.error ?? 'failed'}`);
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [key]: { ok: false, error: e?.message ?? String(e) } }));
      toast.error(`${key}: ${e?.message ?? 'failed'}`);
    } finally {
      setRunning(null);
    }
  };

  if (!canEdit) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>You don't have permission to run HubSpot diagnostics.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>Verify the HubSpot connector is reachable.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            onClick={() => run('ping', { action: 'ping' })}
            disabled={running !== null}
            variant="outline"
          >
            {running === 'ping' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Ping HubSpot
          </Button>
          <ResultBadge result={results['ping']} />
          <div className="flex-1" />
          <Button
            onClick={() => run('cleanup', { action: 'cleanup-orphans' })}
            disabled={running !== null}
            variant="outline"
          >
            {running === 'cleanup' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Cleanup orphans
          </Button>
        </CardContent>
        {results['ping']?.response ? (
          <CardContent className="pt-0">
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(results['ping'].response, null, 2)}
            </pre>
          </CardContent>
        ) : null}
        {results['cleanup'] ? (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-1">
              Archived: {Object.entries(results['cleanup'].archived ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')}
            </p>
            {(results['cleanup'].errors ?? []).length > 0 && (
              <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(results['cleanup'].errors, null, 2)}
              </pre>
            )}
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTITIES.map((ent) => {
          const result = results[ent.key];
          const isRunning = running === ent.key;
          return (
            <Card key={ent.key}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{ent.label}</CardTitle>
                    <CardDescription>{ent.description}</CardDescription>
                  </div>
                  <ResultBadge result={result} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => run(ent.key, { action: 'roundtrip', entity: ent.key })}
                  disabled={running !== null}
                  size="sm"
                >
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Run round-trip
                </Button>

                {result && (
                  <div className="space-y-2">
                    {result.summary && (
                      <p className={`text-sm ${result.ok ? 'text-foreground' : 'text-destructive'}`}>
                        {result.summary}
                      </p>
                    )}
                    {result.created_id && (
                      <p className="text-xs text-muted-foreground">Created id: {result.created_id} • Cleaned up: {result.cleaned_up ? 'yes' : 'no'}</p>
                    )}
                    {result.created_ids && (
                      <p className="text-xs text-muted-foreground">
                        Created: {Object.entries(result.created_ids).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}
                        {' '}• Cleaned up: {result.cleaned_up ? 'yes' : 'no'}
                      </p>
                    )}
                    {result.error && !result.steps && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{result.error}</AlertDescription>
                      </Alert>
                    )}
                    {result.steps && (
                      <div className="space-y-1">
                        {result.steps.map((s, i) => (
                          <Collapsible key={i}>
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center gap-2 text-sm py-1 px-2 hover:bg-muted rounded text-left">
                                {s.ok ? (
                                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                )}
                                <span className="flex-1">{s.name}</span>
                                <span className="text-xs text-muted-foreground">{s.status ?? '–'} • {s.ms}ms</span>
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="pl-6 pr-2 py-2 space-y-2">
                                {s.error && (
                                  <p className="text-xs text-destructive">{s.error}</p>
                                )}
                                {s.request !== undefined && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Request</p>
                                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(s.request, null, 2)}</pre>
                                  </div>
                                )}
                                {s.response !== undefined && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Response</p>
                                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(s.response, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ResultBadge({ result }: { result?: HsDiagResult }) {
  if (!result) return null;
  if (result.ok) return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Pass</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Fail</Badge>;
}
