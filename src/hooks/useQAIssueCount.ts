import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useQAIssueCount() {
  const [issueCount, setIssueCount] = useState(0);

  const fetchCount = async () => {
    const { count } = await supabase
      .from('qa_checks')
      .select('*', { count: 'exact', head: true })
      .in('status', ['fail', 'error'])
      .eq('is_dismissed', false);

    setIssueCount(count || 0);
  };

  useEffect(() => {
    fetchCount();

    const channel = supabase
      .channel('qa-issue-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'qa_checks' },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { issueCount };
}
