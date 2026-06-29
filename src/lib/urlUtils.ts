import { supabase } from '@/integrations/supabase/client';

/**
 * If a non-empty string doesn't start with http:// or https://, prepend https://
 */
export function normalizeUrl(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Calls the check-url edge function to see if a URL returns a 404.
 * Returns true if the URL is a 404, false for all other cases (including errors).
 */
export async function checkUrl404(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const { data, error } = await supabase.functions.invoke('check-url', {
      body: { url },
    });
    if (error) return false;
    return data?.is404 === true;
  } catch {
    return false;
  }
}
