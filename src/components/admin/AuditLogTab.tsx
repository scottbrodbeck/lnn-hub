import { useMemo, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ChevronDown, ChevronRight, History, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuditLog, useAuditActors, type AuditLogEntry } from '@/hooks/useAuditLog';
import { AuditLogEntryDetail } from './AuditLogEntryDetail';

const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'email_blast', label: 'Email blast' },
  { value: 'email_sponsorship', label: 'Email sponsorship' },
  { value: 'display_ad_campaign', label: 'Display campaign' },
  { value: 'display_ad_placement', label: 'Display ad' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'assignment_instance', label: 'Assignment instance' },
  { value: 'post', label: 'Post' },
  { value: 'organization', label: 'Organization' },
  { value: 'user_organization', label: 'User membership' },
];

const RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function AuditLogTab({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState('all');
  const [actorId, setActorId] = useState('all');
  const [range, setRange] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useAuditLog({
    organizationId,
    page,
    pageSize: 25,
    entityType: entityType === 'all' ? null : entityType,
    actorUserId: actorId === 'all' ? null : actorId,
    sinceDays: range === 'all' ? null : Number(range),
    search: search.trim() || null,
  });

  const { data: actors } = useAuditActors(organizationId);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderActor = (entry: AuditLogEntry) => {
    if (!entry.actor) return 'System';
    return entry.actor.full_name || entry.actor.email || 'Unknown admin';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4" />
          AUDIT LOG{data ? ` (${data.total})` : ''}
        </h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search summaries…"
            value={search}
            onChange={(e) => {
              setPage(0);
              setSearch(e.target.value);
            }}
            className="pl-7 h-9"
          />
        </div>
        <Select
          value={entityType}
          onValueChange={(v) => {
            setPage(0);
            setEntityType(v);
          }}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={actorId}
          onValueChange={(v) => {
            setPage(0);
            setActorId(v);
          }}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="All admins" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All admins</SelectItem>
            {(actors ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name || a.email || a.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={range}
          onValueChange={(v) => {
            setPage(0);
            setRange(v);
          }}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
          No admin actions logged{search || entityType !== 'all' || range !== 'all' ? ' for these filters' : ' yet'}.
        </div>
      ) : (
        <div className="space-y-2">
          {data.entries.map((entry) => {
            const isOpen = expanded.has(entry.id);
            const hasDetail = !!entry.diff || Object.keys(entry.metadata).length > 0;
            return (
              <div key={entry.id} className="rounded-md border border-border bg-card">
                <button
                  type="button"
                  onClick={() => hasDetail && toggle(entry.id)}
                  className={`w-full text-left p-3 flex items-start gap-3 ${hasDetail ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="mt-0.5 text-muted-foreground">
                    {hasDetail ? (
                      isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    ) : (
                      <span className="inline-block w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{renderActor(entry)}</span>
                      <span
                        className="text-xs text-muted-foreground shrink-0"
                        title={format(new Date(entry.created_at), 'PPpp')}
                      >
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="text-sm text-foreground/90 mt-0.5 break-words">{entry.summary}</div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                        {entry.action}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {entry.entity_type}
                      </Badge>
                    </div>
                  </div>
                </button>
                {isOpen && hasDetail && (
                  <div className="px-3 pb-3">
                    <AuditLogEntryDetail entry={entry} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
