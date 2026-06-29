import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser as DenoDOMParser } from 'npm:linkedom@0.18.12';

function addSponsoredRelToLinks(html: string): string {
  if (!html || !html.includes('<a')) return html;
  const parser = new DenoDOMParser();
  const doc = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  if (!doc) return html;
  const links = doc.querySelectorAll('a');
  for (const link of links) {
    const existing = link.getAttribute('rel') || '';
    if (!existing.split(/\s+/).includes('sponsored')) {
      link.setAttribute('rel', (existing + ' sponsored').trim());
    }
  }
  return doc.querySelector('body').innerHTML;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WordPressCredentials {
  url: string;
  username: string;
  app_password: string;
}

interface PublishRequest {
  mode: 'test' | 'publish' | 'update';
  site_id?: string;
  post_id?: string;
  credentials?: WordPressCredentials;
}

interface WpApiResult {
  data: any;
  termExists: false;
}

interface WpApiTermExists {
  data: null;
  termExists: true;
  existingTermId: number;
}

async function readResponsePayload(resp: Response) {
  const text = await resp.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function createWordPressSyncSupportRequest({
  supabase,
  postId,
  fallbackSiteId,
  reason,
  origin,
}: {
  supabase: ReturnType<typeof createClient>;
  postId: string;
  fallbackSiteId?: string | null;
  reason: string;
  origin?: string | null;
}) {
  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, headline, client_id, wordpress_post_id, wordpress_site_id, assignment_ids')
      .eq('id', postId)
      .maybeSingle();

    if (postError || !post) {
      return {
        created: false,
        id: null,
        pageUrl: null,
        creationError: postError?.message || 'Post not found while creating support request',
      };
    }

    let organizationId: string | null = null;
    let siteId = post.wordpress_site_id ?? fallbackSiteId ?? null;
    let siteName: string | null = null;
    let assignmentName: string | null = null;

    if (post.assignment_ids?.length) {
      const { data: assignment } = await supabase
        .from('post_assignments')
        .select('organization_id, site_id, assignment_name, site:sites(name)')
        .eq('id', post.assignment_ids[0])
        .maybeSingle();

      organizationId = assignment?.organization_id ?? null;
      siteId = siteId ?? assignment?.site_id ?? null;
      siteName = (assignment?.site as { name?: string } | null)?.name ?? null;
      assignmentName = assignment?.assignment_name ?? null;
    }

    if (!siteName && siteId) {
      const { data: site } = await supabase
        .from('sites')
        .select('name')
        .eq('id', siteId)
        .maybeSingle();

      siteName = site?.name ?? null;
    }

    if (!post.client_id) {
      return {
        created: false,
        id: null,
        pageUrl: null,
        creationError: 'Post has no client_id, so an admin request could not be created automatically',
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, email, organization_id')
      .eq('id', post.client_id)
      .maybeSingle();

    if (profileError || !profile?.email) {
      return {
        created: false,
        id: null,
        pageUrl: null,
        creationError: profileError?.message || 'Client profile missing email for support request creation',
      };
    }

    organizationId = organizationId ?? profile.organization_id ?? null;

    const pagePath = `/client/edit?id=${post.id}&from=posts`;
    const pageUrl = origin ? `${origin.replace(/\/$/, '')}${pagePath}` : pagePath;
    const description = [
      'WordPress update failed after an admin-approved edit.',
      `Post: ${post.headline}`,
      `Post ID: ${post.id}`,
      `WordPress Post ID: ${post.wordpress_post_id ?? 'missing'}`,
      `Site: ${siteName ?? 'Unknown site'}`,
      assignmentName ? `Assignment: ${assignmentName}` : null,
      `Reason: ${reason}`,
      `View updated post: ${pageUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { data: supportRequest, error: supportRequestError } = await supabase
      .from('support_requests')
      .insert({
        user_id: post.client_id,
        organization_id: organizationId,
        request_category: 'support',
        description,
        contact_name: profile.full_name || profile.email,
        contact_email: profile.email,
        page_url: pageUrl,
      })
      .select('id')
      .single();

    if (supportRequestError) {
      return {
        created: false,
        id: null,
        pageUrl,
        creationError: supportRequestError.message,
      };
    }

    return {
      created: true,
      id: supportRequest?.id ?? null,
      pageUrl,
      creationError: null,
    };
  } catch (error) {
    return {
      created: false,
      id: null,
      pageUrl: null,
      creationError: error instanceof Error ? error.message : 'Unknown support request creation error',
    };
  }
}

// Helper for WordPress taxonomy POSTs — gracefully handles term_exists
async function wpApiPost(
  url: string,
  authHeader: string,
  body: any
): Promise<WpApiResult | WpApiTermExists> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await readResponsePayload(resp);

  if (!resp.ok) {
    if (resp.status === 400 && json?.code === 'term_exists') {
      const existingTermId = json?.data?.term_id ?? json?.data;
      console.log(`Term exists at ${url}, existing term ID:`, existingTermId);
      return { data: null, termExists: true, existingTermId: Number(existingTermId) };
    }
    throw new Error(`WP API error at ${url}: ${json?.message || resp.status}`);
  }

  return { data: json, termExists: false };
}

// Generate a URL-friendly slug with optional client code suffix
function generateSlug(headline: string, clientCode: string | null): string {
  let slug = headline
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (clientCode) {
    slug = `${slug}-${clientCode.toLowerCase()}`;
  }

  return slug;
}

// Upload a remote image URL to WordPress media library
async function uploadImageToWordPress(
  imageUrl: string,
  wpApiUrl: string,
  authHeader: string,
  filename: string,
  title?: string,
  caption?: string
): Promise<{ id: number; url: string } | null> {
  try {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) {
      console.error(`Failed to download image: ${imageUrl} — status ${imgResp.status}`);
      return null;
    }

    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
    const bodyBytes = new Uint8Array(await imgResp.arrayBuffer());

    const extMap: Record<string, string> = {
      'image/webp': '.webp', 'image/png': '.png',
      'image/gif': '.gif', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    };
    const correctExt = extMap[contentType] || '.jpg';
    const fixedFilename = filename.replace(/\.[^.]+$/, correctExt);

    const uploadResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Disposition': `attachment; filename="${fixedFilename}"`,
        'Content-Type': contentType,
      },
      body: bodyBytes,
    });

    const uploadJson = await uploadResp.json();

    if (!uploadResp.ok) {
      console.error(`Image upload failed for ${filename}:`, uploadJson);
      return null;
    }

    if (title || caption) {
      const metaResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/media/${uploadJson.id}`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || fixedFilename,
          caption: caption || '',
          alt_text: caption || title || fixedFilename,
        }),
      });
      await metaResp.text();
    }

    console.log(`Uploaded image ${filename} → WP media ID ${uploadJson.id}`);
    return { id: uploadJson.id, url: uploadJson.source_url };
  } catch (err) {
    console.error(`Error uploading image ${filename}:`, err);
    return null;
  }
}

async function updateWordPressMediaMeta(
  wpApiUrl: string,
  authHeader: string,
  mediaId: number,
  title?: string,
  caption?: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const response = await fetch(`${wpApiUrl}/wp-json/wp/v2/media/${mediaId}`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || `Media ${mediaId}`,
        caption: caption || '',
        alt_text: caption || title || `Media ${mediaId}`,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      console.error(`Failed to update media ${mediaId}:`, json);
      return null;
    }

    return { id: json.id, url: json.source_url };
  } catch (error) {
    console.error(`Failed to update media metadata for ${mediaId}:`, error);
    return null;
  }
}

interface CachedWordPressMedia {
  id: number;
  url: string;
  imageUploadId: string | null;
  supabaseUrl: string;
}

interface SyncedWordPressMedia {
  id: number;
  url: string;
  supabaseUrl: string;
  imageUploadId: string | null;
}

const getWordPressMediaCacheKey = (imageUploadId?: string | null, sourceUrl?: string | null) =>
  imageUploadId ? `record:${imageUploadId}` : `url:${sourceUrl || ''}`;

async function loadWordPressMediaMappings(
  supabase: ReturnType<typeof createClient>,
  siteId: string,
  options: { imageUploadIds?: string[]; sourceUrls?: string[] },
) {
  const mappings = new Map<string, CachedWordPressMedia>();
  const imageUploadIds = Array.from(new Set((options.imageUploadIds || []).filter(Boolean)));
  const sourceUrls = Array.from(new Set((options.sourceUrls || []).filter(Boolean)));

  if (imageUploadIds.length > 0) {
    const { data, error } = await supabase
      .from('wordpress_media_mappings')
      .select('image_upload_id, supabase_image_url, wordpress_media_id, wordpress_media_url')
      .eq('site_id', siteId)
      .in('image_upload_id', imageUploadIds);

    if (error) {
      console.error('Failed to load record-based media mappings:', error);
    } else {
      data?.forEach((mapping) => {
        mappings.set(getWordPressMediaCacheKey(mapping.image_upload_id, null), {
          id: mapping.wordpress_media_id,
          url: mapping.wordpress_media_url,
          imageUploadId: mapping.image_upload_id,
          supabaseUrl: mapping.supabase_image_url,
        });
      });
    }
  }

  if (sourceUrls.length > 0) {
    const { data, error } = await supabase
      .from('wordpress_media_mappings')
      .select('image_upload_id, supabase_image_url, wordpress_media_id, wordpress_media_url')
      .eq('site_id', siteId)
      .in('supabase_image_url', sourceUrls);

    if (error) {
      console.error('Failed to load URL-based media mappings:', error);
    } else {
      data?.forEach((mapping) => {
        mappings.set(getWordPressMediaCacheKey(null, mapping.supabase_image_url), {
          id: mapping.wordpress_media_id,
          url: mapping.wordpress_media_url,
          imageUploadId: mapping.image_upload_id,
          supabaseUrl: mapping.supabase_image_url,
        });

        if (mapping.image_upload_id) {
          mappings.set(getWordPressMediaCacheKey(mapping.image_upload_id, null), {
            id: mapping.wordpress_media_id,
            url: mapping.wordpress_media_url,
            imageUploadId: mapping.image_upload_id,
            supabaseUrl: mapping.supabase_image_url,
          });
        }
      });
    }
  }

  return mappings;
}

async function saveWordPressMediaMapping(
  supabase: ReturnType<typeof createClient>,
  params: {
    siteId: string | null;
    imageUploadId?: string | null;
    supabaseImageUrl: string | null;
    wordpressMediaId: number;
    wordpressMediaUrl: string;
  },
) {
  const { siteId, imageUploadId = null, supabaseImageUrl, wordpressMediaId, wordpressMediaUrl } = params;

  if (!siteId || !supabaseImageUrl) return;

  const basePayload = {
    site_id: siteId,
    image_upload_id: imageUploadId,
    supabase_image_url: supabaseImageUrl,
    wordpress_media_id: wordpressMediaId,
    wordpress_media_url: wordpressMediaUrl,
  };

  let lookup = null as { data: { id: string } | null; error: any } | null;

  if (imageUploadId) {
    lookup = await supabase
      .from('wordpress_media_mappings')
      .select('id')
      .eq('site_id', siteId)
      .eq('image_upload_id', imageUploadId)
      .maybeSingle();

    if (lookup.error) {
      console.error('Failed to look up existing media mapping by image_upload_id:', lookup.error);
      return;
    }
  }

  if (!lookup?.data?.id) {
    lookup = await supabase
      .from('wordpress_media_mappings')
      .select('id')
      .eq('site_id', siteId)
      .eq('supabase_image_url', supabaseImageUrl)
      .maybeSingle();

    if (lookup.error) {
      console.error('Failed to look up existing media mapping by source URL:', lookup.error);
      return;
    }
  }

  if (lookup?.data?.id) {
    const { error } = await supabase
      .from('wordpress_media_mappings')
      .update(basePayload)
      .eq('id', lookup.data.id);

    if (error) {
      console.error('Failed to update media mapping:', error);
    }
    return;
  }

  const { error } = await supabase.from('wordpress_media_mappings').insert(basePayload);
  if (error) {
    console.error('Failed to insert media mapping:', error);
  }
}

async function findImageUploadIdByUrl(
  supabase: ReturnType<typeof createClient>,
  sourceUrl?: string | null,
) {
  if (!sourceUrl) return null;

  const { data, error } = await supabase
    .from('image_uploads')
    .select('id')
    .eq('public_url', sourceUrl)
    .maybeSingle();

  if (error) {
    console.error('Failed to resolve image upload by URL:', error);
    return null;
  }

  return data?.id ?? null;
}

async function syncInlineImagesForWordPress(
  content: string,
  wpApiUrl: string,
  authHeader: string,
  postTitle: string,
  supabase: ReturnType<typeof createClient>,
  resolvedSiteId: string | null,
) {
  if (!content || !content.includes('<img')) {
    return {
      editorContent: content,
      wordpressContent: content,
      media: [] as SyncedWordPressMedia[],
    };
  }

  const parseHtml = (html: string) => {
    const parser = new DenoDOMParser();
    const doc = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
    if (!doc) throw new Error('Failed to parse post HTML for inline image sync');
    return doc;
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const getOptionalAttribute = (figure: any, image: any, attribute: string) =>
    figure.getAttribute(attribute) || image.getAttribute(attribute) || null;

  const getFigureMatches = (html: string) => {
    const matches: Array<{ html: string; start: number; end: number }> = [];
    const regex = /<figure\b[\s\S]*?<\/figure>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
      matches.push({
        html: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return matches;
  };

  const isInlineFigure = (figure: any, image: any) =>
    figure.hasAttribute('data-inline-image') ||
    figure.getAttribute('data-type') === 'inline-image' ||
    figure.hasAttribute('data-record-id') ||
    figure.hasAttribute('data-source-url') ||
    image.hasAttribute('data-record-id') ||
    image.hasAttribute('data-source-url') ||
    image.hasAttribute('data-wp-url');

  const buildAttributeString = (attributes: Array<[string, string | null | undefined]>) =>
    attributes
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
      .join(' ');

  const buildCanonicalInlineFigureHtml = ({
    src,
    alt,
    caption,
    recordId,
    sourceUrl,
    wpMediaId,
    wpUrl,
    figureClass,
    imageClass,
  }: {
    src: string;
    alt: string;
    caption: string | null;
    recordId?: string | null;
    sourceUrl?: string | null;
    wpMediaId: number;
    wpUrl: string;
    figureClass?: string | null;
    imageClass?: string | null;
  }) => {
    const figureAttributes = buildAttributeString([
      ['data-inline-image', 'true'],
      ['data-type', 'inline-image'],
      ['data-record-id', recordId],
      ['data-source-url', sourceUrl],
      ['data-wp-media-id', String(wpMediaId)],
      ['data-wp-url', wpUrl],
      ['class', figureClass],
    ]);

    const imageAttributes = buildAttributeString([
      ['src', src],
      ['alt', alt],
      ['data-record-id', recordId],
      ['data-source-url', sourceUrl],
      ['data-wp-media-id', String(wpMediaId)],
      ['data-wp-url', wpUrl],
      ['class', imageClass],
    ]);

    const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
    return `<figure ${figureAttributes}><img ${imageAttributes} />${figcaption}</figure>`;
  };

  const validateSyncedFigure = ({
    figure,
    image,
    wpMediaId,
    wpUrl,
    recordId,
    sourceUrl,
  }: {
    figure: any;
    image: any;
    wpMediaId: number;
    wpUrl: string;
    recordId?: string | null;
    sourceUrl?: string | null;
  }) => {
    const validations = [
      figure.getAttribute('data-inline-image') === 'true',
      figure.getAttribute('data-type') === 'inline-image',
      figure.getAttribute('data-wp-media-id') === String(wpMediaId),
      figure.getAttribute('data-wp-url') === wpUrl,
      image.getAttribute('src') === wpUrl,
      image.getAttribute('data-wp-media-id') === String(wpMediaId),
      image.getAttribute('data-wp-url') === wpUrl,
    ];

    if (recordId) {
      validations.push(figure.getAttribute('data-record-id') === recordId);
      validations.push(image.getAttribute('data-record-id') === recordId);
    }

    if (sourceUrl) {
      validations.push(figure.getAttribute('data-source-url') === sourceUrl);
      validations.push(image.getAttribute('data-source-url') === sourceUrl);
    }

    return validations.every(Boolean);
  };

  const applyFigureReplacements = (
    baseContent: string,
    figureMatches: Array<{ html: string; start: number; end: number }>,
    replacements: Map<number, string>,
  ) => {
    let cursor = 0;
    let output = '';

    figureMatches.forEach((match, index) => {
      output += baseContent.slice(cursor, match.start);
      output += replacements.get(index) || match.html;
      cursor = match.end;
    });

    output += baseContent.slice(cursor);
    return output;
  };

  const figureMatches = getFigureMatches(content);
  const syncedMedia: SyncedWordPressMedia[] = [];
  const failedNodeValidations: number[] = [];
  const editorReplacements = new Map<number, string>();
  const wordpressReplacements = new Map<number, string>();

  const inlineImages = figureMatches
    .map((match, matchIndex) => {
      const doc = parseHtml(match.html);
      const figure = doc.querySelector('figure') as any;
      const image = figure?.querySelector('img') as any;

      if (!figure || !image || !isInlineFigure(figure, image)) return null;

      return {
        index: matchIndex,
        originalHtml: match.html,
        recordId: getOptionalAttribute(figure, image, 'data-record-id'),
        sourceUrl: getOptionalAttribute(figure, image, 'data-source-url'),
        currentSourceUrl: image.getAttribute('src') || '',
        caption: figure.querySelector('figcaption')?.textContent?.trim() || image.getAttribute('alt') || '',
        currentAlt: image.getAttribute('alt') || '',
        currentMediaId: Number(getOptionalAttribute(figure, image, 'data-wp-media-id') || 0) || null,
        currentWpUrl: getOptionalAttribute(figure, image, 'data-wp-url'),
      };
    })
    .filter(Boolean) as Array<{
      index: number;
      originalHtml: string;
      recordId: string | null;
      sourceUrl: string | null;
      currentSourceUrl: string;
      caption: string;
      currentAlt: string;
      currentMediaId: number | null;
      currentWpUrl: string | null;
    }>;

  

  const recordSourceUrls = new Map<string, string>();
  const recordIds = Array.from(new Set(inlineImages.map((image) => image.recordId).filter(Boolean))) as string[];
  const mappingLookupUrls = Array.from(
    new Set(
      inlineImages
        .flatMap((image) => [image.sourceUrl, image.currentSourceUrl])
        .filter(Boolean)
    )
  ) as string[];

  if (recordIds.length > 0) {
    const { data: uploads, error: uploadError } = await supabase
      .from('image_uploads')
      .select('id, public_url')
      .in('id', recordIds);

    if (uploadError) {
      console.error('Failed to load inline image upload records:', uploadError);
    } else {
      uploads?.forEach((upload) => {
        if (upload.public_url) {
          recordSourceUrls.set(upload.id, upload.public_url);
        }
      });
    }
  }

  const cachedMedia = resolvedSiteId
    ? await loadWordPressMediaMappings(supabase, resolvedSiteId, {
        imageUploadIds: recordIds,
        sourceUrls: mappingLookupUrls,
      })
    : new Map<string, CachedWordPressMedia>();

  for (const image of inlineImages) {
    const stableSourceUrl = image.recordId
      ? recordSourceUrls.get(image.recordId) || image.sourceUrl || image.currentSourceUrl
      : image.sourceUrl || image.currentSourceUrl;
    const cachedMapping =
      cachedMedia.get(getWordPressMediaCacheKey(image.recordId, null)) ||
      cachedMedia.get(getWordPressMediaCacheKey(null, stableSourceUrl));

    let mediaId = image.currentMediaId || cachedMapping?.id || null;
    let mediaUrl = image.currentWpUrl || cachedMapping?.url || null;
    let imageUploadId = image.recordId || cachedMapping?.imageUploadId || null;

    if (mediaId) {
      const updatedMedia = await updateWordPressMediaMeta(
        wpApiUrl,
        authHeader,
        mediaId,
        image.caption || `${postTitle} image ${image.index + 1}`,
        image.caption,
      );
      mediaUrl = updatedMedia?.url || mediaUrl || cachedMapping?.url || null;
    } else {
      const uploadSourceUrl = stableSourceUrl || image.currentSourceUrl;
      if (!uploadSourceUrl) continue;

      if (!imageUploadId) {
        imageUploadId = await findImageUploadIdByUrl(supabase, uploadSourceUrl);
      }

      const uploadedMedia = await uploadImageToWordPress(
        uploadSourceUrl,
        wpApiUrl,
        authHeader,
        `post-image-${Date.now()}-${image.index + 1}.jpg`,
        image.caption || `${postTitle} image ${image.index + 1}`,
        image.caption,
      );

      if (!uploadedMedia) continue;
      mediaId = uploadedMedia.id;
      mediaUrl = uploadedMedia.url;
    }

    if (!mediaId || !mediaUrl) continue;

    const mappingSourceUrl = stableSourceUrl || image.currentSourceUrl;
    const normalizedCaption = image.caption || null;
    const normalizedAlt = image.caption || image.currentAlt || '';

    if (mappingSourceUrl) {
      const cacheEntry: CachedWordPressMedia = {
        id: mediaId,
        url: mediaUrl,
        imageUploadId,
        supabaseUrl: mappingSourceUrl,
      };
      cachedMedia.set(getWordPressMediaCacheKey(null, mappingSourceUrl), cacheEntry);
      if (imageUploadId) {
        cachedMedia.set(getWordPressMediaCacheKey(imageUploadId, null), cacheEntry);
      }
      syncedMedia.push({ id: mediaId, url: mediaUrl, supabaseUrl: mappingSourceUrl, imageUploadId });
    }

    const editorFigureHtml = buildCanonicalInlineFigureHtml({
      src: mediaUrl,
      alt: normalizedAlt,
      caption: normalizedCaption,
      recordId: imageUploadId,
      sourceUrl: mappingSourceUrl,
      wpMediaId: mediaId,
      wpUrl: mediaUrl,
    });

    const wordpressFigureHtml = buildCanonicalInlineFigureHtml({
      src: mediaUrl,
      alt: normalizedAlt,
      caption: normalizedCaption,
      recordId: imageUploadId,
      sourceUrl: mappingSourceUrl,
      wpMediaId: mediaId,
      wpUrl: mediaUrl,
      figureClass: 'wp-caption alignnone',
      imageClass: `size-full wp-image-${mediaId}`,
    });

    const validationDoc = parseHtml(editorFigureHtml);
    const validationFigure = validationDoc.querySelector('figure') as any;
    const validationImage = validationFigure?.querySelector('img') as any;

    if (
      !validationFigure ||
      !validationImage ||
      !validateSyncedFigure({
        figure: validationFigure,
        image: validationImage,
        wpMediaId: mediaId,
        wpUrl: mediaUrl,
        recordId: imageUploadId,
        sourceUrl: mappingSourceUrl,
      })
    ) {
      failedNodeValidations.push(image.index);
      continue;
    }

    editorReplacements.set(image.index, editorFigureHtml);
    wordpressReplacements.set(image.index, wordpressFigureHtml);
  }

  const editorContent = applyFigureReplacements(content, figureMatches, editorReplacements);
  const wordpressContent = applyFigureReplacements(content, figureMatches, wordpressReplacements);
  const replacementEntries = Array.from(editorReplacements.entries()).map(([index, html]) => ({
    index,
    editorHtml: html,
    wordpressHtml: wordpressReplacements.get(index) || '',
  }));
  const serializedContainsWpUrl =
    replacementEntries.length === 0 ||
    replacementEntries.every(({ editorHtml }) => editorContent.includes(editorHtml) && editorHtml.includes('data-wp-url='));
  const serializedContainsWpMediaId =
    replacementEntries.length === 0 ||
    replacementEntries.every(({ editorHtml }) => editorContent.includes(editorHtml) && editorHtml.includes('data-wp-media-id='));


  if (failedNodeValidations.length > 0) {
    throw new Error(`Inline image sync failed node validation for ${failedNodeValidations.length} figure(s)`);
  }

  if (syncedMedia.length > 0 && (!serializedContainsWpUrl || !serializedContainsWpMediaId)) {
    throw new Error('Inline image sync failed validation: WordPress URLs were not persisted into saved editor HTML');
  }

  return {
    editorContent,
    wordpressContent,
    media: syncedMedia,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestPayload: (PublishRequest & { organization_id?: string }) | null = null;
  const requestOrigin = req.headers.get('origin');
  let supportRequestInfo: {
    created: boolean;
    id: string | null;
    pageUrl: string | null;
    creationError: string | null;
  } = {
    created: false,
    id: null,
    pageUrl: null,
    creationError: null,
  };
  let resolvedWordPressStatus = 'draft';
  let currentStage = 'init';
  const stageTimeline: Array<{ stage: string; at: string }> = [];
  const setStage = (s: string) => {
    currentStage = s;
    stageTimeline.push({ stage: s, at: new Date().toISOString() });
    console.log(`[publish-to-wordpress] stage → ${s}`);
  };
  setStage('init');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    requestPayload = await req.json() as PublishRequest & { organization_id?: string };
    const { mode, site_id, post_id, credentials, organization_id } = requestPayload;

    let resolvedSiteId = site_id ?? null;

    if (!resolvedSiteId && post_id && mode !== 'test') {
      const { data: postForSite } = await supabase
        .from('posts')
        .select('wordpress_site_id, assignment_ids')
        .eq('id', post_id)
        .maybeSingle();

      resolvedSiteId = postForSite?.wordpress_site_id ?? null;

      if (!resolvedSiteId && postForSite?.assignment_ids?.length > 0) {
        const { data: assignmentForSite } = await supabase
          .from('post_assignments')
          .select('site_id')
          .eq('id', postForSite.assignment_ids[0])
          .maybeSingle();

        resolvedSiteId = assignmentForSite?.site_id ?? null;
      }
    }

    console.log(`WordPress publish request — Mode: ${mode}, Site ID: ${resolvedSiteId}, Post ID: ${post_id}`);

    // ─── Get credentials ───────────────────────────────────────────────────────
    let wpCredentials: WordPressCredentials;

    if (credentials) {
      wpCredentials = credentials;
    } else if (resolvedSiteId) {
      const { data: site, error: siteError } = await supabase
        .from('sites')
        .select('url, wordpress_username, wordpress_app_password')
        .eq('id', resolvedSiteId)
        .single();

      if (siteError || !site) throw new Error('Site not found or credentials missing');

      wpCredentials = {
        url: site.url,
        username: site.wordpress_username!,
        app_password: site.wordpress_app_password!,
      };
    } else {
      throw new Error('Either credentials or site_id must be provided');
    }

    if (!wpCredentials.username || !wpCredentials.app_password) {
      throw new Error('WordPress credentials are incomplete');
    }

    const authHeader = `Basic ${btoa(`${wpCredentials.username}:${wpCredentials.app_password}`)}`;
    const wpApiUrl = wpCredentials.url.replace(/\/$/, '');

    // ─── Declare content variables ─────────────────────────────────────────────
    let postTitle: string;
    let postContent: string;
    let editorContentForStorage: string;
    let imageUrls: string[] = [];
    let logoUrl: string | null = null;
    let logoLinkUrl: string | null = null;
    let logoAuthorName: string | null = null;
    let authorName: string | null = null;
    let authorBio: string | null = null;
    let authorPhotoUrl: string | null = null;
    let existingWordPressPostId: number | null = null;
    let pollEmbedCode: string | null = null;
    let youtubeUrl: string | null = null;
    let ctaButtonText: string | null = null;
    let ctaButtonUrl: string | null = null;
    let animatedFeaturedImageUrl: string | null = null;
    let commentsEnabled = false;
    let postSlug: string | null = null;

    interface ImageWithMetadata {
      url: string;
      caption?: string;
      isFeatured: boolean;
      imageUploadId: string | null;
    }
    let imageMetadata: ImageWithMetadata[] = [];

    if (mode === 'test') {
      postTitle = 'Test Connection - Sample Post';
      postContent = `
        <h2>Connection Test Successful</h2>
        <p>This is a test post created to verify the WordPress REST API connection.</p>
        <p>If you can see this post in your WordPress admin, the connection is working correctly.</p>
        <p><strong>You can safely delete this post.</strong></p>
      `;
      editorContentForStorage = postContent;
      imageUrls = ['https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800'];
    } else if ((mode === 'publish' || mode === 'update') && post_id) {
      setStage(`load_post:${mode}`);
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('*')
        .eq('id', post_id)
        .single();

      if (postError || !post) throw new Error('Post not found');

      postTitle = post.headline;
      postContent = post.content;
      editorContentForStorage = post.content;
      logoUrl = post.logo_url;
      logoLinkUrl = post.logo_link_url;
      logoAuthorName = post.logo_author_name;
      authorName = post.author_name;
      authorBio = post.author_bio;
      authorPhotoUrl = post.author_photo_url;
      existingWordPressPostId = post.wordpress_post_id;
      youtubeUrl = post.youtube_url;
      ctaButtonText = post.cta_button_text;
      ctaButtonUrl = post.cta_button_url;

      const pollData = post.poll_data as any;
      if (pollData?.js_embed_code) {
        pollEmbedCode = pollData.js_embed_code;
        console.log('Found poll embed code');
      }

      const animatedData = post.animated_featured_image as any;
      if (animatedData?.url) {
        animatedFeaturedImageUrl = animatedData.url;
        console.log('Found animated featured image:', animatedFeaturedImageUrl);
      }

      commentsEnabled = post.comments_enabled ?? false;
      console.log('Comments enabled:', commentsEnabled);

      // Look up organization client code
      let organizationClientCode: string | null = null;
      if (post.assignment_ids?.length > 0) {
        const { data: assignment } = await supabase
          .from('post_assignments')
          .select('organization_id')
          .eq('id', post.assignment_ids[0])
          .single();

        if (assignment?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('client_code')
            .eq('id', assignment.organization_id)
            .single();

          if (org?.client_code) {
            organizationClientCode = org.client_code;
            console.log('Found organization client code:', organizationClientCode);
          }
        }
      }

      // Fallback: use organization_id passed from the frontend (e.g. Direct Publish)
      if (!organizationClientCode && organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('client_code')
          .eq('id', organization_id)
          .single();
        if (org?.client_code) {
          organizationClientCode = org.client_code;
          console.log('Found client code via organization_id fallback:', organizationClientCode);
        }
      }

      postSlug = generateSlug(postTitle, organizationClientCode);
      console.log('Generated post slug:', postSlug);

      if (mode === 'update' && !existingWordPressPostId) {
        throw new Error('Cannot update: post has not been published to WordPress yet');
      }

      if (post.gallery_images && Array.isArray(post.gallery_images)) {
        post.gallery_images.forEach((img: any) => {
          const imageUrl = img?.processedUrl || img?.originalUrl || img?.url || (typeof img === 'string' ? img : null);
          if (!imageUrl) return;

          imageMetadata.push({
            url: imageUrl,
            caption: img?.caption,
            imageUploadId: img?.recordId || null,
            isFeatured:
              Boolean(img?.isFeatured) ||
              (post.featured_image_id ? img?.recordId === post.featured_image_id : false) ||
              imageUrl === post.featured_image_url,
          });
        });
      }

      if (
        post.featured_image_url &&
        !imageMetadata.some((img) => img.url === post.featured_image_url || (post.featured_image_id && img.imageUploadId === post.featured_image_id))
      ) {
        imageMetadata.unshift({
          url: post.featured_image_url,
          isFeatured: true,
          imageUploadId: post.featured_image_id || null,
        });
      }

      imageUrls = imageMetadata.map(img => img.url);
    } else {
      throw new Error('Invalid mode or missing post_id for publish mode');
    }

    console.log(`Processing ${imageUrls.length} post images`);

    // ─── Check which post images already exist in WordPress ───────────────────
    const existingMedia = resolvedSiteId
      ? await loadWordPressMediaMappings(supabase, resolvedSiteId, {
          imageUploadIds: imageMetadata.map((img) => img.imageUploadId).filter(Boolean) as string[],
          sourceUrls: imageUrls,
        })
      : new Map<string, CachedWordPressMedia>();

    console.log(`Found ${existingMedia.size} existing image mappings`);

    // ─── Upload post images ───────────────────────────────────────────────────
    setStage(`upload_post_images:${imageMetadata.length}`);
    const uploadedMedia: SyncedWordPressMedia[] = [];

    for (let i = 0; i < imageMetadata.length; i++) {
      const imageData = imageMetadata[i];
      const imageUrl = imageData.url;
      const cacheKey = getWordPressMediaCacheKey(imageData.imageUploadId, imageUrl);
      const cachedMapping = existingMedia.get(cacheKey) || existingMedia.get(getWordPressMediaCacheKey(null, imageUrl));

      if (cachedMapping) {
        console.log(`Reusing existing image ${i + 1}: WP ID ${cachedMapping.id}`);
        uploadedMedia.push({
          id: cachedMapping.id,
          url: cachedMapping.url,
          supabaseUrl: cachedMapping.supabaseUrl || imageUrl,
          imageUploadId: imageData.imageUploadId || cachedMapping.imageUploadId,
        });
        continue;
      }

      console.log(`Uploading post image ${i + 1}/${imageUrls.length}: ${imageUrl}`);

      const filename = `post-image-${Date.now()}-${i + 1}.jpg`;
      const imageTitle = imageData.caption || `Image from ${postTitle}`;
      const imageCaption = imageData.caption || '';

      const result = await uploadImageToWordPress(
        imageUrl,
        wpApiUrl,
        authHeader,
        filename,
        imageTitle,
        imageCaption
      );

      if (!result) {
        console.error(`Skipping image ${i + 1} — upload returned null`);
        continue;
      }

      const imageUploadId = imageData.imageUploadId || await findImageUploadIdByUrl(supabase, imageUrl);
      const savedMedia = {
        id: result.id,
        url: result.url,
        supabaseUrl: imageUrl,
        imageUploadId,
      };

      uploadedMedia.push(savedMedia);
      existingMedia.set(getWordPressMediaCacheKey(imageUploadId, imageUrl), {
        id: result.id,
        url: result.url,
        supabaseUrl: imageUrl,
        imageUploadId,
      });
      existingMedia.set(getWordPressMediaCacheKey(null, imageUrl), {
        id: result.id,
        url: result.url,
        supabaseUrl: imageUrl,
        imageUploadId,
      });

      await saveWordPressMediaMapping(supabase, {
        siteId: resolvedSiteId,
        imageUploadId,
        supabaseImageUrl: imageUrl,
        wordpressMediaId: result.id,
        wordpressMediaUrl: result.url,
      });
    }

    // ─── Phase A: Author handling ─────────────────────────────────────────────
    let authorId: number | null = null;

    // Resolve client_id for author mapping lookup
    let clientIdForMapping: string | null = null;
    if (mode !== 'test' && post_id) {
      const { data: postForClient } = await supabase
        .from('posts')
        .select('client_id')
        .eq('id', post_id)
        .maybeSingle();
      clientIdForMapping = postForClient?.client_id ?? null;
    }

    if (mode !== 'test' && authorName) {
      setStage('author_handling');
      console.log(`Processing author: ${authorName}`);

      // Upload author avatar if present — check media mapping cache first
      let avatarId: number | null = null;
      if (authorPhotoUrl) {
        let avatarResult: { id: number; url: string } | null = null;
        const authorPhotoUploadId = await findImageUploadIdByUrl(supabase, authorPhotoUrl);

        if (resolvedSiteId) {
          const avatarMappings = await loadWordPressMediaMappings(supabase, resolvedSiteId, {
            imageUploadIds: authorPhotoUploadId ? [authorPhotoUploadId] : [],
            sourceUrls: [authorPhotoUrl],
          });
          const existingAvatarMapping =
            avatarMappings.get(getWordPressMediaCacheKey(authorPhotoUploadId, authorPhotoUrl)) ||
            avatarMappings.get(getWordPressMediaCacheKey(null, authorPhotoUrl));

          if (existingAvatarMapping) {
            avatarId = existingAvatarMapping.id;
            console.log(`Reusing cached author avatar WP ID: ${avatarId}`);
          }
        }

        if (!avatarId) {
          avatarResult = await uploadImageToWordPress(
            authorPhotoUrl,
            wpApiUrl,
            authHeader,
            `author-avatar-${Date.now()}.jpg`,
            `${authorName} - Author Avatar`
          );
          if (avatarResult) {
            avatarId = avatarResult.id;
            console.log(`Author avatar uploaded, WP media ID: ${avatarId}`);
            await saveWordPressMediaMapping(supabase, {
              siteId: resolvedSiteId,
              imageUploadId: authorPhotoUploadId,
              supabaseImageUrl: authorPhotoUrl,
              wordpressMediaId: avatarResult.id,
              wordpressMediaUrl: avatarResult.url,
            });
          } else {
            console.warn(`uploadImageToWordPress returned null for author avatar: ${authorPhotoUrl}`);
          }
        }
      }

      // Build author payload
      const authorPayload: any = {
        name: authorName,
        display_name: authorName,
        bio: authorBio || '',
      };
      // Always set avatar_id — use uploaded one or 0 to clear stale avatars
      authorPayload.avatar_id = avatarId || 0;

      try {
        // Check for existing author mapping
        let existingMapping: { wordpress_author_id: number } | null = null;
        if (clientIdForMapping && resolvedSiteId) {
          const { data: mapping } = await supabase
            .from('wordpress_author_mappings')
            .select('wordpress_author_id')
            .eq('user_id', clientIdForMapping)
            .eq('site_id', resolvedSiteId)
            .maybeSingle();
          existingMapping = mapping;
        }

        if (existingMapping) {
          // Mapping exists — always UPDATE the WP author with current info
          authorId = existingMapping.wordpress_author_id;
          console.log(`Found author mapping, updating WP author ID ${authorId}`);

          const authorUpdateResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/ppma_author/${authorId}`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(authorPayload),
          });
          const authorUpdateJson = await authorUpdateResp.json();
          if (!authorUpdateResp.ok) {
            if (authorUpdateResp.status === 404 || authorUpdateResp.status === 410) {
              // Author was deleted on WordPress — remove stale mapping and re-create
              console.warn(`Mapped author ${authorId} no longer exists on WP (${authorUpdateResp.status}), clearing mapping`);
              await supabase
                .from('wordpress_author_mappings')
                .delete()
                .eq('user_id', clientIdForMapping)
                .eq('site_id', resolvedSiteId);
              existingMapping = null;
              authorId = null;
            } else {
              console.error(`Author update failed (${authorUpdateResp.status}):`, authorUpdateJson);
            }
          } else {
            console.log(`Updated mapped author ${authorId}`);
          }
        }

        if (!existingMapping) {
          // No mapping — create author via WP API
          const authorResult = await wpApiPost(
            `${wpApiUrl}/wp-json/wp/v2/ppma_author`,
            authHeader,
            authorPayload
          );

          if (authorResult.termExists) {
            authorId = authorResult.existingTermId;
            console.log(`Author term already exists, using ID ${authorId}`);

            // Update existing author with current info
            const authorUpdateResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/ppma_author/${authorId}`, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
              body: JSON.stringify(authorPayload),
            });
            const authorUpdateJson = await authorUpdateResp.json();
            if (!authorUpdateResp.ok) {
              console.error(`Author update failed (${authorUpdateResp.status}):`, authorUpdateJson);
            } else {
              console.log(`Updated existing author ${authorId}`);
            }
          } else {
            authorId = authorResult.data?.id ?? null;
            console.log(`Created new author, WP ID: ${authorId}`);
          }

          // Store author mapping for future use
          if (authorId && clientIdForMapping && resolvedSiteId) {
            const { error: mappingError } = await supabase
              .from('wordpress_author_mappings')
              .insert({
                user_id: clientIdForMapping,
                site_id: resolvedSiteId,
                wordpress_author_id: authorId,
              });
            if (mappingError) {
              console.error('Failed to store author mapping:', mappingError);
            } else {
              console.log(`Stored author mapping: user ${clientIdForMapping} → WP author ${authorId}`);
            }
          }
        }
      } catch (err) {
        console.error('Author creation failed (non-fatal):', err);
      }
    } else if (mode !== 'test') {
      // No custom author — check for site default
      if (resolvedSiteId) {
        const { data: siteData } = await supabase
          .from('sites')
          .select('default_wordpress_author_id')
          .eq('id', resolvedSiteId)
          .maybeSingle();
        if (siteData?.default_wordpress_author_id) {
          authorId = siteData.default_wordpress_author_id;
          console.log(`Using site default author ID: ${authorId}`);
        }
      }
    }

    // ─── Phase B: Sponsor handling ────────────────────────────────────────────
    let sponsorId: number | null = null;
    let sponsorWarning: string | null = null;

    if (mode !== 'test') {
      setStage('sponsor_handling');
      // Check if post has a sponsor_id (new sponsor entity system)
      const postSponsorId = (await supabase.from('posts').select('sponsor_id').eq('id', post_id).single()).data?.sponsor_id;

      if (postSponsorId) {
        // New system: use sponsor entity and mappings
        const { data: sponsorRecord } = await supabase
          .from('sponsors')
          .select('*')
          .eq('id', postSponsorId)
          .single();

        if (sponsorRecord && resolvedSiteId) {
          if (!sponsorRecord.name || !sponsorRecord.name.trim()) {
            sponsorWarning = `Sponsor logo provided without a name; sponsor not attached to WordPress post.`;
            console.warn(`Skipping sponsor sync for post ${post_id} (site ${resolvedSiteId}): sponsor ${postSponsorId} has no name.`);
          } else {
          const sponsorName = sponsorRecord.name;
          const sponsorLogoUrl = sponsorRecord.logo_url;
          const sponsorLinkUrl = sponsorRecord.link_url;
          console.log(`Processing sponsor entity: ${sponsorName} (${postSponsorId})`);

          // Upload sponsor logo — check media mapping cache first
          let logoMediaId: number | null = null;
          const sponsorLogoUploadId = await findImageUploadIdByUrl(supabase, sponsorLogoUrl);
          const sponsorLogoMappings = await loadWordPressMediaMappings(supabase, resolvedSiteId, {
            imageUploadIds: sponsorLogoUploadId ? [sponsorLogoUploadId] : [],
            sourceUrls: [sponsorLogoUrl],
          });
          const existingLogoMapping =
            sponsorLogoMappings.get(getWordPressMediaCacheKey(sponsorLogoUploadId, sponsorLogoUrl)) ||
            sponsorLogoMappings.get(getWordPressMediaCacheKey(null, sponsorLogoUrl));

          if (existingLogoMapping) {
            logoMediaId = existingLogoMapping.id;
            console.log(`Reusing cached sponsor logo WP ID: ${logoMediaId}`);
          } else {
            const logoResult = await uploadImageToWordPress(
              sponsorLogoUrl, wpApiUrl, authHeader,
              `sponsor-logo-${Date.now()}.jpg`, `${sponsorName} - Sponsor Logo`
            );
            if (logoResult) {
              logoMediaId = logoResult.id;
              await saveWordPressMediaMapping(supabase, {
                siteId: resolvedSiteId,
                imageUploadId: sponsorLogoUploadId,
                supabaseImageUrl: sponsorLogoUrl,
                wordpressMediaId: logoResult.id,
                wordpressMediaUrl: logoResult.url,
              });
            }
          }

          // Check for existing sponsor mapping
          const { data: existingSponsorMapping } = await supabase
            .from('wordpress_sponsor_mappings')
            .select('id, wordpress_sponsor_id')
            .eq('sponsor_id', postSponsorId)
            .eq('site_id', resolvedSiteId)
            .maybeSingle();

          const sponsorPayload: any = {
            name: sponsorName,
            acf: { sponsor_url: sponsorLinkUrl || '', sponsor_logo: logoMediaId },
          };

          if (existingSponsorMapping) {
            // Mapping exists — UPDATE
            sponsorId = existingSponsorMapping.wordpress_sponsor_id;
            console.log(`Found sponsor mapping, updating WP sponsor ID ${sponsorId}`);

            const updateResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/sponsors/${sponsorId}`, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
              body: JSON.stringify(sponsorPayload),
            });

            if (updateResp.status === 404 || updateResp.status === 410) {
              console.warn(`Mapped sponsor ${sponsorId} not found (${updateResp.status}), clearing mapping`);
              await supabase.from('wordpress_sponsor_mappings').delete().eq('id', existingSponsorMapping.id);
              sponsorId = null; // fall through to creation
            } else {
              const json = await updateResp.json();
              if (!updateResp.ok) {
                console.error(`Sponsor update failed (${updateResp.status}):`, json);
              } else {
                console.log(`Updated mapped sponsor ${sponsorId}`);
              }
            }
          }

          if (!sponsorId) {
            // No mapping or stale — CREATE
            try {
              const sponsorResult = await wpApiPost(`${wpApiUrl}/wp-json/wp/v2/sponsors`, authHeader, sponsorPayload);
              if (sponsorResult.termExists) {
                sponsorId = sponsorResult.existingTermId;
                console.log(`Sponsor term exists, using ID ${sponsorId}`);
                // Update it
                const updateResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/sponsors/${sponsorId}`, {
                  method: 'POST',
                  headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                  body: JSON.stringify(sponsorPayload),
                });
                await updateResp.json();
              } else {
                sponsorId = sponsorResult.data?.id ?? null;
                console.log(`Created sponsor, WP ID: ${sponsorId}`);
              }

              // Store mapping
              if (sponsorId) {
                await supabase.from('wordpress_sponsor_mappings').upsert({
                  sponsor_id: postSponsorId,
                  site_id: resolvedSiteId,
                  wordpress_sponsor_id: sponsorId,
                }, { onConflict: 'sponsor_id,site_id' });
                console.log(`Stored sponsor mapping: ${postSponsorId} → WP ${sponsorId}`);
              }
            } catch (err) {
              console.error('Sponsor creation failed (non-fatal):', err);
            }
          }
          }
        }
      } else if (logoUrl) {
        // Legacy fallback: inline sponsor creation for old posts without sponsor_id
        if (!logoAuthorName || !logoAuthorName.trim()) {
          sponsorWarning = `Sponsor logo provided without a name; sponsor not attached to WordPress post.`;
          console.warn(`Skipping legacy inline sponsor for post ${post_id} (site ${resolvedSiteId}): logo provided without byline.`);
        } else {
        const sponsorName = logoAuthorName;
        console.log(`Processing inline sponsor (legacy): ${sponsorName}`);

        let logoMediaId: number | null = null;
        const legacyLogoUploadId = await findImageUploadIdByUrl(supabase, logoUrl);

        if (resolvedSiteId) {
          const legacyLogoMappings = await loadWordPressMediaMappings(supabase, resolvedSiteId, {
            imageUploadIds: legacyLogoUploadId ? [legacyLogoUploadId] : [],
            sourceUrls: [logoUrl],
          });
          const existingLogoMapping =
            legacyLogoMappings.get(getWordPressMediaCacheKey(legacyLogoUploadId, logoUrl)) ||
            legacyLogoMappings.get(getWordPressMediaCacheKey(null, logoUrl));

          if (existingLogoMapping) {
            logoMediaId = existingLogoMapping.id;
          }
        }

        if (!logoMediaId) {
          const logoResult = await uploadImageToWordPress(
            logoUrl, wpApiUrl, authHeader,
            `sponsor-logo-${Date.now()}.jpg`, `${sponsorName} - Sponsor Logo`
          );
          if (logoResult) {
            logoMediaId = logoResult.id;
            await saveWordPressMediaMapping(supabase, {
              siteId: resolvedSiteId,
              imageUploadId: legacyLogoUploadId,
              supabaseImageUrl: logoUrl,
              wordpressMediaId: logoResult.id,
              wordpressMediaUrl: logoResult.url,
            });
          }
        }

        const sponsorPayload: any = {
          name: sponsorName,
          acf: { sponsor_url: logoLinkUrl || '', sponsor_logo: logoMediaId },
        };

        try {
          const sponsorResult = await wpApiPost(`${wpApiUrl}/wp-json/wp/v2/sponsors`, authHeader, sponsorPayload);
          if (sponsorResult.termExists) {
            sponsorId = sponsorResult.existingTermId;
            const updateResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/sponsors/${sponsorId}`, {
              method: 'POST',
              headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
              body: JSON.stringify(sponsorPayload),
            });
            await updateResp.json();
          } else {
            sponsorId = sponsorResult.data?.id ?? null;
          }
        } catch (err) {
          console.error('Sponsor creation failed (non-fatal):', err);
        }
        }
      }
    }

    // ─── Sync inline images for WordPress ─────────────────────────────────────
    setStage('inline_image_sync');
    let syncedInlineMedia: Array<{ id: number; url: string; supabaseUrl: string; imageUploadId: string | null }> = [];
    let inlineSyncWarning: string | null = null;

    if (mode !== 'test' && postContent) {
      try {
        const inlineSync = await syncInlineImagesForWordPress(
          postContent,
          wpApiUrl,
          authHeader,
          postTitle,
          supabase,
          resolvedSiteId,
        );
        editorContentForStorage = inlineSync.editorContent;
        postContent = inlineSync.wordpressContent;
        syncedInlineMedia = inlineSync.media;

        if (resolvedSiteId && syncedInlineMedia.length > 0) {
          for (const media of syncedInlineMedia) {
            await saveWordPressMediaMapping(supabase, {
              siteId: resolvedSiteId,
              imageUploadId: media.imageUploadId,
              supabaseImageUrl: media.supabaseUrl,
              wordpressMediaId: media.id,
              wordpressMediaUrl: media.url,
            });
          }
        }
      } catch (inlineSyncError) {
        inlineSyncWarning = inlineSyncError instanceof Error
          ? inlineSyncError.message
          : 'Inline image sync failed with unknown error';
        console.error(`Inline image sync failed; continuing publish without inline sync: ${inlineSyncWarning}`);
      }
    }

    const allUploadedMedia = [...uploadedMedia];
    syncedInlineMedia.forEach((media) => {
      const exists = allUploadedMedia.some(
        (candidate) => candidate.id === media.id || candidate.supabaseUrl === media.supabaseUrl,
      );

      if (!exists) {
        allUploadedMedia.push(media);
      }
    });

    // ─── Build final content ──────────────────────────────────────────────────
    let finalContent = postContent;
    let featuredMediaId: number | null = null;

    // Note: logo is now handled via sponsor taxonomy — no inline HTML prepend

    // Find the image marked as featured, or default to first
    const featuredIndex = imageMetadata.findIndex((img) => img.isFeatured);
    const actualFeaturedIndex = featuredIndex >= 0 ? featuredIndex : 0;

    if (uploadedMedia.length === 1) {
      featuredMediaId = uploadedMedia[0].id;
      console.log('Single image mode — set as featured image only');
    } else if (uploadedMedia.length > 1) {
      featuredMediaId = uploadedMedia[actualFeaturedIndex]?.id || uploadedMedia[0].id;
      const galleryIds = uploadedMedia.map((m) => m.id).join(',');
      const galleryShortcode = `[gallery ids="${galleryIds}"]`;

      if (animatedFeaturedImageUrl) {
        const paragraphs = postContent.split('</p>');
        if (paragraphs.length >= 3) {
          paragraphs.splice(3, 0, `\n\n${galleryShortcode}\n`);
          postContent = paragraphs.join('</p>');
          console.log('Inserted gallery after 3rd paragraph (animated image mode)');
        } else {
          postContent = `${postContent}\n\n${galleryShortcode}`;
          console.log('Appended gallery at end (< 3 paragraphs)');
        }
        finalContent = postContent;
      } else {
        finalContent = `${galleryShortcode}\n\n${postContent}`;
      }
      console.log(`Multiple images — gallery with ${uploadedMedia.length} images, featured index: ${actualFeaturedIndex}`);
    }

    // Append YouTube URL for oEmbed
    if (mode !== 'test' && youtubeUrl) {
      finalContent += `\n\n${youtubeUrl}`;
      console.log('Added YouTube URL for oEmbed:', youtubeUrl);
    }

    // Append poll embed code
    if (pollEmbedCode) {
      finalContent += `\n\n${pollEmbedCode}`;
      console.log('Added poll embed code');
    }

    // Add rel="sponsored" to all links
    if (mode !== 'test') {
      finalContent = addSponsoredRelToLinks(finalContent);
      console.log('Added rel="sponsored" to all links in content');
    }

    // ─── Look up Sponsored category ───────────────────────────────────────────
    let sponsoredCategoryId: number | null = null;
    try {
      const catResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/categories?slug=sponsored`, {
        headers: { 'Authorization': authHeader },
      });

      if (catResp.ok) {
        const categories = await catResp.json();
        if (categories.length > 0) {
          sponsoredCategoryId = categories[0].id;
          console.log('Found Sponsored category ID:', sponsoredCategoryId);
        }
      }
    } catch (e) {
      console.error('Failed to look up Sponsored category:', e);
    }

    if (mode === 'update') {
      if (!existingWordPressPostId) {
        throw new Error('Cannot update: post has not been published to WordPress yet');
      }

      console.log(`Fetching current WordPress status for post ${existingWordPressPostId}...`);
      const currentPostResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/posts/${existingWordPressPostId}?context=edit`, {
        headers: { 'Authorization': authHeader },
      });
      const currentPostJson = await readResponsePayload(currentPostResp);

      if (!currentPostResp.ok || !currentPostJson?.id) {
        const currentPostError = currentPostResp.status === 404
          ? `WordPress post ${existingWordPressPostId} was not found during update`
          : `Failed to load current WordPress post status: ${currentPostJson?.message || currentPostResp.status}`;
        throw new Error(currentPostError);
      }

      resolvedWordPressStatus = typeof currentPostJson.status === 'string'
        ? currentPostJson.status
        : 'draft';
      console.log(`Preserving existing WordPress status: ${resolvedWordPressStatus}`);
    } else {
      resolvedWordPressStatus = 'draft';
      console.log('Draft-first mode active; new/test posts will be saved as draft');
    }

    // ─── Build post body ──────────────────────────────────────────────────────
    const postBody: any = {
      title: postTitle,
      content: finalContent,
      status: resolvedWordPressStatus,
      comment_status: commentsEnabled ? 'open' : 'closed',
      featured_media: featuredMediaId,
      meta: {
        // All posts published by this app are sponsored — always disable
        // Raptive/AdThrive programmatic ads. Field is registered for REST
        // by the Raptive plugin on each WP site.
        adthrive_ads_disable: 'on',
      },
      acf: { river_show_full_post_content: true },
    };

    if (postSlug) {
      postBody.slug = postSlug;
      console.log('Set post slug:', postSlug);
    }

    if (sponsoredCategoryId) {
      postBody.categories = [sponsoredCategoryId];
    }

    // ─── Phase C: Attach author, sponsor, CTA via ACF ─────────────────────────

    if (authorId) {
      postBody.authors = [authorId];
      console.log('Attached author ID:', authorId);
    }

    if (sponsorId) {
      postBody.sponsor = [sponsorId];
      postBody.acf._post_sponsor_toggle = 'yes';
      console.log('Attached sponsor ID:', sponsorId);
    }

    if (mode !== 'test' && (ctaButtonText || ctaButtonUrl)) {
      postBody.acf.cta = {
        cta_text: ctaButtonText || '',
        cta_url: ctaButtonUrl || '',
      };
      console.log('Added CTA via ACF:', ctaButtonText, ctaButtonUrl);
    }

    if (Object.keys(postBody.acf).length === 0) delete postBody.acf;
    if (Object.keys(postBody.meta).length === 0) delete postBody.meta;

    let postResp;
    if (mode === 'update' && existingWordPressPostId) {
      setStage(`wp_post_update:${existingWordPressPostId}`);
      console.log(`Updating WordPress post ${existingWordPressPostId}...`);
      postResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/posts/${existingWordPressPostId}`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });
    } else {
      setStage('wp_post_create');
      console.log('Creating WordPress post...');
      postResp = await fetch(`${wpApiUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });
    }

    const postJson = await readResponsePayload(postResp);

    if (!postResp.ok) {
      console.error('WordPress post sync failed:', postJson);
      throw new Error(`WordPress API error: ${postJson?.message || 'Unknown error'}`);
    }

    console.log(`WordPress post ${mode === 'update' ? 'updated' : 'created'} successfully — ID: ${postJson.id}`);

    // Verify Raptive/AdThrive ads were actually disabled on the WP side. If the
    // Raptive plugin isn't active or the meta field isn't REST-registered on
    // this site, the value will silently not stick — log a warning so we can spot it.
    const returnedAdsFlag = postJson?.meta?.adthrive_ads_disable;
    if (returnedAdsFlag !== 'on') {
      console.warn(
        `AdThrive ads NOT confirmed disabled on WP post ${postJson?.id} ` +
        `(site ${resolvedSiteId}). Returned: ${JSON.stringify(returnedAdsFlag)}. ` +
        `Verify Raptive plugin is active and meta is REST-registered.`
      );
    } else {
      console.log(`AdThrive ads confirmed disabled on WP post ${postJson?.id}`);
    }

    if ((mode === 'publish' || mode === 'update') && post_id) {
      const mediaData = allUploadedMedia.map(m => ({
        supabase_url: m.supabaseUrl,
        wordpress_id: m.id,
      }));

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          content: editorContentForStorage,
          wordpress_post_id: postJson.id,
          wordpress_post_url: postJson.link,
          wordpress_media_ids: mediaData,
          wordpress_site_id: resolvedSiteId,
        })
        .eq('id', post_id);

      if (updateError) {
        console.error('Failed to update post with WordPress info:', updateError);
      } else {
        console.log(`Updated post with ${mediaData.length} media mappings`);
      }
    }

    const logType = mode === 'test' ? 'wordpress_test' : mode === 'update' ? 'wordpress_update' : 'wordpress_publish';
    const siteName = wpCredentials.url || 'WordPress Site';

    try {
      await supabase.from('api_logs').insert({
        log_type: logType,
        status: 'success',
        summary: `${mode === 'update' ? 'Updated' : mode === 'test' ? 'Test published' : 'Published'} "${postTitle}" to ${siteName}`,
        request_data: {
          title: postTitle,
          content_length: finalContent.length,
          image_count: allUploadedMedia.length,
          has_youtube: !!youtubeUrl,
          has_cta: !!(ctaButtonText && ctaButtonUrl),
          has_poll: !!pollEmbedCode,
          has_author: !!authorId,
          has_sponsor: !!sponsorId,
          comments_enabled: commentsEnabled,
          categories: postBody.categories || [],
          site_id: resolvedSiteId,
          inline_sync_warning: inlineSyncWarning,
          resolved_wordpress_status: resolvedWordPressStatus,
          stage_timeline: stageTimeline,
          final_stage: 'success',
        },
        response_data: {
          wordpress_post_id: postJson.id,
          wordpress_url: postJson.link,
          media_ids: allUploadedMedia.map(m => m.id),
          author_id: authorId,
          sponsor_id: sponsorId,
          wordpress_status: postJson.status || resolvedWordPressStatus,
        },
        error_message: null,
        post_id: post_id,
        site_id: resolvedSiteId,
      });
      console.log('API call logged successfully');
    } catch (logError) {
      console.error('Failed to log API call:', logError);
    }

    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/qa-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      },
      body: JSON.stringify({ action: 'run_check', entity_type: 'wordpress_post', entity_id: post_id }),
    }).catch(e => console.error('QA fire-and-forget failed:', e));

    return new Response(
      JSON.stringify({
        success: true,
        wordpress_post_id: postJson.id,
        wordpress_post_url: postJson.link,
        wordpress_post_title: postJson.title?.rendered || postTitle,
        wordpress_status: postJson.status || resolvedWordPressStatus,
        media_count: allUploadedMedia.length,
        media_ids: allUploadedMedia.map(m => m.id),
        author_id: authorId,
        sponsor_id: sponsorId,
        inline_sync_warning: inlineSyncWarning,
        sponsor_warning: sponsorWarning,
        warnings: [inlineSyncWarning, sponsorWarning].filter(Boolean) as string[],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`Error in publish-to-wordpress (stage=${currentStage}):`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorStack = error instanceof Error && error.stack ? error.stack : null;

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const reqData = requestPayload ?? {};
      const { mode, site_id, post_id } = reqData as any;
      const logType = mode === 'test' ? 'wordpress_test' : mode === 'update' ? 'wordpress_update' : 'wordpress_publish';

      let loggedSiteId = site_id || null;
      if (!loggedSiteId && post_id) {
        const { data: postForSite } = await supabase
          .from('posts')
          .select('wordpress_site_id')
          .eq('id', post_id)
          .maybeSingle();
        loggedSiteId = postForSite?.wordpress_site_id ?? null;
      }

      if (mode === 'update' && post_id && !supportRequestInfo.created) {
        supportRequestInfo = await createWordPressSyncSupportRequest({
          supabase,
          postId: post_id,
          fallbackSiteId: loggedSiteId,
          reason: errorMessage,
          origin: requestOrigin,
        });
      }

      await supabase.from('api_logs').insert({
        log_type: logType,
        status: 'error',
        summary: `Failed to ${mode || 'publish'} post to WordPress at stage "${currentStage}": ${errorMessage}`,
        request_data: {
          ...reqData,
          site_id: loggedSiteId,
          resolved_wordpress_status: resolvedWordPressStatus,
          failure_stage: currentStage,
          stage_timeline: stageTimeline,
          admin_request_created: supportRequestInfo.created,
          admin_request_id: supportRequestInfo.id,
          admin_request_page_url: supportRequestInfo.pageUrl,
          admin_request_error: supportRequestInfo.creationError,
        },
        response_data: {
          error_name: errorName,
          error_message: errorMessage,
          error_stack: errorStack,
          failure_stage: currentStage,
        },
        error_message: `[stage=${currentStage}] ${errorName}: ${errorMessage}${errorStack ? `\n\n${errorStack}` : ''}`,
        post_id: post_id || null,
        site_id: loggedSiteId,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        admin_request_created: supportRequestInfo.created,
        admin_request_id: supportRequestInfo.id,
        admin_request_page_url: supportRequestInfo.pageUrl,
        admin_request_error: supportRequestInfo.creationError,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
