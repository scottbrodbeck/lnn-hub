import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeFilename } from '@/lib/fileUtils';
import { useAuth } from '@/contexts/AuthContext';

interface ProcessingImage {
  id: string;
  recordId: string;
  storagePath: string;
  originalUrl: string;
  startTime: number;
}

interface ProcessedResult {
  id: string;
  url: string;
  isOptimized: boolean;
}

const POLL_INTERVAL = 2000;
const TIMEOUT_MS = 30000;

export function useImageProcessing() {
  const { activeOrganizationId, role, user } = useAuth();
  const [processingImages, setProcessingImages] = useState<Map<string, ProcessingImage>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAnyProcessing = processingImages.size > 0;

  useEffect(() => {
    if (processingImages.size === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const checkStatus = async () => {
      const recordIds = Array.from(processingImages.values()).map((p) => p.recordId);

      const { data: records, error } = await supabase
        .from('image_uploads')
        .select('id, public_url, status, is_optimized')
        .in('id', recordIds);

      if (error) {
        console.error('Error polling image status:', error);
        return;
      }

      const now = Date.now();
      const completedIds: string[] = [];
      const timedOutIds: string[] = [];

      for (const [imageId, processing] of processingImages.entries()) {
        const record = records?.find((row) => row.id === processing.recordId);

        if (record?.status === 'ready') {
          completedIds.push(imageId);
          continue;
        }

        if (now - processing.startTime > TIMEOUT_MS) {
          console.warn(`Image ${imageId} timed out, using original`);
          timedOutIds.push(imageId);

          await supabase
            .from('image_uploads')
            .update({
              status: 'ready',
              is_optimized: false,
              processing_error: 'Processing timeout - using original image',
            })
            .eq('id', processing.recordId);
        }
      }

      if (completedIds.length > 0 || timedOutIds.length > 0) {
        setProcessingImages((prev) => {
          const next = new Map(prev);
          [...completedIds, ...timedOutIds].forEach((id) => next.delete(id));
          return next;
        });
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, POLL_INTERVAL);
    checkStatus();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [processingImages]);

  const uploadImage = useCallback(async (file: File): Promise<{ id: string; tempUrl: string; recordId: string }> => {
    if (!user) {
      throw new Error('You must be signed in to upload images.');
    }

    if (role === 'client' && !activeOrganizationId) {
      throw new Error('Select an organization before uploading images.');
    }

    const imageId = crypto.randomUUID();
    const safeName = sanitizeFilename(file.name);
    const ext = safeName.split('.').pop() || 'jpg';
    const storagePath = `uploads/${Date.now()}_${imageId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('editor-images')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('editor-images').getPublicUrl(storagePath);

    const { data: record, error: insertError } = await supabase
      .from('image_uploads')
      .insert({
        storage_path: storagePath,
        public_url: publicUrl,
        original_filename: safeName,
        file_size: file.size,
        status: 'processing',
        is_optimized: false,
        original_size: file.size,
        organization_id: role === 'client' ? activeOrganizationId : null,
        uploaded_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !record) {
      await supabase.storage.from('editor-images').remove([storagePath]);
      throw new Error(`Failed to create record: ${insertError?.message}`);
    }

    const processingImage: ProcessingImage = {
      id: imageId,
      recordId: record.id,
      storagePath,
      originalUrl: publicUrl,
      startTime: Date.now(),
    };

    setProcessingImages((prev) => new Map(prev).set(imageId, processingImage));

    supabase.functions.invoke('process-image-background', {
      body: { storagePath, recordId: record.id },
    }).catch((err) => {
      console.error('Background processing invoke failed:', err);
    });

    return {
      id: imageId,
      tempUrl: publicUrl,
      recordId: record.id,
    };
  }, [activeOrganizationId, role, user]);

  const getProcessedUrl = useCallback(async (recordId: string): Promise<{ url: string; status: string }> => {
    const { data, error } = await supabase
      .from('image_uploads')
      .select('public_url, thumbnail_url, status')
      .eq('id', recordId)
      .single();

    if (error || !data) {
      throw new Error('Failed to get processed URL');
    }

    return { url: data.public_url, status: data.status || 'ready' };
  }, []);

  const getThumbnailUrl = useCallback(async (recordId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('image_uploads')
      .select('thumbnail_url')
      .eq('id', recordId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.thumbnail_url;
  }, []);

  const isImageProcessing = useCallback((imageId: string): boolean => {
    return processingImages.has(imageId);
  }, [processingImages]);

  return {
    uploadImage,
    getProcessedUrl,
    getThumbnailUrl,
    isImageProcessing,
    isAnyProcessing,
    processingImages,
  };
}
