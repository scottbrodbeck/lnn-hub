import { useCallback, useEffect, useRef, useState } from 'react';
import { listMediaLibraryItems, type MediaLibraryItemRecord, type MediaLibraryType } from '@/lib/mediaLibraryApi';

type MediaType = MediaLibraryType;

interface UseMediaLibraryOptions {
  activeOrganizationId?: string | null;
  requireOrganization?: boolean;
}

export interface MediaItem {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  date: string;
  recordId?: string;
  wpMediaId?: number | null;
  wpUrl?: string | null;
  storagePath?: string;
}

const PAGE_SIZE = 48;

const mergeMediaItems = (existing: MediaItem[], incoming: MediaItem[]) => {
  const merged = new Map<string, MediaItem>();

  [...existing, ...incoming].forEach((item) => {
    merged.set(item.recordId || item.url, item);
  });

  return Array.from(merged.values());
};

const mapMediaRecord = (item: MediaLibraryItemRecord): MediaItem => ({
  url: item.public_url,
  thumbnailUrl: item.thumbnail_url || undefined,
  caption: item.caption || undefined,
  date: item.uploaded_at,
  recordId: item.id,
  wpMediaId: null,
  wpUrl: null,
  storagePath: item.storage_path,
});

export const useMediaLibrary = (type: MediaType, options: UseMediaLibraryOptions = {}) => {
  const { activeOrganizationId = null, requireOrganization = false } = options;
  const [images, setImages] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pageRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      if (requireOrganization && !activeOrganizationId) {
        setImages([]);
        setHasMore(false);
        setError(null);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        const records = await listMediaLibraryItems({
          type,
          organizationId: activeOrganizationId,
          page,
          pageSize: PAGE_SIZE,
        });

        const nextItems = records.map(mapMediaRecord);
        setImages((current) => (append ? mergeMediaItems(current, nextItems) : nextItems));
        setHasMore(nextItems.length === PAGE_SIZE);
      } catch (err) {
        setError(err as Error);
        console.error('Error fetching media library:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeOrganizationId, requireOrganization, type],
  );

  const reset = useCallback(async () => {
    pageRef.current = 0;
    await fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    await fetchPage(nextPage, true);
  }, [fetchPage, hasMore, isLoading, isLoadingMore]);

  useEffect(() => {
    pageRef.current = 0;
    setImages([]);
    setHasMore(false);
    setError(null);
    void fetchPage(0, false);
  }, [fetchPage]);

  return {
    images,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch: reset,
    reset,
  };
};
