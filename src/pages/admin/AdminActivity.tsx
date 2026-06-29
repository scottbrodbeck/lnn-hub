import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QAAgentContent } from '@/components/admin/QAAgentContent';
import { LogsContent } from '@/components/admin/LogsContent';
import { OrphanedPostsContent } from '@/components/admin/OrphanedPostsContent';
import { supabase } from '@/integrations/supabase/client';

export default function AdminActivity() {
  const [orphanedCount, setOrphanedCount] = useState(0);

  useEffect(() => {
    const fetchOrphanedCount = async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, assignment_ids')
        .eq('status', 'published');
      
      const orphaned = (data || []).filter(post => 
        !post.assignment_ids || post.assignment_ids.length === 0
      );
      setOrphanedCount(orphaned.length);
    };
    fetchOrphanedCount();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Activity</h1>
        <p className="text-muted-foreground mt-2">
          QA verification, system logs, and orphaned post management
        </p>
      </div>

      <Tabs defaultValue="qa-agent" className="space-y-6">
        <TabsList>
          <TabsTrigger value="qa-agent">QA Agent</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="orphaned">
            Orphaned Posts {orphanedCount > 0 && `(${orphanedCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qa-agent">
          <QAAgentContent />
        </TabsContent>

        <TabsContent value="logs">
          <LogsContent />
        </TabsContent>

        <TabsContent value="orphaned">
          <OrphanedPostsContent onCountChange={setOrphanedCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
