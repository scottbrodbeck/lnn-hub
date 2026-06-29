import type { SocialPost } from '@/lib/postUtils';

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const stripHtmlWithFallback = (html: string) =>
  normalizeWhitespace(
    html
      .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
      .replace(/<img[^>]*>/gi, ' ')
      .replace(/<video[\s\S]*?<\/video>/gi, ' ')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  );

export const extractSocialTextFromHtml = (html: string) => {
  if (!html) return '';

  if (typeof document === 'undefined') {
    return stripHtmlWithFallback(html);
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  container
    .querySelectorAll('figure, figcaption, img, video, iframe, script, style, [data-inline-image="true"]')
    .forEach((node) => node.remove());

  return normalizeWhitespace(container.textContent || '');
};

export const extractFirstSentenceFromHtml = (html: string) => {
  const text = extractSocialTextFromHtml(html);
  if (!text) return '';

  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/);
  if (sentenceMatch) {
    return sentenceMatch[0].trim();
  }

  return text.slice(0, 140).trim();
};

const createSocialPost = (text: string, type: SocialPost['type']): SocialPost => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  type,
  edited: false,
});

const truncateSocialPostText = (text: string, maxLength = 200) => {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

const createQuotedSocialPost = (text: string, type: SocialPost['type']): SocialPost =>
  createSocialPost(`"${truncateSocialPostText(text)}"`, type);

export const createDefaultSocialPosts = (headline: string, content: string): SocialPost[] => {
  const cleanHeadline = headline.trim();
  const firstSentence = extractFirstSentenceFromHtml(content);
  const bodyPreview = extractSocialTextFromHtml(content).slice(0, 140).trim();
  const fallbackSecondPost = firstSentence && firstSentence !== cleanHeadline ? firstSentence : bodyPreview || cleanHeadline;

  return [
    createSocialPost(cleanHeadline, 'informative'),
    createQuotedSocialPost(fallbackSecondPost, 'informative'),
  ];
};

export const createManualSocialPosts = (firstPost: string, secondPost: string): SocialPost[] => [
  createSocialPost(firstPost, 'custom'),
  createSocialPost(secondPost, 'custom'),
];

const normalizeForCompare = (value: string) =>
  normalizeWhitespace(value || '').toLowerCase();

/**
 * Returns true when every persisted social post matches one of the texts that
 * `createDefaultSocialPosts(headline, content)` would produce. Used to decide
 * whether a post should generate a "Review social posts" task — a post whose
 * suggestions are unchanged from the deterministic defaults should NOT.
 *
 * Falls back to the legacy `edited`/`type` flag check when headline/content
 * aren't available (or the persisted shape lacks `text`).
 */
export const areSocialPostsDefault = (
  posts: Array<{ text?: string; type?: string; edited?: boolean }>,
  headline?: string | null,
  content?: string | null,
): boolean => {
  if (!posts || posts.length === 0) return true;

  if (!headline) {
    // No reference to compare against — fall back to flag-based detection.
    return !posts.some(p => p.edited === true || (p.type && p.type !== 'informative'));
  }

  const defaults = createDefaultSocialPosts(headline || '', content || '');
  const defaultTexts = new Set(defaults.map(d => normalizeForCompare(d.text)));

  return posts.every(p => {
    const text = normalizeForCompare(p.text || '');
    if (!text) return true;
    return defaultTexts.has(text);
  });
};
