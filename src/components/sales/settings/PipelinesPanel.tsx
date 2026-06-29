import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Star, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCrmPipelines, useCrmStages } from '@/hooks/useCrmPipeline';
import { StageEditor } from './StageEditor';

interface Props {
  canEdit: boolean;
}

export function PipelinesPanel({ canEdit }: Props) {
  const qc = useQueryClient();
  const { data: pipelines = [] } = useCrmPipelines();
  const [activeId, setActiveId] = useState<string | null>(null);
  const pipelineId = activeId ?? pipelines[0]?.id ?? null;
  const { data: stages = [] } = useCrmStages(pipelineId ?? undefined);

  const renamePipeline = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('crm_pipelines').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('crm_pipelines').update({ is_default: false }).neq('id', id);
      const { error } = await supabase.from('crm_pipelines').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const addPipeline = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('crm_pipelines')
        .insert({ name: 'New pipeline', sort_order: pipelines.length })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] });
      setActiveId(d.id);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_pipelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] });
      setActiveId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addStage = useMutation({
    mutationFn: async () => {
      if (!pipelineId) return;
      const { error } = await supabase.from('crm_pipeline_stages').insert({
        pipeline_id: pipelineId,
        name: 'New stage',
        sort_order: stages.length,
        win_probability: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'stages'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, sort_order }: { id: string; sort_order: number }) => {
      const { error } = await supabase
        .from('crm_pipeline_stages')
        .update({ sort_order })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'stages'] }),
  });

  const handleMove = async (idx: number, dir: -1 | 1) => {
    const target = stages[idx + dir];
    const current = stages[idx];
    if (!target || !current) return;
    await Promise.all([
      reorder.mutateAsync({ id: current.id, sort_order: target.sort_order }),
      reorder.mutateAsync({ id: target.id, sort_order: current.sort_order }),
    ]);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Pipelines</h3>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => addPipeline.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="space-y-1">
          {pipelines.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={`w-full flex items-center justify-between rounded-md border p-2 text-left hover:bg-muted/50 ${
                pipelineId === p.id ? 'bg-muted' : ''
              }`}
            >
              <span className="text-sm">{p.name}</span>
              {p.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {pipelineId && pipelines.find((p) => p.id === pipelineId) && (
          <>
            <div className="flex items-center gap-2">
              <Input
                value={pipelines.find((p) => p.id === pipelineId)!.name}
                disabled={!canEdit}
                onChange={(e) => renamePipeline.mutate({ id: pipelineId, name: e.target.value })}
                className="max-w-sm"
              />
              {canEdit && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDefault.mutate(pipelineId)}
                    disabled={pipelines.find((p) => p.id === pipelineId)?.is_default}
                  >
                    <Star className="h-4 w-4 mr-1" /> Set default
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deletePipeline.mutate(pipelineId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Stages</h4>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => addStage.mutate()}>
                    <Plus className="h-4 w-4 mr-1" /> Add stage
                  </Button>
                )}
              </div>
              {stages.map((s, i) => (
                <StageEditor
                  key={s.id}
                  stage={s as any}
                  canEdit={canEdit}
                  isFirst={i === 0}
                  isLast={i === stages.length - 1}
                  onMove={(dir) => handleMove(i, dir)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
