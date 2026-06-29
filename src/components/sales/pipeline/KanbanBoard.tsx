import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrmStages, type CrmStage } from '@/hooks/useCrmPipeline';
import { useCrmDeals, useUpdateCrmDeal, useMarkDealWon, useMarkDealLost, useReopenDeal, type CrmDealStatus, type CrmDealRow } from '@/hooks/useCrmDeals';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { StageColumn } from './StageColumn';
import { DealCard } from './DealCard';
import { WonLostDialog } from '../WonLostDialog';

interface Props {
  pipelineId: string | undefined;
  ownerId: string | null;
  search: string;
  status: CrmDealStatus | 'all';
  onCardClick: (id: string) => void;
  onOrgClick?: (orgId: string) => void;
  onNewDeal: () => void;
}

export function KanbanBoard({ pipelineId, ownerId, search, status, onCardClick, onOrgClick, onNewDeal }: Props) {
  const { data: stages = [], isLoading: stagesLoading } = useCrmStages(pipelineId);
  const dealsFilter = {
    pipelineId,
    ownerId: ownerId ?? undefined,
    search: search || undefined,
    status,
  };
  const { data: deals = [], isLoading: dealsLoading } = useCrmDeals(dealsFilter);
  const update = useUpdateCrmDeal();
  const markWon = useMarkDealWon();
  const markLost = useMarkDealLost();
  const reopen = useReopenDeal();
  const qc = useQueryClient();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<
    | { dealId: string; stage: CrmStage; mode: 'won' | 'lost' | 'reopen-from-won' | 'reopen-from-lost' }
    | null
  >(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dealsByStage = useMemo(() => {
    const m: Record<string, CrmDealRow[]> = {};
    for (const s of stages) m[s.id] = [];
    for (const d of deals) {
      if (m[d.stage_id]) m[d.stage_id].push(d);
    }
    return m;
  }, [stages, deals]);

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const dealId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const deal = deals.find((d) => d.id === dealId);
    const target = stages.find((s) => s.id === overId);
    if (!deal || !target || deal.stage_id === target.id) return;

    // Won/lost interception
    if (target.is_won) {
      setPendingMove({ dealId, stage: target, mode: 'won' });
      return;
    }
    if (target.is_lost) {
      setPendingMove({ dealId, stage: target, mode: 'lost' });
      return;
    }
    // Re-opening a won/lost deal by dropping on an open stage
    if (deal.status === 'won') {
      if (!confirm('Reopen this won deal? This will clear the won date.')) return;
      await reopen.mutateAsync(dealId);
    } else if (deal.status === 'lost') {
      if (!confirm('Reopen this lost deal? This will clear the lost reason.')) return;
      await reopen.mutateAsync(dealId);
    }

    // Optimistic stage update
    const prev = qc.getQueryData<CrmDealRow[]>(['crm', 'deals', dealsFilter]);
    qc.setQueryData<CrmDealRow[]>(['crm', 'deals', dealsFilter], (old) =>
      (old ?? []).map((d) =>
        d.id === dealId
          ? { ...d, stage_id: target.id, stage_name: target.name, stage_color: target.color }
          : d
      )
    );

    try {
      await update.mutateAsync({ id: dealId, stage_id: target.id } as any);
    } catch (err: any) {
      qc.setQueryData(['crm', 'deals', dealsFilter], prev);
      toast.error(err?.message ?? 'Failed to move deal');
    }
  };

  if (stagesLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-96 w-72 flex-shrink-0" />
        ))}
      </div>
    );
  }

  const visibleStages = stages.filter((s) => !s.is_won && !s.is_lost);

  if (visibleStages.length === 0) {
    return <p className="text-sm text-muted-foreground">No pipeline stages configured.</p>;
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleStages.map((stage, index) => {
            const isCollapsed = collapsed[stage.id] ?? false;
            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                stageIndex={index}
                deals={dealsByStage[stage.id] ?? []}
                collapsed={isCollapsed}
                onToggleCollapsed={() =>
                  setCollapsed((c) => ({ ...c, [stage.id]: !isCollapsed }))
                }
                onCardClick={onCardClick}
                onOrgClick={onOrgClick}
                onNewDeal={onNewDeal}
              />
            );
          })}
        </div>
        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} onClick={() => {}} /> : null}
        </DragOverlay>
      </DndContext>

      {dealsLoading && (
        <p className="text-xs text-muted-foreground mt-2">Loading deals…</p>
      )}

      <WonLostDialog
        open={pendingMove?.mode === 'won'}
        onOpenChange={(o) => !o && setPendingMove(null)}
        mode="won"
        defaultCloseDate={deals.find((d) => d.id === pendingMove?.dealId)?.expected_close_date ?? undefined}
        onConfirm={async ({ closeDate }) => {
          if (!pendingMove) return;
          await update.mutateAsync({ id: pendingMove.dealId, stage_id: pendingMove.stage.id } as any);
          await markWon.mutateAsync({
            id: pendingMove.dealId,
            expected_close_date: closeDate!,
            pipeline_id: deals.find((d) => d.id === pendingMove.dealId)?.pipeline_id,
            stage_id: pendingMove.stage.id,
          });
          // Open the deal sheet so the closed-won checklist is front and center
          onCardClick(pendingMove.dealId);
          setPendingMove(null);
        }}
      />
      <WonLostDialog
        open={pendingMove?.mode === 'lost'}
        onOpenChange={(o) => !o && setPendingMove(null)}
        mode="lost"
        onConfirm={async ({ reason }) => {
          if (!pendingMove) return;
          await update.mutateAsync({ id: pendingMove.dealId, stage_id: pendingMove.stage.id } as any);
          await markLost.mutateAsync({ id: pendingMove.dealId, lost_reason: reason ?? '' });
          setPendingMove(null);
        }}
      />
    </>
  );
}
