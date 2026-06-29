import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmPipelines } from '@/hooks/useCrmPipeline';
import { usePreferredPipeline, useSetPreferredPipeline } from '@/hooks/usePreferredPipeline';

export function MyPreferencesPanel() {
  const { data: pipelines = [] } = useCrmPipelines();
  const { data: preferred } = usePreferredPipeline();
  const set = useSetPreferredPipeline();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>My preferences</CardTitle>
        <CardDescription>Personal sales settings — only you see these.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Default pipeline</label>
          <p className="text-xs text-muted-foreground mb-2">
            The pipeline opened by default on the Pipeline view. You can still switch anytime.
          </p>
          <Select
            value={preferred ?? '__none__'}
            onValueChange={(v) => set.mutate(v === '__none__' ? null : v)}
          >
            <SelectTrigger className="w-80">
              <SelectValue placeholder="Use system default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Use system default</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
