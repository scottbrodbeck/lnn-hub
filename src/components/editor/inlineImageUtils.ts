export interface InlineImageAttrs {
  src: string;
  alt?: string | null;
  caption?: string | null;
  recordId?: string | null;
  sourceUrl?: string | null;
  wpMediaId?: number | null;
  wpUrl?: string | null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const normalizeInlineImageAttrs = (attrs: InlineImageAttrs): InlineImageAttrs => {
  const normalizedCaption = attrs.caption?.trim() || null;
  const normalizedAlt = attrs.alt?.trim() || normalizedCaption || '';
  const normalizedSourceUrl =
    attrs.sourceUrl?.trim() || (attrs.wpUrl && attrs.src === attrs.wpUrl ? null : attrs.src);

  return {
    src: attrs.src,
    alt: normalizedAlt,
    caption: normalizedCaption,
    recordId: attrs.recordId || null,
    sourceUrl: normalizedSourceUrl,
    wpMediaId: typeof attrs.wpMediaId === 'number' ? attrs.wpMediaId : null,
    wpUrl: attrs.wpUrl || null,
  };
};

export const getInlineImageHtml = (attrs: InlineImageAttrs) => {
  const normalized = normalizeInlineImageAttrs(attrs);
  const attributePairs = [
    ['data-inline-image', 'true'],
    normalized.recordId ? ['data-record-id', normalized.recordId] : null,
    normalized.sourceUrl ? ['data-source-url', normalized.sourceUrl] : null,
    normalized.wpMediaId ? ['data-wp-media-id', String(normalized.wpMediaId)] : null,
    normalized.wpUrl ? ['data-wp-url', normalized.wpUrl] : null,
  ].filter(Boolean) as [string, string][];

  const figureAttributes = attributePairs.map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(' ');
  const imgAlt = normalized.alt || normalized.caption || '';
  const figcaption = normalized.caption
    ? `<figcaption>${escapeHtml(normalized.caption)}</figcaption>`
    : '';

  return `<figure ${figureAttributes}><img src="${escapeHtml(normalized.src)}" alt="${escapeHtml(imgAlt)}" />${figcaption}</figure>`;
};

export const extractInlineImageAttrs = (element: HTMLElement): InlineImageAttrs | null => {
  const isImage = element.tagName === 'IMG';
  const figure = isImage ? element.closest('figure') : element;
  const image = isImage ? (element as HTMLImageElement) : figure?.querySelector('img');

  if (!image) return null;

  const caption = figure?.querySelector('figcaption')?.textContent?.trim() || null;
  const recordId = figure?.getAttribute('data-record-id') || image.getAttribute('data-record-id');
  const sourceUrl = figure?.getAttribute('data-source-url') || image.getAttribute('data-source-url');
  const wpMediaId = figure?.getAttribute('data-wp-media-id') || image.getAttribute('data-wp-media-id');
  const wpUrl = figure?.getAttribute('data-wp-url') || image.getAttribute('data-wp-url');

  return normalizeInlineImageAttrs({
    src: wpUrl || image.getAttribute('src') || '',
    alt: image.getAttribute('alt'),
    caption,
    recordId,
    sourceUrl,
    wpMediaId: wpMediaId ? Number(wpMediaId) : null,
    wpUrl,
  });
};
