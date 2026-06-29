import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useAdminPendingCount() {
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    const { count: editCount } = await supabase
      .from('post_edit_requests')
      .select('*', { count: 'exact', head: true })
      .or('status.eq.pending,and(status.eq.approved,acknowledged_at.is.null,request_type.neq.date_change)');
    const { count: supportCount } = await supabase
      .from('support_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: sponsorshipCount } = await supabase
      .from('email_sponsorships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: blastCount } = await supabase
      .from('email_blasts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted');
    
    setPendingRequestCount(
      (editCount || 0) + (supportCount || 0) + (sponsorshipCount || 0) + (blastCount || 0)
    );
  }, []);

  useEffect(() => {
    fetchPendingCount();

    const channel = supabase
      .channel('admin-pending-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_edit_requests' }, () => fetchPendingCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests' }, () => fetchPendingCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_sponsorships' }, () => fetchPendingCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_blasts' }, () => fetchPendingCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPendingCount]);

  return { pendingRequestCount };
}
