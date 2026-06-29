import { TableHead } from '@/components/ui/table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';
export type SortState<K extends string> = { key: K; dir: SortDir };

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSortChange,
  align = 'left',
  className,
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSortChange: (s: SortState<K>) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  const handleClick = () => {
    if (active) onSortChange({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else onSortChange({ key: sortKey, dir: 'asc' });
  };
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}

export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulls last regardless of dir
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }
  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  const cmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}
