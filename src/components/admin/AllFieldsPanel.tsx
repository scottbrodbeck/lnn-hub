import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type FkLookup =
  | { kind: 'organization'; id: string | null | undefined }
  | { kind: 'site'; id: string | null | undefined }
  | { kind: 'assignment'; id: string | null | undefined }
  | { kind: 'user'; id: string | null | undefined }
  | { kind: 'post'; id: string | null | undefined }
  | { kind: 'sponsor'; id: string | null | undefined };

type ResolvedFk = { label: string; logoUrl?: string | null };

interface AllFieldsPanelProps {
  /** The full row from posts / email_blasts / email_sponsorships */
  row: Record<string, any> | null;
  /** Map of column name -> FK lookup descriptor for which we should resolve a label */
  fkColumns?: Record<string, FkLookup['kind']>;
}

const TIMESTAMP_RE = /(_at|_date|^submitted_at|^published_at)$/;
const URL_RE = /^https?:\/\//i;

function isTimestampField(key: string, value: any): boolean {
  if (typeof value !== 'string') return false;
  if (TIMESTAMP_RE.test(key)) return true;
  // best-effort ISO check
  return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value);
}

function formatTimestamp(value: string): { et: string; raw: string } | null {
  try {
    const d = parseISO(value);
    if (isNaN(d.getTime())) return null;
    const et = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
    return { et, raw: value };
  } catch {
    return null;
  }
}

function JsonValue({ value }: { value: any }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {Array.isArray(value) ? `Array(${value.length})` : 'Object'}
      </button>
      {open && (
        <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
          {json}
        </pre>
      )}
    </div>
  );
}

function extractSocialPostsArray(value: any): Array<{ text?: string; type?: string; edited?: boolean }> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.every((p) => p && typeof p === 'object' && 'text' in p)) return value as any;
    return null;
  }
  if (typeof value === 'object' && Array.isArray((value as any).posts)) {
    const posts = (value as any).posts;
    if (posts.every((p: any) => p && typeof p === 'object' && 'text' in p)) return posts;
  }
  return null;
}

function SocialPostsValue({ value }: { value: any }) {
  const posts = extractSocialPostsArray(value);
  if (!posts || posts.length === 0) {
    return <JsonValue value={value} />;
  }
  return (
    <div className="space-y-2">
      {posts.map((p, i) => (
        <div key={i} className="rounded border border-border bg-muted/30 p-2 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
            {p.type && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {p.type}
              </Badge>
            )}
            <Badge variant={p.edited ? 'default' : 'secondary'} className="text-[10px]">
              {p.edited ? 'Edited' : 'Default'}
            </Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{p.text || <span className="italic text-muted-foreground">—</span>}</p>
        </div>
      ))}
      {value && typeof value === 'object' && !Array.isArray(value) && (value as any).instance_dates && (
        <div className="text-xs text-muted-foreground">
          + instance_dates metadata
        </div>
      )}
    </div>
  );
}

function FieldValue({ name, value }: { name: string; value: any }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground italic">—</span>;
  }

  if (name === 'social_posts') {
    return <SocialPostsValue value={value} />;
  }

  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'default' : 'outline'}>{String(value)}</Badge>;
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-sm">{value}</span>;
  }

  if (typeof value === 'string') {
    const ts = isTimestampField(name, value) ? formatTimestamp(value) : null;
    if (ts) {
      return (
        <div className="space-y-0.5">
          <div className="text-sm">{ts.et}</div>
          <div className="text-xs font-mono text-muted-foreground">{ts.raw}</div>
        </div>
      );
    }
    if (URL_RE.test(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all"
        >
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          <span className="truncate max-w-[480px]">{value}</span>
        </a>
      );
    }
    if (name.endsWith('status') || name === 'sync_status') {
      return <Badge variant="secondary">{value}</Badge>;
    }
    return <span className="text-sm break-words whitespace-pre-wrap">{value}</span>;
  }

  if (typeof value === 'object') {
    return <JsonValue value={value} />;
  }

  return <span className="text-sm">{String(value)}</span>;
}

async function resolveFk(kind: FkLookup['kind'], id: string): Promise<ResolvedFk | null> {
  try {
    if (kind === 'organization') {
      const { data } = await supabase.from('organizations').select('name').eq('id', id).maybeSingle();
      return data?.name ? { label: data.name } : null;
    }
    if (kind === 'site') {
      const { data } = await supabase.from('sites').select('name').eq('id', id).maybeSingle();
      return data?.name ? { label: data.name } : null;
    }
    if (kind === 'assignment') {
      const { data } = await supabase
        .from('post_assignments')
        .select('assignment_name, due_date')
        .eq('id', id)
        .maybeSingle();
      return data
        ? { label: `${data.assignment_name ?? '(unnamed)'} — ${data.due_date ?? ''}`.trim() }
        : null;
    }
    if (kind === 'user') {
      const { data } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', id)
        .maybeSingle();
      return data ? { label: `${data.full_name ?? ''} <${data.email ?? ''}>`.trim() } : null;
    }
    if (kind === 'post') {
      const { data } = await supabase.from('posts').select('headline, status').eq('id', id).maybeSingle();
      return data ? { label: `${data.headline ?? '(untitled)'} [${data.status ?? ''}]` } : null;
    }
    if (kind === 'sponsor') {
      const { data } = await supabase
        .from('sponsors')
        .select('name, logo_url, organization_id')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const name = data.name && data.name.trim() ? data.name : '(unnamed sponsor)';
      let label = name;
      if (data.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', data.organization_id)
          .maybeSingle();
        if (org?.name) label = `${name} (org: ${org.name})`;
      }
      return { label, logoUrl: data.logo_url ?? null };
    }
  } catch {
    // ignore
  }
  return null;
}

export function AllFieldsPanel({ row, fkColumns }: AllFieldsPanelProps) {
  const [resolved, setResolved] = useState<Record<string, ResolvedFk | null>>({});

  useEffect(() => {
    if (!row || !fkColumns) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        Object.entries(fkColumns).map(async ([col, kind]) => {
          const id = row[col];
          if (!id) return [col, null] as const;
          const result = await resolveFk(kind, id as string);
          return [col, result] as const;
        })
      );
      if (!cancelled) {
        setResolved(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row, fkColumns]);

  if (!row) {
    return <div className="text-muted-foreground text-sm">No data.</div>;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      toast.success('Copied row JSON to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  // Stable column order: keep id, then alphabetical for the rest.
  const keys = Object.keys(row).sort((a, b) => {
    if (a === 'id') return -1;
    if (b === 'id') return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Admin diagnostic view — every column for this submission.
        </p>
        <Button size="sm" variant="outline" onClick={handleCopy}>
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy JSON
        </Button>
      </div>

      <div className="rounded-md border border-border divide-y divide-border">
        {keys.map((key) => {
          const value = row[key];
          const fk = resolved[key];
          return (
            <div
              key={key}
              className={cn(
                'grid grid-cols-1 md:grid-cols-[220px_1fr] gap-1 md:gap-4 px-3 py-2',
                'hover:bg-muted/30'
              )}
            >
              <div className="text-xs font-mono font-medium text-muted-foreground pt-0.5">
                {key}
              </div>
              <div className="min-w-0">
                <FieldValue name={key} value={value} />
                {fk && (
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <span>→ <span className="font-medium">{fk.label}</span></span>
                    {fk.logoUrl && (
                      <img
                        src={fk.logoUrl}
                        alt="Sponsor logo"
                        className="h-6 w-auto max-w-[60px] rounded border border-border object-contain bg-background"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
