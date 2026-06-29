import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useCrmPipelines } from '@/hooks/useCrmPipeline';
import { useSalesEligibleUsers } from '@/hooks/useSalesEligibleUsers';

export type DatePreset = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface ReportsFilterState {
  preset: DatePreset;
  from: string; // YYYY-MM-DD
  to: string;
  pipelineId?: string;
  ownerIds: string[];
}

interface Props {
  value: ReportsFilterState;
  onChange: (v: ReportsFilterState) => void;
}

export function presetRange(preset: DatePreset, fallbackFrom: string, fallbackTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = today;
  if (preset === 'week') {
    const day = (today.getDay() + 6) % 7;
    from = new Date(today);
    from.setDate(today.getDate() - day);
  } else if (preset === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === 'quarter') {
    const qStart = Math.floor(today.getMonth() / 3) * 3;
    from = new Date(today.getFullYear(), qStart, 1);
  } else if (preset === 'year') {
    from = new Date(today.getFullYear(), 0, 1);
  } else {
    return { from: fallbackFrom, to: fallbackTo };
  }
  const to = new Date(today);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function ReportsToolbar({ value, onChange }: Props) {
  const { data: pipelines = [] } = useCrmPipelines();
  const { data: users = [] } = useSalesEligibleUsers();

  const presets: { key: DatePreset; label: string }[] = useMemo(
    () => [
      { key: 'week', label: 'This week' },
      { key: 'month', label: 'This month' },
      { key: 'quarter', label: 'This quarter' },
      { key: 'year', label: 'This year' },
      { key: 'custom', label: 'Custom' },
    ],
    []
  );

  const setPreset = (p: DatePreset) => {
    const r = presetRange(p, value.from, value.to);
    onChange({ ...value, preset: p, from: r.from, to: r.to });
  };

  const toggleOwner = (id: string) => {
    const set = new Set(value.ownerIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, ownerIds: Array.from(set) });
  };

  const ownerLabel =
    value.ownerIds.length === 0
      ? 'All owners'
      : value.ownerIds.length === 1
        ? users.find((u) => u.id === value.ownerIds[0])?.full_name ?? '1 owner'
        : `${value.ownerIds.length} owners`;

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button
              key={p.key}
              variant={value.preset === p.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, preset: 'custom', from: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, preset: 'custom', to: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="grid gap-1 min-w-[180px]">
            <Label className="text-xs">Pipeline</Label>
            <Select
              value={value.pipelineId ?? '__all__'}
              onValueChange={(v) => onChange({ ...value, pipelineId: v === '__all__' ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All pipelines</SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Owners</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[180px] justify-start">
                  {ownerLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onChange({ ...value, ownerIds: [] })}
                  >
                    All owners
                  </Button>
                  {users.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={value.ownerIds.includes(u.id)}
                        onCheckedChange={() => toggleOwner(u.id)}
                      />
                      <span className="text-sm truncate">{u.full_name ?? u.email}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
