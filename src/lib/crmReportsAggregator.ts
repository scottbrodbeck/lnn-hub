import type { CrmDealRow } from '@/hooks/useCrmDeals';
import type { CrmStage } from '@/hooks/useCrmPipeline';
import type { CrmActivityRow, CrmActivityType } from '@/hooks/useCrmActivities';
import type { SalesEligibleUser } from '@/hooks/useSalesEligibleUsers';

export type DateRange = { from: Date; to: Date };

function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

export function summarizeDeals(deals: CrmDealRow[], stages: CrmStage[], range: DateRange) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const open = deals.filter((d) => d.status === 'open');
  const openValue = open.reduce((s, d) => s + Number(d.value || 0), 0);
  const weighted = open.reduce((s, d) => {
    const st = stageMap.get(d.stage_id);
    return s + Number(d.value || 0) * (Number(st?.win_probability ?? 0) / 100);
  }, 0);
  const weightedAvgProb = openValue > 0 ? Math.round((weighted / openValue) * 100) : 0;

  const wonInRange = deals.filter((d) => d.status === 'won' && inRange(d.won_at, range));
  const lostInRange = deals.filter((d) => d.status === 'lost' && inRange(d.lost_at, range));
  const wonValue = wonInRange.reduce((s, d) => s + Number(d.value || 0), 0);
  const lostValue = lostInRange.reduce((s, d) => s + Number(d.value || 0), 0);
  const avgWonSize = wonInRange.length ? Math.round(wonValue / wonInRange.length) : 0;

  // Top lost reason
  const reasonCounts: Record<string, number> = {};
  lostInRange.forEach((d) => {
    const r = (d.lost_reason ?? '').trim() || 'Unspecified';
    reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  });
  const topLostReason =
    Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    openCount: open.length,
    openValue,
    weighted,
    weightedAvgProb,
    wonCount: wonInRange.length,
    wonValue,
    lostCount: lostInRange.length,
    lostValue,
    avgWonSize,
    topLostReason,
  };
}

export function pipelineByStage(deals: CrmDealRow[], stages: CrmStage[]) {
  const byStage = new Map<string, number>();
  for (const s of stages) byStage.set(s.id, 0);
  for (const d of deals) {
    if (d.status !== 'open') continue;
    byStage.set(d.stage_id, (byStage.get(d.stage_id) ?? 0) + Number(d.value || 0));
  }
  return stages
    .filter((s) => !s.is_won && !s.is_lost)
    .map((s) => ({ name: s.name, value: byStage.get(s.id) ?? 0, color: s.color ?? null }));
}

function bucketKey(d: Date, weekly: boolean): string {
  if (weekly) {
    // ISO-ish week: Monday-start
    const tmp = new Date(d);
    const day = (tmp.getDay() + 6) % 7;
    tmp.setDate(tmp.getDate() - day);
    return tmp.toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function wonLostTrend(deals: CrmDealRow[], range: DateRange) {
  const days = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
  const weekly = days <= 90;
  const map = new Map<string, { won: number; lost: number }>();

  // Pre-fill buckets across range so chart isn't sparse
  const cursor = new Date(range.from);
  while (cursor <= range.to) {
    map.set(bucketKey(cursor, weekly), { won: 0, lost: 0 });
    if (weekly) cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const d of deals) {
    if (d.status === 'won' && inRange(d.won_at, range)) {
      const k = bucketKey(new Date(d.won_at!), weekly);
      const entry = map.get(k) ?? { won: 0, lost: 0 };
      entry.won += Number(d.value || 0);
      map.set(k, entry);
    } else if (d.status === 'lost' && inRange(d.lost_at, range)) {
      const k = bucketKey(new Date(d.lost_at!), weekly);
      const entry = map.get(k) ?? { won: 0, lost: 0 };
      entry.lost += Number(d.value || 0);
      map.set(k, entry);
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ bucket: k, won: v.won, lost: v.lost }));
}

export function ownerLeaderboard(
  deals: CrmDealRow[],
  stages: CrmStage[],
  users: SalesEligibleUser[],
  range: DateRange
) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const rows = users.map((u) => {
    const userDeals = deals.filter((d) => d.owner_user_id === u.id);
    const open = userDeals.filter((d) => d.status === 'open');
    const openValue = open.reduce((s, d) => s + Number(d.value || 0), 0);
    const weighted = open.reduce((s, d) => {
      const st = stageMap.get(d.stage_id);
      return s + Number(d.value || 0) * (Number(st?.win_probability ?? 0) / 100);
    }, 0);
    const won = userDeals.filter((d) => d.status === 'won' && inRange(d.won_at, range));
    const lost = userDeals.filter((d) => d.status === 'lost' && inRange(d.lost_at, range));
    const wonValue = won.reduce((s, d) => s + Number(d.value || 0), 0);
    const closed = won.length + lost.length;
    const winRate = closed ? Math.round((won.length / closed) * 100) : 0;
    return {
      userId: u.id,
      name: u.full_name ?? u.email,
      openValue,
      weighted,
      wonCount: won.length,
      wonValue,
      winRate,
    };
  });
  return rows
    .filter((r) => r.openValue > 0 || r.wonValue > 0)
    .sort((a, b) => b.wonValue - a.wonValue);
}

export function activitySummary(activities: CrmActivityRow[], range: DateRange) {
  const types: CrmActivityType[] = ['call', 'meeting', 'task', 'email', 'note'];
  const counts: Record<CrmActivityType, number> = {
    call: 0,
    meeting: 0,
    task: 0,
    email: 0,
    note: 0,
  };
  for (const a of activities) {
    if (!inRange(a.completed_at, range)) continue;
    if (counts[a.type] !== undefined) counts[a.type]++;
  }
  return types.map((t) => ({ type: t, count: counts[t] }));
}
