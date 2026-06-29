import { useEffect, useRef, useState } from 'react';
import { useCrmPipelines, useDefaultPipeline } from '@/hooks/useCrmPipeline';
import { useCrmOrganizations } from '@/hooks/useCrmOrganizations';
import { usePreferredPipeline } from '@/hooks/usePreferredPipeline';
import { useCurrentUserHasOpenDeals } from '@/hooks/useCurrentUserHasOpenDeals';
import { useAuth } from '@/contexts/AuthContext';
import type { CrmDealStatus } from '@/hooks/useCrmDeals';
import { PipelineToolbar } from '@/components/sales/pipeline/PipelineToolbar';
import { KanbanBoard } from '@/components/sales/pipeline/KanbanBoard';
import { DealDetailSheet } from '@/components/sales/DealDetailSheet';
import { DealFormDialog } from '@/components/sales/DealFormDialog';
import { OrgDetailSheet } from '@/components/sales/OrgDetailSheet';

const LS_KEY = 'crm.pipeline.filters';

type Persisted = {
  pipelineId?: string;
  ownerId?: string | null;
  status?: CrmDealStatus | 'all';
  ownerChosen?: boolean;
};

function loadPersisted(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export default function SalesPipeline() {
  const persisted = loadPersisted();
  const { user } = useAuth();
  const { data: pipelines = [] } = useCrmPipelines();
  const { defaultPipeline } = useDefaultPipeline();
  const { data: preferredPipelineId } = usePreferredPipeline();
  const { data: orgs = [] } = useCrmOrganizations();

  const [pipelineId, setPipelineId] = useState<string | undefined>(persisted.pipelineId);
  const [ownerId, setOwnerId] = useState<string | null>(persisted.ownerId ?? null);
  const [ownerChosen, setOwnerChosen] = useState<boolean>(!!persisted.ownerChosen);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CrmDealStatus | 'all'>(persisted.status ?? 'open');
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);

  // Resolve initial pipeline: persisted (if still valid) > user preference > system default > first
  useEffect(() => {
    const persistedIsValid = pipelineId && pipelines.some((p) => p.id === pipelineId);
    if (persistedIsValid) return;
    if (preferredPipelineId && pipelines.some((p) => p.id === preferredPipelineId)) {
      setPipelineId(preferredPipelineId);
    } else if (defaultPipeline) {
      setPipelineId(defaultPipeline.id);
    } else if (pipelines[0]) {
      setPipelineId(pipelines[0].id);
    }
  }, [defaultPipeline, preferredPipelineId, pipelines, pipelineId]);

  // Auto-default owner filter to current user when they have open deals in this pipeline.
  // Only runs if user hasn't made an explicit choice.
  const { data: hasOpenDeals, isSuccess: hasOpenDealsLoaded } = useCurrentUserHasOpenDeals(pipelineId);
  const lastAutoPipelineRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (ownerChosen) return;
    if (!pipelineId || !user?.id || !hasOpenDealsLoaded) return;
    if (lastAutoPipelineRef.current === pipelineId) return;
    lastAutoPipelineRef.current = pipelineId;
    setOwnerId(hasOpenDeals ? user.id : null);
  }, [ownerChosen, pipelineId, user?.id, hasOpenDeals, hasOpenDealsLoaded]);

  const handleOwnerChange = (id: string | null) => {
    setOwnerChosen(true);
    setOwnerId(id);
  };

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ pipelineId, ownerId, status, ownerChosen }));
  }, [pipelineId, ownerId, status, ownerChosen]);

  const activeOrg = activeOrgId ? orgs.find((o) => o.id === activeOrgId) ?? null : null;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <h1 className="text-3xl font-bold tracking-tight">Pipeline</h1>

      <PipelineToolbar
        pipelines={pipelines}
        pipelineId={pipelineId}
        onPipelineChange={setPipelineId}
        ownerId={ownerId}
        onOwnerChange={handleOwnerChange}
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        onNewDeal={() => setNewDealOpen(true)}
      />

      <KanbanBoard
        pipelineId={pipelineId}
        ownerId={ownerId}
        search={search}
        status={status}
        onCardClick={setActiveDealId}
        onOrgClick={setActiveOrgId}
        onNewDeal={() => setNewDealOpen(true)}
      />

      <DealDetailSheet
        open={!!activeDealId}
        onOpenChange={(o) => !o && setActiveDealId(null)}
        dealId={activeDealId}
      />
      <OrgDetailSheet
        open={!!activeOrgId}
        onOpenChange={(o) => !o && setActiveOrgId(null)}
        org={activeOrg}
      />
      <DealFormDialog open={newDealOpen} onOpenChange={setNewDealOpen} />
    </div>
  );
}
