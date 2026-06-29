import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the canonical app URL for external-facing links (e.g. Slack notifications).
 * Prefers VITE_APP_BASE_URL when set (keeps links stable across staging/prod);
 * otherwise falls back to the current origin.
 */
export function getAppBaseUrl(): string {
  const canonical = (import.meta.env.VITE_APP_BASE_URL as string | undefined)?.trim();
  return canonical || window.location.origin;
}

/**
 * Returns the current page URL using the canonical base URL,
 * preserving path and query.
 */
export function getCleanCurrentUrl(): string {
  return getAppBaseUrl() + window.location.pathname + window.location.search;
}
