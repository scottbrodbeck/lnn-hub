import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, User } from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { cn } from '@/lib/utils';
import type { CrmDealRow } from '@/hooks/useCrmDeals';

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const OWNER_PALETTE = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
];

const ownerColor = (key: string | null | undefined) => {
  if (!key) return 'bg-muted text-muted-foreground';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return OWNER_PALETTE[Math.abs(h) % OWNER_PALETTE.length];
};

interface Props {
  deal: CrmDealRow;
  onClick: () => void;
  onOrgClick?: (orgId: string) => void;
}

export function DealCard({ deal, onClick, onOrgClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { stageId: deal.stage_id, status: deal.status },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const close = deal.expected_close_date ? new Date(deal.expected_close_date) : null;
  const overdue = close && deal.status === 'open' && isPast(close);

  const initials = (deal.owner_name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const avatarColor = ownerColor(deal.owner_user_id ?? deal.owner_name);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // suppress click after drag
        if (isDragging) return;
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'rounded-md border bg-background p-3 text-xs space-y-2 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors',
        isDragging && 'shadow-lg'
      )}
    >
      <p className="font-semibold text-sm leading-tight line-clamp-2">{deal.title}</p>
      {deal.organization_name && deal.crm_organization_id && onOrgClick ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOrgClick(deal.crm_organization_id!);
          }}
          className="text-muted-foreground truncate hover:text-foreground hover:underline text-left w-full"
        >
          {deal.organization_name}
        </button>
      ) : deal.organization_name ? (
        <p className="text-muted-foreground truncate">{deal.organization_name}</p>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{formatUSD(Number(deal.value || 0))}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {close ? (
          <span
            className={cn(
              'flex items-center gap-1',
              overdue ? 'text-destructive' : 'text-muted-foreground'
            )}
            title={format(close, 'PP')}
          >
            <Calendar className="h-3 w-3" />
            {formatDistanceToNow(close, { addSuffix: true })}
          </span>
        ) : (
          <span className="text-muted-foreground">No close date</span>
        )}
        <span
          className={cn(
            'inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-semibold',
            avatarColor
          )}
          title={deal.owner_name ?? 'Unassigned'}
        >
          {deal.owner_name ? initials : <User className="h-3 w-3" />}
        </span>
      </div>
    </div>
  );
}
