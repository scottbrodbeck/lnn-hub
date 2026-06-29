import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  useHubspotDiscover,
  useHubspotPreview,
  useHubspotCommit,
  useHubspotDiscard,
  type DiscoverResult,
} from '@/hooks/useHubspotImport';
import { useCrmImportStaging } from '@/hooks/useCrmImportBatches';
import { useDefaultPipeline, useCrmStages } from '@/hooks/useCrmPipeline';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';

type Step = 'connect' | 'select' | 'mapping' | 'preview' | 'result';
const ENTITIES = ['companies', 'contacts', 'deals'] as const;

export function HubspotImportWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('connect');
  const [discover, setDiscover] = useState<DiscoverResult | null>(null);
  const [selected, setSelected] = useState<string[]>(['companies', 'contacts', 'deals']);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [hsPipelineId, setHsPipelineId] = useState<string>('');
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [overwritePolicy, setOverwritePolicy] = useState<{
    companies: boolean; contacts: boolean; deals: boolean; products: boolean;
  }>({ companies: false, contacts: false, deals: false, products: false });
  const [batchId, setBatchId] = useState<string | null>(null);
  const [counts, setCounts] = useState<any>(null);
  const [commitErrors, setCommitErrors] = useState<string[]>([]);

  const discoverM = useHubspotDiscover();
  const previewM = useHubspotPreview();
  const commitM = useHubspotCommit();
  const discardM = useHubspotDiscard();
  const { defaultPipeline, pipelines } = useDefaultPipeline();
  const { data: stages } = useCrmStages(pipelineId || undefined);
  const { data: users } = useSalesEligibleUsers();
  const { data: staging } = useCrmImportStaging(step === 'preview' ? batchId : null);

  useEffect(() => {
    if (open && !pipelineId && defaultPipeline) setPipelineId(defaultPipeline.id);
  }, [open, defaultPipeline, pipelineId]);

  const reset = () => {
    setStep('connect');
    setDiscover(null);
    setSelected(['companies', 'contacts', 'deals']);
    setOwnerMap({});
    setStageMap({});
    setOverwritePolicy({ companies: false, contacts: false, deals: false, products: false });
    setBatchId(null);
    setCounts(null);
    setCommitErrors([]);
  };

  const handleClose = async () => {
    if (batchId && step !== 'result') {
      await discardM.mutateAsync({ batch_id: batchId }).catch(() => {});
    }
    onOpenChange(false);
    setTimeout(reset, 300);
  };

  const runDiscover = async () => {
    try {
      const r = await discoverM.mutateAsync();
      setDiscover(r);
      if (r.hubspot_pipelines?.[0]) setHsPipelineId(r.hubspot_pipelines[0].id);
      setStep('select');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runPreview = async () => {
    try {
      const r = await previewM.mutateAsync({
        selected_entities: selected,
        owner_mapping: ownerMap,
        pipeline_id: pipelineId,
        stage_mapping: stageMap,
        hubspot_pipeline_id: hsPipelineId,
        overwrite_policy: overwritePolicy,
      });
      setBatchId(r.batch_id);
      setCounts(r.counts);
      setStep('preview');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const runCommit = async () => {
    if (!batchId) return;
    try {
      const r = await commitM.mutateAsync({ batch_id: batchId });
      setCommitErrors(r.errors || []);
      setStep('result');
      qc.invalidateQueries({ queryKey: ['crm'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const hsPipeline = discover?.hubspot_pipelines.find((p) => p.id === hsPipelineId);
  const dealsSelected = selected.includes('deals');

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>HubSpot import — {step}</DialogTitle>
        </DialogHeader>

        {step === 'connect' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              We'll fetch a count of records from HubSpot to verify the connection.
              Nothing is imported until you confirm.
            </p>
            <Button onClick={runDiscover} disabled={discoverM.isPending}>
              {discoverM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Verify HubSpot connection
            </Button>
          </div>
        )}

        {step === 'select' && discover && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Choose which records to import.</p>
            <div className="space-y-2">
              {ENTITIES.map((e) => (
                <label key={e} className="flex items-center justify-between border rounded-md p-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selected.includes(e)}
                      onCheckedChange={(v) =>
                        setSelected((s) => (v ? [...s, e] : s.filter((x) => x !== e)))
                      }
                    />
                    <span className="capitalize font-medium">{e}</span>
                  </div>
                  <Badge variant="secondary">{discover.counts[e]} in HubSpot</Badge>
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 'mapping' && discover && (
          <div className="space-y-6 py-2">
            <div className="space-y-2 border rounded-md p-3 bg-muted/30">
              <Label>Re-import behavior</Label>
              <p className="text-xs text-muted-foreground">
                Unchecked: existing records are matched and re-tagged but their fields are preserved unless empty.
                Checked: HubSpot data overwrites existing fields (notes and locally-linked org are always preserved).
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {(['companies', 'contacts', 'deals'] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={overwritePolicy[k]}
                      onCheckedChange={(v) =>
                        setOverwritePolicy((s) => ({ ...s, [k]: !!v }))
                      }
                    />
                    <span className="capitalize">Overwrite existing {k}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Owner mapping (HubSpot owner → CRM user)</Label>
              <p className="text-xs text-muted-foreground">
                Unmapped owners leave the record unassigned.
              </p>
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {discover.owners.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 p-2 text-sm">
                    <span className="flex-1 truncate">{o.name || o.email}</span>
                    <Select
                      value={ownerMap[o.id] || ''}
                      onValueChange={(v) =>
                        setOwnerMap((m) => ({ ...m, [o.id]: v }))
                      }
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="— unassigned —" />
                      </SelectTrigger>
                      <SelectContent>
                        {(users || []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {discover.owners.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No HubSpot owners found.</p>
                )}
              </div>
            </div>

            {dealsSelected && (
              <>
                <div className="space-y-2">
                  <Label>Target CRM pipeline</Label>
                  <Select value={pipelineId || ''} onValueChange={setPipelineId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(pipelines || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>HubSpot deal pipeline</Label>
                  <Select value={hsPipelineId} onValueChange={setHsPipelineId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {discover.hubspot_pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Stage mapping (HubSpot → CRM)</Label>
                  <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                    {(hsPipeline?.stages || []).map((hs) => (
                      <div key={hs.id} className="flex items-center gap-2 p-2 text-sm">
                        <span className="flex-1 truncate">{hs.label}</span>
                        <Select
                          value={stageMap[hs.id] || ''}
                          onValueChange={(v) => setStageMap((m) => ({ ...m, [hs.id]: v }))}
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="— required —" />
                          </SelectTrigger>
                          <SelectContent>
                            {(stages || []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Dry run complete. Review what will be imported. Nothing has been written to the CRM yet.
            </p>
            <Tabs defaultValue={selected[0]}>
              <TabsList>
                {selected.map((e) => (
                  <TabsTrigger key={e} value={e} className="capitalize">
                    {e}
                    {counts?.[e] && (
                      <Badge variant="secondary" className="ml-2">
                        {(counts[e].create ?? 0) + (counts[e].update ?? 0) + (counts[e].unchanged ?? 0)}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {selected.map((e) => {
                const entityKey = e === 'companies' ? 'company' : e === 'contacts' ? 'contact' : e === 'deals' ? 'deal' : 'product';
                const rows = (staging || []).filter((r: any) => r.entity_type === entityKey);
                return (
                  <TabsContent key={e} value={e} className="space-y-2">
                    <div className="flex gap-2 text-xs flex-wrap">
                      <Badge variant="outline">create: {counts?.[e]?.create ?? 0}</Badge>
                      <Badge variant="outline">update: {counts?.[e]?.update ?? 0}</Badge>
                      <Badge variant="outline" className="text-muted-foreground">unchanged: {counts?.[e]?.unchanged ?? 0}</Badge>
                      <Badge variant="outline" className="text-destructive">errors: {counts?.[e]?.error ?? 0}</Badge>
                    </div>
                    <div className="border rounded-md max-h-72 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-left">
                          <tr>
                            <th className="p-2">Name</th>
                            <th className="p-2">Action</th>
                            <th className="p-2">Errors</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 200).map((r: any) => (
                            <tr key={r.id} className="border-t">
                              <td className="p-2 truncate max-w-[280px]">
                                {r.payload?.name || r.payload?.title || r.payload?.email || r.hubspot_id}
                              </td>
                              <td className="p-2">{r.match_type}</td>
                              <td className="p-2 text-destructive">
                                {(r.errors || []).join('; ')}
                              </td>
                            </tr>
                          ))}
                          {rows.length === 0 && (
                            <tr><td className="p-3 text-muted-foreground" colSpan={3}>No rows.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}

        {step === 'result' && (
          <div className="space-y-3 py-4">
            <p className="text-sm">Import complete.</p>
            {commitErrors.length > 0 && (
              <div className="border border-destructive/30 bg-destructive/5 rounded-md p-3 text-sm space-y-1">
                <p className="font-medium text-destructive">Some rows failed:</p>
                <ul className="list-disc pl-5 text-xs">
                  {commitErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can undo this import any time from the Import history list.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'select' && (
            <>
              <Button variant="ghost" onClick={() => setStep('connect')}>Back</Button>
              <Button onClick={() => setStep('mapping')} disabled={selected.length === 0}>
                Next: Mapping
              </Button>
            </>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="ghost" onClick={() => setStep('select')}>Back</Button>
              <Button
                onClick={runPreview}
                disabled={
                  previewM.isPending ||
                  (dealsSelected && (!pipelineId || !hsPipelineId))
                }
              >
                {previewM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Run dry-run preview
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={runCommit} disabled={commitM.isPending}>
                {commitM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm &amp; import
              </Button>
            </>
          )}
          {step === 'result' && <Button onClick={handleClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
