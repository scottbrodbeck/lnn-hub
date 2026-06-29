import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type HsDiagEntity = 'company' | 'contact' | 'deal' | 'line_item' | 'note' | 'task';

export type HsDiagStep = {
  name: string;
  ok: boolean;
  ms: number;
  status?: number;
  request?: any;
  response?: any;
  error?: string;
};

export type HsDiagResult = {
  ok: boolean;
  steps?: HsDiagStep[];
  created_id?: string | null;
  created_ids?: Record<string, string | null>;
  cleaned_up?: boolean;
  summary?: string;
  error?: string;
  // ping
  ms?: number;
  status?: number;
  response?: any;
  // cleanup
  scanned?: string[];
  archived?: Record<string, number>;
  errors?: any[];
};

export function useHubspotDiagnostics() {
  return useMutation({
    mutationFn: async (payload: { action: 'ping' | 'roundtrip' | 'cleanup-orphans'; entity?: HsDiagEntity }) => {
      const { data, error } = await supabase.functions.invoke('hubspot-diagnostics', { body: payload });
      if (error) throw new Error(error.message);
      return data as HsDiagResult;
    },
  });
}
