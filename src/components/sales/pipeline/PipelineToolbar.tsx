import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search } from 'lucide-react';
import { OwnerPicker } from '../OwnerPicker';
import { usePipelineDealOwners } from '@/hooks/usePipelineDealOwners';
import type { CrmPipeline } from '@/hooks/useCrmPipeline';
import type { CrmDealStatus } from '@/hooks/useCrmDeals';

interface Props {
  pipelines: CrmPipeline[];
  pipelineId: string | undefined;
  onPipelineChange: (id: string) => void;
  ownerId: string | null;
  onOwnerChange: (id: string | null) => void;
  search: string;
  onSearchChange: (s: string) => void;
  status: CrmDealStatus | 'all';
  onStatusChange: (s: CrmDealStatus | 'all') => void;
  onNewDeal: () => void;
}

export function PipelineToolbar({
  pipelines,
  pipelineId,
  onPipelineChange,
  ownerId,
  onOwnerChange,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onNewDeal,
}: Props) {
  // Scope the owner filter to users that actually own a deal in this pipeline.
  const { data: pipelineOwners } = usePipelineDealOwners(pipelineId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[180px]">
        <Select value={pipelineId} onValueChange={onPipelineChange}>
          <SelectTrigger>
            <SelectValue placeholder="Pipeline" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-[180px]">
        <OwnerPicker
          value={ownerId}
          onChange={onOwnerChange}
          placeholder="All owners"
          allowAll
          restrictToIds={pipelineOwners?.ownerIds}
          hasUnassigned={pipelineOwners?.hasUnassigned}
        />
      </div>

      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search deals…"
          className="pl-8"
        />
      </div>

      <Tabs value={status} onValueChange={(v) => onStatusChange(v as any)}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="won">Won</TabsTrigger>
          <TabsTrigger value="lost">Lost</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="ml-auto">
        <Button onClick={onNewDeal}>
          <Plus className="h-4 w-4 mr-1" /> New deal
        </Button>
      </div>
    </div>
  );
}
