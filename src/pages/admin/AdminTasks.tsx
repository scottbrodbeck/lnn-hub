import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TasksRequestsContent } from '@/components/admin/TasksRequestsContent';
import { DailyChecklistContent } from '@/components/admin/DailyChecklistContent';
import { useChecklistCount } from '@/hooks/useChecklistCount';

export default function AdminTasks() {
  const [pendingCount, setPendingCount] = useState(0);
  const { checklistUncheckedCount, setChecklistUncheckedCount } = useChecklistCount();

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Review pending requests and today's scheduled items
        </p>
      </div>

      <Tabs defaultValue="requests" className="space-y-6">
        <TabsList>
          <TabsTrigger value="requests" className="relative">
            Requests
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="checklist">
            Daily Checklist
            {checklistUncheckedCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {checklistUncheckedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <TasksRequestsContent onPendingCountChange={setPendingCount} />
        </TabsContent>

        <TabsContent value="checklist">
          <DailyChecklistContent onUncheckedCountChange={setChecklistUncheckedCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
