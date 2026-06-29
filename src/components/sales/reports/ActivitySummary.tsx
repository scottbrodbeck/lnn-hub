import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Users, CheckSquare, Mail, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CrmActivityType } from '@/hooks/useCrmActivities';

const ICONS: Record<CrmActivityType, LucideIcon> = {
  call: Phone,
  meeting: Users,
  task: CheckSquare,
  email: Mail,
  note: FileText,
};

const LABELS: Record<CrmActivityType, string> = {
  call: 'Calls',
  meeting: 'Meetings',
  task: 'Tasks',
  email: 'Emails',
  note: 'Notes',
};

interface Props {
  data: { type: CrmActivityType; count: number }[];
}

export function ActivitySummary({ data }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {data.map((d) => {
            const Icon = ICONS[d.type];
            return (
              <div
                key={d.type}
                className="rounded-md border p-3 flex flex-col items-center justify-center text-center"
              >
                <Icon className="h-5 w-5 text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{d.count}</p>
                <p className="text-xs text-muted-foreground">{LABELS[d.type]}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
