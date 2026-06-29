import { ProcessedImage } from '@/components/ImageUpload';

export type StoredImageValue =
  | string
  | {
      id?: string;
      originalUrl?: string | null;
      processedUrl?: string | null;
      url?: string | null;
      thumbnailUrl?: string | null;
      isFeatured?: boolean | null;
      caption?: string | null;
      recordId?: string | null;
    };

const normalizeCaption = (caption?: string | null) => {
  const trimmed = caption?.trim();
  return trimmed ? trimmed : undefined;
};

export const getStoredImageUrl = (image?: StoredImageValue | null): string | null => {
  if (!image) return null;
  if (typeof image === 'string') {
    return image || null;
  }

  return image.processedUrl || image.originalUrl || image.url || null;
};

const toProcessedImage = (
  image?: StoredImageValue | null,
  fallbackFeatured = false,
  featuredUrl?: string | null,
  featuredRecordId?: string | null,
): ProcessedImage | null => {
  const url = getStoredImageUrl(image);
  if (!url) return null;

  if (typeof image === 'string') {
    return {
      id: crypto.randomUUID(),
      originalUrl: url,
      processedUrl: url,
      isFeatured: fallbackFeatured || (featuredUrl ? url === featuredUrl : false),
    };
  }

  const matchesFeaturedRecord = !!featuredRecordId && image.recordId === featuredRecordId;

  return {
    id: image.id || crypto.randomUUID(),
    originalUrl: image.originalUrl || url,
    processedUrl: image.processedUrl || url,
    thumbnailUrl: image.thumbnailUrl || undefined,
    isFeatured:
      Boolean(image.isFeatured) ||
      fallbackFeatured ||
      matchesFeaturedRecord ||
      (featuredUrl ? url === featuredUrl : false),
    caption: normalizeCaption(image.caption),
    recordId: image.recordId || undefined,
  };
};

export const normalizePostImages = (
  featuredImage?: StoredImageValue | null,
  galleryImages?: StoredImageValue[] | null,
  featuredImageId?: string | null,
): ProcessedImage[] => {
  const featuredUrl = getStoredImageUrl(featuredImage);
  const normalizedImages: ProcessedImage[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();

  const addImage = (image?: StoredImageValue | null, fallbackFeatured = false) => {
    const normalized = toProcessedImage(image, fallbackFeatured, featuredUrl, featuredImageId);
    if (!normalized) return;

    const urlKey = normalized.processedUrl || normalized.originalUrl;
    if (seenIds.has(normalized.id) || (urlKey && seenUrls.has(urlKey))) {
      const existing = normalizedImages.find((item) =>
        urlKey ? (item.processedUrl || item.originalUrl) === urlKey : item.id === normalized.id,
      );
      if (existing) {
        existing.isFeatured = existing.isFeatured || normalized.isFeatured;
        existing.caption = existing.caption || normalized.caption;
        existing.thumbnailUrl = existing.thumbnailUrl || normalized.thumbnailUrl;
        existing.recordId = existing.recordId || normalized.recordId;
      }
      return;
    }

    seenIds.add(normalized.id);
    if (urlKey) seenUrls.add(urlKey);
    normalizedImages.push(normalized);
  };

  addImage(featuredImage, !!featuredImage);

  if (Array.isArray(galleryImages)) {
    galleryImages.forEach((image) => addImage(image));
  }

  if (featuredImageId && !normalizedImages.some((image) => image.isFeatured && image.recordId === featuredImageId)) {
    const matchingRecord = normalizedImages.find((image) => image.recordId === featuredImageId);
    if (matchingRecord) {
      normalizedImages.forEach((image) => {
        if (image.recordId === featuredImageId) {
          image.isFeatured = true;
        } else if (image.isFeatured) {
          image.isFeatured = false;
        }
      });
    }
  }

  if (normalizedImages.length > 0 && !normalizedImages.some((image) => image.isFeatured)) {
    normalizedImages[0] = {
      ...normalizedImages[0],
      isFeatured: true,
    };
  }

  return normalizedImages;
};

export const serializePostImages = (images: ProcessedImage[]) =>
  images.map((image) => ({
    id: image.id,
    originalUrl: image.originalUrl,
    processedUrl: image.processedUrl,
    thumbnailUrl: image.thumbnailUrl,
    isFeatured: image.isFeatured,
    caption: normalizeCaption(image.caption),
    recordId: image.recordId,
  }));

export const getFeaturedImage = (images: ProcessedImage[]) =>
  images.find((image) => image.isFeatured) || images[0] || null;

export const getNonFeaturedImages = (images: ProcessedImage[]) => {
  const featuredImage = getFeaturedImage(images);
  if (!featuredImage) return [];

  const featuredUrl = featuredImage.processedUrl || featuredImage.originalUrl;
  return images.filter((image) => {
    const imageUrl = image.processedUrl || image.originalUrl;
    if (image.id === featuredImage.id) return false;
    if (featuredUrl && imageUrl === featuredUrl) return false;
    return !image.isFeatured;
  });
};
