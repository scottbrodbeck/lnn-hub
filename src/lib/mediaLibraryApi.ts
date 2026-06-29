import { supabase } from '@/integrations/supabase/client';

export type MediaLibraryType = 'media' | 'logo';

export interface MediaLibraryItemRecord {
  id: string;
  public_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  uploaded_at: string;
  storage_path: string;
  original_filename: string;
}

interface MediaLibraryListResponse {
  items?: MediaLibraryItemRecord[];
}

interface MediaLibraryLookupResponse {
  items?: MediaLibraryItemRecord[];
}

const invokeMediaLibrary = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('media-library', { body });

  if (error) {
    throw error;
  }

  return (data ?? {}) as T;
};

export const listMediaLibraryItems = async ({
  type,
  organizationId,
  page,
  pageSize,
}: {
  type: MediaLibraryType;
  organizationId?: string | null;
  page: number;
  pageSize: number;
}) => {
  const data = await invokeMediaLibrary<MediaLibraryListResponse>({
    action: 'list',
    type,
    organizationId: organizationId ?? null,
    page,
    pageSize,
  });

  return data.items ?? [];
};

export const updateMediaLibraryCaption = async ({
  recordId,
  imageUrl,
  caption,
  organizationId,
}: {
  recordId?: string | null;
  imageUrl?: string | null;
  caption: string | null;
  organizationId?: string | null;
}) => {
  await invokeMediaLibrary({
    action: 'update_caption',
    recordId: recordId ?? null,
    imageUrl: imageUrl ?? null,
    caption,
    organizationId: organizationId ?? null,
  });
};

export const deleteMediaLibraryItem = async ({
  recordId,
  imageUrl,
  organizationId,
}: {
  recordId?: string | null;
  imageUrl?: string | null;
  organizationId?: string | null;
}) => {
  await invokeMediaLibrary({
    action: 'delete',
    recordId: recordId ?? null,
    imageUrl: imageUrl ?? null,
    organizationId: organizationId ?? null,
  });
};

export const lookupMediaLibraryItemsByUrls = async ({
  urls,
  organizationId,
}: {
  urls: string[];
  organizationId?: string | null;
}) => {
  if (urls.length === 0) {
    return [] as MediaLibraryItemRecord[];
  }

  const data = await invokeMediaLibrary<MediaLibraryLookupResponse>({
    action: 'lookup_by_urls',
    urls,
    organizationId: organizationId ?? null,
  });

  return data.items ?? [];
};
