import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface W9DocumentPointer {
  file_path: string;
  file_name: string;
  uploaded_at: string;
  uploaded_by?: string | null;
}

export const W9_BUCKET = 'tax-documents';

export function useW9Document() {
  return useQuery({
    queryKey: ['w9-document'],
    queryFn: async (): Promise<W9DocumentPointer | null> => {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'w9_document')
        .maybeSingle();

      if (error) throw error;
      if (!data?.value) return null;
      return data.value as unknown as W9DocumentPointer;
    },
    staleTime: 60_000,
  });
}

/**
 * Get a short-lived signed URL for the current W-9. Bucket is private, so
 * every download goes through a signed URL (any authenticated user can request).
 */
export async function getW9SignedUrl(filePath: string, fileName?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(W9_BUCKET)
    .createSignedUrl(filePath, 60 * 5, {
      download: fileName ?? true,
    });
  if (error) throw error;
  return data.signedUrl;
}
