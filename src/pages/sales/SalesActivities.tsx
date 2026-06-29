import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useCrmActivities, type CrmActivityType, type ActivitiesFilters } from '@/hooks/useCrmActivities';
import { ActivityRow } from '@/components/sales/ActivityRow';
import { ActivityComposer } from '@/components/sales/ActivityComposer';
import { OwnerPicker } from '@/components/sales/OwnerPicker';

const TYPES: CrmActivityType[] = ['task', 'call', 'meeting', 'email', 'note'];
const SCOPES: ActivitiesFilters['scope'][] = ['overdue', 'today', 'upcoming', 'completed'];

function ScopeList({ filters }: { filters: ActivitiesFilters }) {
  const { data: activities = [], isLoading } = useCrmActivities(filters);
  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  if (activities.length === 0) return <p className="text-sm text-muted-foreground py-4">Nothing here.</p>;
  return (
    <div className="space-y-2">
      {activities.map((a) => <ActivityRow key={a.id} activity={a} />)}
    </div>
  );
}

export default function SalesActivities() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [type, setType] = useState<CrmActivityType | 'all'>('all');
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const baseFilters: Omit<ActivitiesFilters, 'scope'> = {
    type: type === 'all' ? undefined : type,
    ownerId: ownerId ?? undefined,
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activities</h1>
        <Button onClick={() => setComposerOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Log activity
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <OwnerPicker value={ownerId} onChange={setOwnerId} placeholder="Any owner" />
        </div>
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          {SCOPES.map((s) => (
            <TabsTrigger key={s} value={s as string} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>
        {SCOPES.map((s) => (
          <TabsContent key={s} value={s as string} className="mt-4">
            <ScopeList filters={{ ...baseFilters, scope: s }} />
          </TabsContent>
        ))}
      </Tabs>

      <ActivityComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}
