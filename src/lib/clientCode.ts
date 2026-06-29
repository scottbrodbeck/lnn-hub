import { supabase } from '@/integrations/supabase/client';

// Canonical client_code generation: 3-letter prefix from the org name plus
// the lowest unused numeric suffix (e.g. "Acme Inc" → ACI1, ACI2, ...).

export function buildCodePrefix(name: string): string {
  const letters = name.normalize('NFD').replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 3) || 'ORG').toUpperCase();
}

export async function nextAvailableClientCode(prefix: string): Promise<string> {
  const { data } = await supabase
    .from('organizations')
    .select('client_code')
    .ilike('client_code', `${prefix}%`);
  const used = new Set<number>(
    (data ?? [])
      .map((r: any) => (r.client_code ?? '').toUpperCase())
      .filter((c: string) => c.startsWith(prefix) && /^[A-Z]+\d+$/.test(c))
      .map((c: string) => parseInt(c.slice(prefix.length), 10))
      .filter((n: number) => Number.isFinite(n)),
  );
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}
