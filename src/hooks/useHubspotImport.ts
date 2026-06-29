import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type HubspotOwner = { id: string; email: string; name: string };
export type HubspotPipeline = {
  id: string;
  label: string;
  stages: { id: string; label: string; displayOrder: number; metadata?: any }[];
};
export type DiscoverResult = {
  counts: { companies: number; contacts: number; deals: number; products: number };
  owners: HubspotOwner[];
  hubspot_pipelines: HubspotPipeline[];
};

async function call<T>(action: string, params: any = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crm-hubspot-import', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useHubspotDiscover() {
  return useMutation({ mutationFn: () => call<DiscoverResult>('discover') });
}

export type OverwritePolicy = {
  companies: boolean;
  contacts: boolean;
  deals: boolean;
  products: boolean;
};

export function useHubspotPreview() {
  return useMutation({
    mutationFn: (params: {
      selected_entities: string[];
      owner_mapping: Record<string, string>;
      pipeline_id: string | null;
      stage_mapping: Record<string, string>;
      hubspot_pipeline_id?: string;
      overwrite_policy: OverwritePolicy;
    }) => call<{ batch_id: string; counts: any }>('preview', params),
  });
}

export function useHubspotCommit() {
  return useMutation({
    mutationFn: (params: { batch_id: string }) =>
      call<{ batch_id: string; errors: string[] }>('commit', params),
  });
}

export function useHubspotUndo() {
  return useMutation({
    mutationFn: (params: { batch_id: string }) =>
      call<{ batch_id: string; undone: boolean; deleted?: number; untagged?: number }>('undo', params),
  });
}

export function useHubspotDiscard() {
  return useMutation({
    mutationFn: (params: { batch_id: string }) => call<{ ok: boolean }>('discard', params),
  });
}
