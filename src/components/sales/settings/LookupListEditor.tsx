import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { useCrmLookup, useUpdateCrmLookup, type CrmLookupKey } from '@/hooks/useCrmSettings';

interface Props {
  lookupKey: CrmLookupKey;
  title: string;
  description?: string;
  canEdit: boolean;
}

export function LookupListEditor({ lookupKey, title, description, canEdit }: Props) {
  const { data: items = [], isLoading } = useCrmLookup(lookupKey);
  const update = useUpdateCrmLookup();
  const [draft, setDraft] = useState('');
  const [working, setWorking] = useState<string[]>([]);

  useEffect(() => { setWorking(items); }, [items]);

  const add = () => {
    const t = draft.trim();
    if (!t || working.includes(t)) return;
    const next = [...working, t];
    setWorking(next);
    setDraft('');
    update.mutate({ key: lookupKey, value: next });
  };

  const remove = (t: string) => {
    const next = working.filter((x) => x !== t);
    setWorking(next);
    update.mutate({ key: lookupKey, value: next });
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Add an option…"
          />
          <Button size="sm" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : working.length === 0 ? (
          <p className="text-xs text-muted-foreground">No options yet.</p>
        ) : (
          working.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              {canEdit && (
                <button type="button" onClick={() => remove(t)} aria-label={`Remove ${t}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}
