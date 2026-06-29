import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BlastStats {
  email_sent_count?: number;
  email_unique_opens?: number;
  email_total_opens?: number;
  email_unique_clicks?: number;
  email_total_clicks?: number;
  email_unsubscribes?: number;
  email_open_rate?: number;
  email_click_rate?: number;
  web_views?: number;
  web_clicks?: number;
}

interface UseEmailBlastStatsResult {
  stats: BlastStats | null;
  isLoading: boolean;
  error: string | null;
  cached: boolean;
  cachedAt: string | null;
  refetch: () => Promise<void>;
}

export type EmailPlatform = 'beehiiv' | 'mailchimp';

export function useEmailBlastStats(
  blastId: string | undefined,
  siteId: string | undefined,
  isPublished: boolean,
  platform: EmailPlatform = 'beehiiv'
): UseEmailBlastStatsResult {
  const [stats, setStats] = useState<BlastStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!blastId || !siteId || !isPublished) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const statsFunction = platform === 'mailchimp' ? 'get-mailchimp-stats' : 'get-beehiiv-stats';
      const { data, error: invokeError } = await supabase.functions.invoke(statsFunction, {
        body: { blastId, siteId },
      });

      if (invokeError) {
        throw invokeError;
      }

      if (data.error && !data.stats) {
        // Some errors are expected (e.g., platform not configured)
        console.log('Stats not available:', data.error);
        setStats(null);
        return;
      }

      setStats(data.stats || null);
      setCached(data.cached || false);
      setCachedAt(data.cached_at || null);
    } catch (err) {
      console.error('Failed to fetch blast stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setIsLoading(false);
    }
  }, [blastId, siteId, isPublished, platform]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, cached, cachedAt, refetch: fetchStats };
}
