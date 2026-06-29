import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, ArrowLeft, Save, Info } from 'lucide-react';
import {
  useAssignmentDefaults,
  useDistinctProductCategories,
  useSaveAssignmentDefaults,
  type AssignmentDefaults,
  type CategoryRule,
} from '@/hooks/useAssignmentDefaults';

const KIND_OPTIONS: CategoryRule['assignment_kind'][] = ['post', 'display_ad', 'bundle'];
const CONTENT_CATEGORIES = ['website', 'email_blast', 'email_sponsorship'];
const POST_TYPES = ['standard', 'sponsored', 'newsletter'];

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function SalesAssignmentDefaults() {
  const { data, isLoading } = useAssignmentDefaults();
  const { data: distinctCategories = [] } = useDistinctProductCategories();
  const save = useSaveAssignmentDefaults();

  const [draft, setDraft] = useState<AssignmentDefaults | null>(null);

  useEffect(() => {
    if (data && !draft) setDraft(structuredClone(data));
  }, [data, draft]);

  const unmapped = useMemo(() => {
    if (!draft) return [];
    const keys = new Set(Object.keys(draft.category_mapping).map(normalize));
    const aliasKeys = new Set(Object.keys(draft.category_aliases ?? {}).map(normalize));
    return distinctCategories.filter(
      (c) => !keys.has(normalize(c)) && !aliasKeys.has(normalize(c)),
    );
  }, [draft, distinctCategories]);

  if (isLoading || !draft) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const updateRule = (key: string, patch: Partial<CategoryRule>) => {
    setDraft((d) => d && ({
      ...d,
      category_mapping: { ...d.category_mapping, [key]: { ...d.category_mapping[key], ...patch } },
    }));
  };

  const renameKey = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.category_mapping };
      next[newKey] = next[oldKey];
      delete next[oldKey];
      return { ...d, category_mapping: next };
    });
  };

  const removeRule = (key: string) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.category_mapping };
      delete next[key];
      return { ...d, category_mapping: next };
    });
  };

  const addRule = (initialKey = '') => {
    setDraft((d) => d && ({
      ...d,
      category_mapping: {
        ...d.category_mapping,
        [initialKey || `New category ${Object.keys(d.category_mapping).length + 1}`]: {
          assignment_kind: 'post',
          content_category: 'website',
          post_type: 'standard',
        },
      },
    }));
  };

  const aliases = draft.category_aliases ?? {};
  const setAliases = (next: Record<string, string>) =>
    setDraft((d) => d && ({ ...d, category_aliases: next }));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales/settings"><ArrowLeft className="h-4 w-4 mr-1" /> Settings</Link>
          </Button>
          <h1 className="text-2xl font-semibold">Assignment defaults</h1>
        </div>
        <Button
          onClick={() => save.mutate(draft)}
          disabled={save.isPending}
        >
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
      </div>

      <p className="text-sm text-muted-foreground flex gap-2 items-start">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        These rules drive what the "Generate assignments" dialog plans when an invoice is created. Edits take effect immediately.
      </p>

      {/* Recurrence */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">Recurring defaults</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1">
            <Label className="text-xs">Default months</Label>
            <Input
              type="number"
              min={1}
              value={draft.default_months_for_recurring}
              onChange={(e) =>
                setDraft({ ...draft, default_months_for_recurring: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Max months</Label>
            <Input
              type="number"
              min={1}
              value={draft.max_months_for_recurring}
              onChange={(e) =>
                setDraft({ ...draft, max_months_for_recurring: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Default stagger</Label>
            <Select
              value={draft.default_stagger}
              onValueChange={(v) => setDraft({ ...draft, default_stagger: v as any })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Category mapping */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Category mapping</h2>
          <Button variant="outline" size="sm" onClick={() => addRule()}>
            <Plus className="h-4 w-4 mr-1" /> Add category
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Content category</TableHead>
              <TableHead>Post type</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(draft.category_mapping).map(([key, rule]) => {
              const isPost = rule.assignment_kind === 'post';
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Input
                      defaultValue={key}
                      onBlur={(e) => renameKey(key, e.target.value.trim())}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={rule.assignment_kind}
                      onValueChange={(v) => updateRule(key, { assignment_kind: v as any })}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {KIND_OPTIONS.map((k) => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {isPost ? (
                      <Select
                        value={rule.content_category}
                        onValueChange={(v) => updateRule(key, { content_category: v })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONTENT_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">n/a</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isPost ? (
                      <Select
                        value={rule.post_type}
                        onValueChange={(v) => updateRule(key, { post_type: v })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {POST_TYPES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">n/a</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeRule(key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Aliases */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Aliases</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAliases({ ...aliases, ['']: '' })}
          >
            <Plus className="h-4 w-4 mr-1" /> Add alias
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Map alternate spellings (case-insensitive) to a canonical category above. E.g. <code>display ad</code> → <code>Display Ads</code>.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alias</TableHead>
              <TableHead>Maps to</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(aliases).map(([alias, target], idx) => (
              <TableRow key={`${idx}-${alias}`}>
                <TableCell>
                  <Input
                    defaultValue={alias}
                    onBlur={(e) => {
                      const next = { ...aliases };
                      delete next[alias];
                      next[e.target.value.trim().toLowerCase()] = target;
                      setAliases(next);
                    }}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={target}
                    onValueChange={(v) => setAliases({ ...aliases, [alias]: v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(draft.category_mapping).map((k) => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const next = { ...aliases };
                      delete next[alias];
                      setAliases(next);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Unmapped categories */}
      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Unmapped product categories</h2>
        {unmapped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All product categories currently in use are mapped.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unmapped.map((c) => (
              <Badge
                key={c}
                variant="destructive"
                className="cursor-pointer"
                onClick={() => addRule(c)}
                title="Click to add a mapping row prefilled with this category"
              >
                {c} +
              </Badge>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
