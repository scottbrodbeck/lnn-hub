import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the clean published app URL for use in external-facing links (e.g. Slack notifications).
 * Avoids long Lovable preview URLs that contain auth tokens.
 */
export function getAppBaseUrl(): string {
  const publishedUrl = 'https://client.lnn.co';
  if (
    window.location.origin.includes('lovableproject.com') ||
    window.location.origin.includes('-preview--')
  ) {
    return publishedUrl;
  }
  return window.location.origin;
}

/**
 * Returns the current page URL using the clean base URL,
 * stripping out long preview tokens while preserving path and query.
 */
export function getCleanCurrentUrl(): string {
  const base = getAppBaseUrl();
  const params = new URLSearchParams(window.location.search);
  const keysToRemove = Array.from(params.keys()).filter(k => k.startsWith('__lovable_'));
  keysToRemove.forEach(k => params.delete(k));
  const search = params.toString();
  return base + window.location.pathname + (search ? `?${search}` : '');
}
