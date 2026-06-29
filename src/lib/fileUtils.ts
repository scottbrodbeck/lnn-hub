/**
 * Sanitize a filename for safe use in storage paths.
 * Replaces any character that isn't alphanumeric, a dot, underscore, or hyphen
 * with an underscore. This handles macOS non-breaking spaces (U+00A0) and other
 * problematic characters.
 */
export const sanitizeFilename = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_');
