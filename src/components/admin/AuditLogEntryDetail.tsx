import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { AuditLogEntry } from '@/hooks/useAuditLog';

function formatValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && '__truncated' in (v as Record<string, unknown>)) {
    const t = v as { length: number; preview: string };
    return `${t.preview}\n\n[truncated — ${t.length} chars total]`;
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/**
 * Build a router link for an audited entity, or null if no deep link is meaningful.
 */
function buildEntityLink(entry: AuditLogEntry): { to: string; label: string } | null {
  if (!entry.entity_id) return null;
  switch (entry.entity_type) {
    case 'display_ad_campaign':
      return { to: `/admin/display-ads?campaign=${entry.entity_id}`, label: 'Open campaign' };
    case 'display_ad_placement':
      return { to: `/admin/display-ads`, label: 'Open display ads' };
    case 'email_blast':
      return { to: `/admin/tasks?blast=${entry.entity_id}`, label: 'Open blast' };
    case 'email_sponsorship':
      return { to: `/admin/tasks?sponsorship=${entry.entity_id}`, label: 'Open sponsorship' };
    case 'assignment':
      return { to: `/admin/assignments?assignment=${entry.entity_id}`, label: 'Open assignment' };
    case 'assignment_instance':
      return { to: `/admin/calendar?assignment=${entry.entity_id}`, label: 'Open on calendar' };
    case 'post':
      return { to: `/admin/calendar?post=${entry.entity_id}`, label: 'Open post' };
    default:
      return null;
  }
}

export function AuditLogEntryDetail({ entry }: { entry: AuditLogEntry }) {
  const before = entry.diff?.before ?? null;
  const after = entry.diff?.after ?? null;
  const keys = Array.from(
    new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])])
  );

  const meta = entry.metadata && Object.keys(entry.metadata).length > 0 ? entry.metadata : null;
  const link = buildEntityLink(entry);

  return (
    <div className="mt-3 space-y-4 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="font-medium text-foreground">Action:</span> {entry.action}</span>
          <span><span className="font-medium text-foreground">Entity:</span> {entry.entity_type}</span>
          {entry.entity_id && <span className="font-mono">{entry.entity_id.slice(0, 8)}…</span>}
        </div>
        {link && (
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link to={link.to}>
              <ExternalLink className="h-3 w-3 mr-1" />
              {link.label}
            </Link>
          </Button>
        )}
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No field-level changes recorded.</p>
      ) : !after && before ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Deleted snapshot</div>
          {keys.map((k) => (
            <div key={k} className="text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-1">{k}</div>
              <pre className="bg-destructive/10 text-destructive-foreground/90 border border-destructive/20 rounded p-2 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {formatValue(before?.[k])}
              </pre>
            </div>
          ))}
        </div>
      ) : !before && after ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Created with</div>
          {keys.map((k) => (
            <div key={k} className="text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-1">{k}</div>
              <pre className="bg-emerald-500/10 text-foreground border border-emerald-500/20 rounded p-2 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">
                {formatValue(after?.[k])}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{k} — before</div>
                <pre className="bg-destructive/10 text-destructive-foreground/90 border border-destructive/20 rounded p-2 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">
                  {formatValue(before?.[k])}
                </pre>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">{k} — after</div>
                <pre className="bg-emerald-500/10 text-foreground border border-emerald-500/20 rounded p-2 text-xs whitespace-pre-wrap break-words max-h-48 overflow-auto">
                  {formatValue(after?.[k])}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Metadata</div>
          <pre className="bg-muted rounded p-2 text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

