import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CrmStage } from '@/hooks/useCrmPipeline';
import type { CrmDealRow } from '@/hooks/useCrmDeals';
import { DealCard } from './DealCard';

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// Soft fallback palette (HSL) for stages without an explicit color.
// Picked to be subtle, distinct, and theme-friendly across light/dark.
const FALLBACK_COLORS = [
  'hsl(210 80% 55%)', // blue
  'hsl(265 70% 60%)', // violet
  'hsl(190 75% 45%)', // teal
  'hsl(35 90% 55%)',  // amber
  'hsl(150 55% 45%)', // green
  'hsl(330 70% 58%)', // pink
];

interface Props {
  stage: CrmStage;
  stageIndex?: number;
  deals: CrmDealRow[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCardClick: (id: string) => void;
  onOrgClick?: (orgId: string) => void;
  onNewDeal: () => void;
}

export function StageColumn({
  stage,
  stageIndex = 0,
  deals,
  collapsed,
  onToggleCollapsed,
  onCardClick,
  onOrgClick,
  onNewDeal,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + Number(d.value || 0), 0);

  const stageHue =
    stage.color && stage.color.trim().length > 0
      ? stage.color
      : FALLBACK_COLORS[stageIndex % FALLBACK_COLORS.length];

  return (
    <div className="flex flex-col rounded-lg border bg-card flex-shrink-0 w-72 overflow-hidden">
      {/* Color accent strip */}
      <div className="h-1 w-full" style={{ backgroundColor: stageHue }} />

      <button
        type="button"
        onClick={onToggleCollapsed}
        className="p-3 border-b text-left hover:bg-muted/40 transition-colors"
        style={{
          backgroundColor: `color-mix(in srgb, ${stageHue} 8%, transparent)`,
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-sm truncate">{stage.name}</span>
          <Badge variant="secondary" className="text-xs">
            {deals.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{formatUSD(total)}</p>
      </button>

      {!collapsed && (
        <div
          ref={setNodeRef}
          className={cn(
            'flex-1 p-2 space-y-2 min-h-[10rem] transition-colors',
            isOver && 'bg-primary/5 ring-2 ring-primary/30 ring-inset'
          )}
        >
          {deals.length === 0 ? (
            <button
              type="button"
              onClick={onNewDeal}
              className="w-full text-xs text-muted-foreground italic p-3 hover:text-foreground hover:bg-muted/40 rounded-md transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="h-3 w-3" /> New deal
            </button>
          ) : (
            deals.map((d) => (
              <DealCard
                key={d.id}
                deal={d}
                onClick={() => onCardClick(d.id)}
                onOrgClick={onOrgClick}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
