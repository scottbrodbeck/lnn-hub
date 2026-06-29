import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Target, Trophy, TrendingDown } from 'lucide-react';
import { ReportsToolbar, presetRange, type ReportsFilterState } from '@/components/sales/reports/ReportsToolbar';
import { StatCard } from '@/components/sales/reports/StatCard';
import { PipelineByStageChart } from '@/components/sales/reports/PipelineByStageChart';
import { WonLostTrendChart } from '@/components/sales/reports/WonLostTrendChart';
import { OwnerLeaderboard } from '@/components/sales/reports/OwnerLeaderboard';
import { ActivitySummary } from '@/components/sales/reports/ActivitySummary';
import { useCrmReports } from '@/hooks/useCrmReports';
import { useCrmStages } from '@/hooks/useCrmPipeline';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';
import {
  summarizeDeals,
  pipelineByStage,
  wonLostTrend,
  ownerLeaderboard,
  activitySummary,
} from '@/lib/crmReportsAggregator';

const LS_KEY = 'crm.reports.filters';

const formatUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function loadInitial(): ReportsFilterState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const r = presetRange('month', '', '');
  return { preset: 'month', from: r.from, to: r.to, ownerIds: [] };
}

export default function SalesReports() {
  const [filters, setFilters] = useState<ReportsFilterState>(loadInitial);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(filters));
  }, [filters]);

  const { data: stages = [] } = useCrmStages(filters.pipelineId);
  const { data: users = [] } = useSalesEligibleUsers();
  const { data, isLoading } = useCrmReports({
    pipelineId: filters.pipelineId,
    ownerIds: filters.ownerIds,
    from: new Date(filters.from + 'T00:00:00').toISOString(),
    to: new Date(filters.to + 'T23:59:59').toISOString(),
  });

  const range = useMemo(
    () => ({
      from: new Date(filters.from + 'T00:00:00'),
      to: new Date(filters.to + 'T23:59:59'),
    }),
    [filters.from, filters.to]
  );

  const deals = data?.deals ?? [];
  const activities = data?.activities ?? [];

  const summary = useMemo(() => summarizeDeals(deals, stages, range), [deals, stages, range]);
  const stageData = useMemo(() => pipelineByStage(deals, stages), [deals, stages]);
  const trend = useMemo(() => wonLostTrend(deals, range), [deals, range]);
  const leaderboard = useMemo(
    () => ownerLeaderboard(deals, stages, users, range),
    [deals, stages, users, range]
  );
  const acts = useMemo(() => activitySummary(activities, range), [activities, range]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">Pipeline performance and team activity.</p>
      </div>

      <ReportsToolbar value={filters} onChange={setFilters} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Open pipeline"
          value={formatUSD(summary.openValue)}
          sub={`${summary.openCount} open deal${summary.openCount === 1 ? '' : 's'}`}
          loading={isLoading}
        />
        <StatCard
          icon={Target}
          label="Weighted forecast"
          value={formatUSD(summary.weighted)}
          sub={`${summary.weightedAvgProb}% avg probability`}
          loading={isLoading}
        />
        <StatCard
          icon={Trophy}
          label="Won this period"
          value={formatUSD(summary.wonValue)}
          sub={`${summary.wonCount} deal${summary.wonCount === 1 ? '' : 's'} · avg ${formatUSD(summary.avgWonSize)}`}
          loading={isLoading}
        />
        <StatCard
          icon={TrendingDown}
          label="Lost this period"
          value={formatUSD(summary.lostValue)}
          sub={
            summary.lostCount === 0
              ? 'No losses'
              : `${summary.lostCount} deal${summary.lostCount === 1 ? '' : 's'}${summary.topLostReason ? ` · ${summary.topLostReason}` : ''}`
          }
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineByStageChart data={stageData} />
        <WonLostTrendChart data={trend} />
      </div>

      <OwnerLeaderboard rows={leaderboard} />
      <ActivitySummary data={acts} />
    </div>
  );
}
