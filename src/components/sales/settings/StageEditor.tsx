import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Stage = {
  id: string;
  pipeline_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  win_probability: number;
  is_won: boolean;
  is_lost: boolean;
};

interface Props {
  stage: Stage;
  canEdit: boolean;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function StageEditor({ stage, canEdit, onMove, isFirst, isLast }: Props) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (patch: Partial<Stage>) => {
      const { error } = await supabase.from('crm_pipeline_stages').update(patch as any).eq('id', stage.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'stages'] }),
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('crm_pipeline_stages').delete().eq('id', stage.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'stages'] });
      toast.success('Stage deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div
          className="h-6 w-6 rounded border"
          style={{ backgroundColor: stage.color ?? 'hsl(var(--muted))' }}
        />
        <Input
          value={stage.name}
          disabled={!canEdit}
          onChange={(e) => update.mutate({ name: e.target.value })}
          className="flex-1"
        />
        {canEdit && (
          <>
            <Button size="icon" variant="ghost" disabled={isFirst} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" disabled={isLast} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => del.mutate()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Color</Label>
          <Input
            type="color"
            value={stage.color ?? '#888888'}
            disabled={!canEdit}
            onChange={(e) => update.mutate({ color: e.target.value })}
            className="h-8 w-full p-1"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Win %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={stage.win_probability}
            disabled={!canEdit}
            onChange={(e) => update.mutate({ win_probability: Number(e.target.value) })}
            className="h-8"
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-1">
            <Switch
              checked={stage.is_won}
              disabled={!canEdit}
              onCheckedChange={(v) => update.mutate({ is_won: v, is_lost: v ? false : stage.is_lost })}
            />
            <Label className="text-xs">Won</Label>
          </div>
          <div className="flex items-center gap-1">
            <Switch
              checked={stage.is_lost}
              disabled={!canEdit}
              onCheckedChange={(v) => update.mutate({ is_lost: v, is_won: v ? false : stage.is_won })}
            />
            <Label className="text-xs">Lost</Label>
          </div>
        </div>
      </div>
    </div>
  );
}
