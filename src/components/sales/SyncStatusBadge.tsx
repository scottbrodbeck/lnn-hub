import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  status?: string | null;
  error?: string | null;
  hubspotId?: string | null;
  className?: string;
}

const META: Record<string, { color: string; label: string; Icon: any }> = {
  synced: { color: 'text-emerald-500', label: 'Synced with HubSpot', Icon: Cloud },
  pending: { color: 'text-amber-500', label: 'Pending push to HubSpot', Icon: RefreshCw },
  error: { color: 'text-amber-600', label: 'Sync error — retrying', Icon: AlertCircle },
  failed: { color: 'text-destructive', label: 'Sync failed', Icon: AlertCircle },
  local_only: { color: 'text-muted-foreground', label: 'Local only', Icon: CloudOff },
};

export function SyncStatusBadge({ status, error, hubspotId, className }: Props) {
  const key = status ?? (hubspotId ? 'synced' : 'local_only');
  const meta = META[key] ?? META.local_only;
  const { Icon } = meta;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center', meta.color, className)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div>{meta.label}</div>
          {error && <div className="text-destructive mt-1 max-w-xs">{error}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
