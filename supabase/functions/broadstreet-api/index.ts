import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Broadstreet API base URL with version prefix (per Swagger spec version "1")
const BROADSTREET_BASE_URL = 'https://api.broadstreetads.com/api/1';
// Fallback version for compatibility
const BROADSTREET_FALLBACK_BASE_URL = 'https://api.broadstreetads.com/api/0';

// Cache TTLs in minutes
const CACHE_TTL = {
  advertisers: 15,
  campaigns: 10,
  advertisements: 5,
  placements: 5,
  stats: 10,
};

// Use any for edge function context - types not available
type SupabaseClientType = SupabaseClient<any, any, any>;

// Safe API response type
interface SafeApiResponse {
  ok: boolean;
  status: number;
  data: any;
}

async function getSupabaseClient(): Promise<SupabaseClientType> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getBroadstreetCredentials(supabase?: SupabaseClientType, siteId?: string): Promise<{ accessToken: string; networkId: string }> {
  // Try site-level credentials first if siteId provided
  if (siteId && supabase) {
    try {
      const { data: site, error } = await supabase
        .from('sites')
        .select('broadstreet_config')
        .eq('id', siteId)
        .single();
      
      if (!error && site?.broadstreet_config) {
        const config = site.broadstreet_config as Record<string, any>;
        if (config.access_token && config.network_id) {
          console.log(`Using site-level Broadstreet credentials for site ${siteId}`);
          return {
            accessToken: config.access_token.trim(),
            networkId: config.network_id.trim(),
          };
        }
      }
    } catch (e) {
      console.log('Site credential lookup failed, falling back to global:', e);
    }
  }
  
  // Fall back to environment secrets
  const accessToken = Deno.env.get('BROADSTREET_ACCESS_TOKEN');
  const networkId = Deno.env.get('BROADSTREET_NETWORK_ID');
  
  if (!accessToken || !networkId) {
    throw new Error('Broadstreet credentials not configured');
  }
  
  return { accessToken, networkId };
}

async function getCachedData(
  supabase: SupabaseClientType,
  organizationId: string,
  cacheKey: string
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('display_ad_cache')
    .select('data, expires_at')
    .eq('organization_id', organizationId)
    .eq('cache_key', cacheKey)
    .single();

  if (error || !data) return null;
  
  // Check if cache is expired
  if (new Date(data.expires_at) < new Date()) {
    // Delete expired cache
    await supabase
      .from('display_ad_cache')
      .delete()
      .eq('organization_id', organizationId)
      .eq('cache_key', cacheKey);
    return null;
  }
  
  return data.data;
}

async function setCachedData(
  supabase: SupabaseClientType,
  organizationId: string,
  cacheKey: string,
  data: unknown,
  ttlMinutes: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  
  // Upsert cache entry
  await supabase
    .from('display_ad_cache')
    .upsert({
      organization_id: organizationId,
      cache_key: cacheKey,
      data,
      expires_at: expiresAt,
    }, {
      onConflict: 'organization_id,cache_key',
    });
}

async function clearCache(
  supabase: SupabaseClientType,
  organizationId: string,
  cacheKey?: string
): Promise<void> {
  let query = supabase
    .from('display_ad_cache')
    .delete()
    .eq('organization_id', organizationId);
  
  if (cacheKey) {
    query = query.eq('cache_key', cacheKey);
  }
  
  await query;
}

// Helper to get token fingerprint for debugging (only used in error logging)
function getTokenFingerprint(token: string): string {
  if (!token || token.length < 6) return '(empty)';
  return `${token.slice(0, 3)}...${token.slice(-3)} (len: ${token.length})`;
}

// Helper to redact access_token from URL for safe logging
function getRedactedUrl(url: string): string {
  return url.replace(/access_token=[^&]+/, 'access_token=REDACTED');
}

// Credentials type for passing through call chain
type BroadstreetCredentials = { accessToken: string; networkId: string };

// Return type for broadstreetRequest that includes resolved credentials for error logging
interface BroadstreetRequestResult {
  response: Response;
  resolvedCreds: BroadstreetCredentials;
  baseUrlUsed: string;
  fullUrl: string;
}

async function broadstreetRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown,
  credentials?: BroadstreetCredentials,
  baseUrl: string = BROADSTREET_BASE_URL
): Promise<BroadstreetRequestResult> {
  const resolvedCreds = credentials || await getBroadstreetCredentials();
  const { accessToken } = resolvedCreds;
  
  // Broadstreet expects access_token as a query parameter, NOT Authorization header
  // See Swagger: "securitySchemes": { "api_key": { "type": "apiKey", "name": "access_token", "in": "query" }}
  const separator = endpoint.includes('?') ? '&' : '?';
  const fullUrl = `${baseUrl}${endpoint}${separator}access_token=${accessToken}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(fullUrl, options);
  return { response, resolvedCreds, baseUrlUsed: baseUrl, fullUrl };
}

/**
 * Sleep helper for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe wrapper for Broadstreet API requests that handles non-JSON responses.
 * Detects HTML error pages and returns meaningful error messages.
 * Logs token fingerprint and full URL (redacted) only on errors for debugging.
 * Includes automatic retry with fallback API version if first attempt returns HTML.
 * Implements exponential backoff for 429 rate limit errors.
 */
async function safeBroadstreetRequest(
  endpoint: string,
  method: string = 'GET',
  body?: unknown,
  credentials?: BroadstreetCredentials,
  maxRetries: number = 3
): Promise<SafeApiResponse> {
  let lastError: SafeApiResponse | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Try primary API version first
    let { response, resolvedCreds, baseUrlUsed, fullUrl } = await broadstreetRequest(
      endpoint, method, body, credentials, BROADSTREET_BASE_URL
    );
    
    let contentType = response.headers.get('content-type') || '';
    
    // If we got HTML back (likely login page), try fallback API version
    if (contentType.includes('text/html')) {
      console.log(`Primary API (${BROADSTREET_BASE_URL}) returned HTML, trying fallback...`);
      const fallbackResult = await broadstreetRequest(
        endpoint, method, body, credentials, BROADSTREET_FALLBACK_BASE_URL
      );
      response = fallbackResult.response;
      baseUrlUsed = fallbackResult.baseUrlUsed;
      fullUrl = fallbackResult.fullUrl;
      contentType = response.headers.get('content-type') || '';
    }
    
    // Handle 429 rate limit with exponential backoff
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      // Calculate delay: either use Retry-After header or exponential backoff (1s, 2s, 4s, 8s...)
      const baseDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000 * Math.pow(2, attempt);
      // Add jitter (0-500ms) to prevent thundering herd
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;
      
      if (attempt < maxRetries) {
        console.log(`Rate limited (429). Attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      } else {
        console.error(`Rate limited (429). Max retries (${maxRetries}) exceeded for ${endpoint}`);
        lastError = {
          ok: false,
          status: 429,
          data: { message: 'Rate limit exceeded. Please try again in a few minutes.' }
        };
        break;
      }
    }
    
    // Log the actual request for debugging (no token info on success)
    console.log('Broadstreet API request:', {
      endpoint,
      method,
      status: response.status,
      contentType,
      baseUrlUsed,
      attempt: attempt > 0 ? `retry ${attempt}` : 'initial',
    });
    
    // If not JSON, check if it's still a 2xx success or a real error
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      
      // 2xx with non-JSON -- try parsing as JSON anyway (e.g. /records returns text/html with JSON body)
      if (response.status >= 200 && response.status < 300) {
        try {
          const parsed = JSON.parse(text);
          console.log('Broadstreet API returned non-JSON content-type but valid JSON body:', {
            status: response.status,
            contentType,
            baseUrlUsed,
            attempt: attempt > 0 ? `retry ${attempt}` : 'initial',
          });
          return { ok: true, status: response.status, data: parsed };
        } catch {
          // Not valid JSON -- check for Location header to extract created resource ID
          const data: Record<string, any> = { success: true, rawResponse: text };
          
          if (response.status === 201) {
            const locationHeader = response.headers.get('location');
            if (locationHeader) {
              const idMatch = locationHeader.match(/\/(\d+)\/?$/);
              if (idMatch) {
                data.createdId = Number(idMatch[1]);
                console.log('Extracted createdId from Location header:', data.createdId);
              }
            }
          }
          
          console.log('Broadstreet API returned non-JSON success:', {
            status: response.status,
            contentType,
            preview: text.substring(0, 200),
            baseUrlUsed,
            attempt: attempt > 0 ? `retry ${attempt}` : 'initial',
            createdId: data.createdId || null,
          });
          return {
            ok: true,
            status: response.status,
            data,
          };
        }
      }
      
      // Non-2xx with non-JSON is an error
      console.error(`Broadstreet API call failed:`, {
        status: response.status,
        contentType,
        preview: text.substring(0, 300),
        baseUrlUsed,
        fullUrlRedacted: getRedactedUrl(fullUrl),
        tokenFingerprint: getTokenFingerprint(resolvedCreds.accessToken),
        networkId: resolvedCreds.networkId,
      });
      
      let message: string;
      if (response.status === 401) {
        message = 'Invalid Broadstreet credentials - check BROADSTREET_ACCESS_TOKEN';
      } else if (response.status === 403) {
        message = 'Access forbidden - check your Broadstreet account permissions';
      } else if (response.status === 404) {
        message = `Broadstreet resource not found: ${endpoint}`;
      } else if (response.status >= 500) {
        message = 'Broadstreet API is temporarily unavailable. Please try again later.';
      } else if (contentType.includes('text/html')) {
        message = `Broadstreet authentication failed - your access token may be expired or invalid`;
      } else {
        message = `Broadstreet API error (${response.status}): Expected JSON but received ${contentType}`;
      }
      
      return {
        ok: false,
        status: response.status,
        data: { message }
      };
    }
    
    // Parse JSON response
    try {
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    } catch (parseError) {
      // Log token fingerprint on parse errors too
      console.error(`Failed to parse JSON from Broadstreet for ${endpoint}:`, parseError, {
        baseUrlUsed,
        fullUrlRedacted: getRedactedUrl(fullUrl),
        tokenFingerprint: getTokenFingerprint(resolvedCreds.accessToken),
        networkId: resolvedCreds.networkId,
      });
      return {
        ok: false,
        status: response.status,
        data: { message: 'Failed to parse Broadstreet API response' }
      };
    }
  }
  
  // Return last error if all retries failed
  return lastError || {
    ok: false,
    status: 500,
    data: { message: 'Unknown error after retries' }
  };
}

async function logApiCall(
  supabase: SupabaseClientType,
  logType: string,
  status: string,
  summary: string,
  requestData?: unknown,
  responseData?: unknown,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from('api_logs').insert({
      log_type: logType,
      status,
      summary,
      request_data: requestData || null,
      response_data: responseData || null,
      error_message: errorMessage || null,
    });
  } catch (e) {
    console.error('Failed to log API call:', e);
  }
}

// API Handlers - Updated to use Swagger-compliant endpoints

async function getAdvertisers(
  supabase: SupabaseClientType, 
  networkId: string,
  credentials?: BroadstreetCredentials
) {
  // Swagger: GET /advertisers?network_id=X
  const result = await safeBroadstreetRequest(`/advertisers?network_id=${networkId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch advertisers');
  }
  
  return result.data;
}

async function getAdvertiser(
  supabase: SupabaseClientType, 
  advertiserId: string,
  credentials?: BroadstreetCredentials
) {
  // Swagger: GET /advertisers/{id}
  const result = await safeBroadstreetRequest(`/advertisers/${advertiserId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch advertiser');
  }
  
  return result.data;
}

async function getCampaigns(
  supabase: SupabaseClientType,
  advertiserId: string,
  organizationId?: string,
  useCache: boolean = true,
  credentials?: BroadstreetCredentials
) {
  const cacheKey = `campaigns_${advertiserId}`;
  
  if (useCache && organizationId) {
    const cached = await getCachedData(supabase, organizationId, cacheKey);
    if (cached) {
      console.log('Returning cached campaigns');
      return cached;
    }
  }
  
  // Swagger: GET /campaigns?advertiser_id=X
  const result = await safeBroadstreetRequest(`/campaigns?advertiser_id=${advertiserId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch campaigns');
  }
  
  if (organizationId) {
    await setCachedData(supabase, organizationId, cacheKey, result.data, CACHE_TTL.campaigns);
  }
  
  return result.data;
}

async function getAdvertisements(
  supabase: SupabaseClientType,
  advertiserId: string,
  networkId: string,
  organizationId?: string,
  useCache: boolean = true,
  credentials?: BroadstreetCredentials
) {
  const cacheKey = `advertisements_${advertiserId}`;
  
  if (useCache && organizationId) {
    const cached = await getCachedData(supabase, organizationId, cacheKey);
    if (cached) {
      console.log('Returning cached advertisements');
      return cached;
    }
  }
  
  // Swagger: GET /advertisements?network_id=X&advertiser_id=Y
  const result = await safeBroadstreetRequest(
    `/advertisements?network_id=${networkId}&advertiser_id=${advertiserId}`,
    'GET',
    undefined,
    credentials
  );
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch advertisements');
  }
  
  if (organizationId) {
    await setCachedData(supabase, organizationId, cacheKey, result.data, CACHE_TTL.advertisements);
  }
  
  return result.data;
}

async function getPlacements(
  supabase: SupabaseClientType,
  campaignId: string,
  organizationId?: string,
  useCache: boolean = true,
  credentials?: BroadstreetCredentials
) {
  const cacheKey = `placements_${campaignId}`;
  
  if (useCache && organizationId) {
    const cached = await getCachedData(supabase, organizationId, cacheKey);
    if (cached) {
      console.log('Returning cached placements');
      return cached;
    }
  }
  
  // Swagger: GET /placements?campaign_id=X
  const result = await safeBroadstreetRequest(`/placements?campaign_id=${campaignId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch placements');
  }
  
  if (organizationId) {
    await setCachedData(supabase, organizationId, cacheKey, result.data, CACHE_TTL.placements);
  }
  
  return result.data;
}

async function getStats(
  supabase: SupabaseClientType,
  advertiserId: string,
  networkId: string,
  organizationId?: string,
  useCache: boolean = true,
  startDate?: string,
  endDate?: string,
  credentials?: BroadstreetCredentials
) {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const start = startDate || thirtyDaysAgo.toISOString().split('T')[0];
  const end = endDate || today.toISOString().split('T')[0];
  
  const cacheKey = `stats_${advertiserId}_${start}_${end}`;
  
  if (useCache && organizationId) {
    const cached = await getCachedData(supabase, organizationId, cacheKey);
    if (cached) {
      console.log('Returning cached stats');
      return cached;
    }
  }
  
  // Use /records endpoint per working Zapier code pattern
  // type=advertiser for aggregate stats, summary=1 for summarized results
  const result = await safeBroadstreetRequest(
    `/records?type=advertiser&id=${advertiserId}&start_date=${start}&end_date=${end}&summary=1`,
    'GET',
    undefined,
    credentials
  );
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch stats');
  }
  
  if (organizationId) {
    await setCachedData(supabase, organizationId, cacheKey, result.data, CACHE_TTL.stats);
  }
  
  return result.data;
}

// Create a new advertiser in Broadstreet and store in local DB
async function createBroadstreetAdvertiser(
  supabase: SupabaseClientType,
  networkId: string,
  organizationId: string,
  organizationName: string,
  clientCode: string,
  userId: string | null,
  credentials: BroadstreetCredentials
) {
  // Use auto-naming convention
  const advertiserName = `${organizationName} (${clientCode}) - Auto`;
  
  // POST /advertisers?network_id=X
  const result = await safeBroadstreetRequest(
    `/advertisers?network_id=${networkId}`,
    'POST',
    { name: advertiserName },
    credentials
  );
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_create_advertiser',
      'error',
      `Failed to create advertiser: ${advertiserName}`,
      { networkId, organizationId, organizationName, clientCode },
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to create advertiser');
  }
  
  const advertiserId = result.data?.advertiser?.id;
  if (!advertiserId) {
    throw new Error('Broadstreet did not return an advertiser ID');
  }
  
  // Store in local database
  const { error: dbError } = await supabase.from('display_ad_advertisers').insert({
    organization_id: organizationId,
    network_id: networkId,
    broadstreet_advertiser_id: advertiserId,
    advertiser_name: advertiserName,
    is_auto_created: true,
    created_by: userId,
  });
  
  if (dbError) {
    console.error('Failed to store advertiser in DB:', dbError);
    // Don't throw - advertiser was created in Broadstreet, just log the DB error
  }
  
  // Also update the organization's broadstreet_advertiser_id for backwards compatibility
  await supabase.from('organizations').update({
    broadstreet_advertiser_id: advertiserId,
    broadstreet_advertiser_name: advertiserName,
  }).eq('id', organizationId);
  
  await logApiCall(
    supabase,
    'broadstreet_create_advertiser',
    'success',
    `Created advertiser: ${advertiserName} (ID: ${advertiserId})`,
    { networkId, organizationId, organizationName, clientCode },
    result.data
  );
  
  return { advertiserId, advertiserName, data: result.data };
}

// Create a new campaign in Broadstreet and store in local DB
async function createBroadstreetCampaign(
  supabase: SupabaseClientType,
  advertiserId: number,
  organizationId: string,
  siteId: string,
  siteName: string,
  adType: 'billboard' | 'skyscraper',
  startDate: string,
  endDate: string | null,
  userId: string | null,
  credentials: BroadstreetCredentials,
  orgName?: string,
  clientCode?: string
) {
  // Use auto-naming convention with random ID
  const uniqueId = Math.floor(Math.random() * 100000);
  const adTypeLabel = adType.charAt(0).toUpperCase() + adType.slice(1);
  const orgPrefix = orgName && clientCode ? `${orgName} (${clientCode}) - ` : '';
  const campaignName = `${orgPrefix}${adTypeLabel} Campaign - ${siteName} - ID${uniqueId}`;
  
  // For "infinite" campaigns, use far-future date in Broadstreet
  const broadstreetEndDate = endDate || '2999-12-31';
  
  // POST /campaigns?advertiser_id=X
  const result = await safeBroadstreetRequest(
    `/campaigns?advertiser_id=${advertiserId}`,
    'POST',
    {
      name: campaignName,
      start_date: startDate,
      end_date: broadstreetEndDate,
    },
    credentials
  );
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_create_campaign',
      'error',
      `Failed to create campaign: ${campaignName}`,
      { advertiserId, siteId, adType, startDate, endDate },
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to create campaign');
  }
  
  const campaignId = result.data?.campaign?.id;
  if (!campaignId) {
    throw new Error('Broadstreet did not return a campaign ID');
  }
  
  // Store in local database
  const { data: localCampaign, error: dbError } = await supabase
    .from('display_ad_campaigns')
    .insert({
      organization_id: organizationId,
      site_id: siteId,
      broadstreet_advertiser_id: advertiserId,
      broadstreet_campaign_id: campaignId,
      name: campaignName,
      ad_type: adType,
      start_date: startDate,
      end_date: endDate, // Store null for infinite, not 2999-12-31
      is_active: true,
      is_auto_created: true,
      created_by: userId,
    })
    .select('id')
    .single();

  if (dbError) {
    console.error('Failed to store campaign in DB:', dbError);
    throw new Error('Failed to store campaign in database');
  }
  
  await logApiCall(
    supabase,
    'broadstreet_create_campaign',
    'success',
    `Created campaign: ${campaignName} (ID: ${campaignId})`,
    { advertiserId, siteId, adType, startDate, endDate },
    result.data
  );
  
  return { campaignId, campaignName, localCampaignId: localCampaign?.id ?? null, data: result.data };
}

async function createAdvertisement(
  supabase: SupabaseClientType,
  advertiserId: string,
  adData: {
    name: string;
    creative_url: string;
    click_url: string;
    width: number;
    height: number;
  },
  credentials?: BroadstreetCredentials
) {
  // Swagger: POST /advertisements?advertiser_id=X
  const result = await safeBroadstreetRequest(`/advertisements?advertiser_id=${advertiserId}`, 'POST', {
    type: 'Static',
    name: adData.name,
    destination: adData.click_url,
    active_url: adData.creative_url,
  }, credentials);
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_create_ad',
      'error',
      `Failed to create advertisement: ${adData.name}`,
      adData,
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to create advertisement');
  }
  
  await logApiCall(
    supabase,
    'broadstreet_create_ad',
    'success',
    `Created advertisement: ${adData.name}`,
    adData,
    result.data
  );
  
  return result.data;
}

async function createPlacement(
  supabase: SupabaseClientType,
  campaignId: string,
  placementData: {
    advertisement_id: number;
    zone_id: number;
  },
  credentials?: BroadstreetCredentials
) {
  // Swagger: POST /placements?campaign_id=X (body: advertisement_id + zone_id only)
  const result = await safeBroadstreetRequest(`/placements?campaign_id=${campaignId}`, 'POST', {
    advertisement_id: placementData.advertisement_id,
    zone_id: placementData.zone_id,
  }, credentials);
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_create_placement',
      'error',
      `Failed to create placement for ad ${placementData.advertisement_id}`,
      placementData,
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to create placement');
  }
  
  // Extract placement ID from Location header if available
  const createdId = result.data?.createdId;
  
  await logApiCall(
    supabase,
    'broadstreet_create_placement',
    'success',
    `Created placement for ad ${placementData.advertisement_id} in zone ${placementData.zone_id}${createdId ? ` (placement ID: ${createdId})` : ''}`,
    placementData,
    result.data
  );
  
  // Return with createdId included for callers to use
  return { ...result.data, createdId };
}

async function deletePlacement(
  supabase: SupabaseClientType,
  placementId: string,
  credentials?: BroadstreetCredentials
) {
  // Swagger: DELETE /placements/{id}
  const result = await safeBroadstreetRequest(`/placements/${placementId}`, 'DELETE', undefined, credentials);
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_delete_placement',
      'error',
      `Failed to delete placement ${placementId}`,
      { placementId },
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to delete placement');
  }
  
  await logApiCall(
    supabase,
    'broadstreet_delete_placement',
    'success',
    `Deleted placement ${placementId}`,
    { placementId }
  );
  
  return { success: true };
}

async function deleteAdvertisement(
  supabase: SupabaseClientType,
  advertiserId: string,
  advertisementId: string,
  credentials?: BroadstreetCredentials
) {
  // Swagger: DELETE /advertisements/{id}
  const result = await safeBroadstreetRequest(
    `/advertisements/${advertisementId}`,
    'DELETE',
    undefined,
    credentials
  );
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_delete_ad',
      'error',
      `Failed to delete advertisement ${advertisementId}`,
      { advertiserId, advertisementId },
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to delete advertisement');
  }
  
  await logApiCall(
    supabase,
    'broadstreet_delete_ad',
    'success',
    `Deleted advertisement ${advertisementId}`,
    { advertiserId, advertisementId }
  );
  
  return { success: true };
}

async function updateAdvertisement(
  supabase: SupabaseClientType,
  advertiserId: string,
  advertisementId: string,
  updateData: {
    name?: string;
    click_url?: string;
    creative_url?: string;
  },
  credentials?: BroadstreetCredentials
) {
  // Build the update payload per Swagger schema
  const payload: Record<string, any> = {};
  
  if (updateData.name) {
    payload.name = updateData.name;
  }
  if (updateData.click_url) {
    payload.destination = updateData.click_url;
  }
  if (updateData.creative_url) {
    payload.active_url = updateData.creative_url;
  }
  
  // Swagger: PUT /advertisements/{id} — advertiser_id query param required to resolve resource
  const result = await safeBroadstreetRequest(
    `/advertisements/${advertisementId}?advertiser_id=${advertiserId}`,
    'PUT',
    payload,
    credentials
  );
  
  if (!result.ok) {
    await logApiCall(
      supabase,
      'broadstreet_update_ad',
      'error',
      `Failed to update advertisement ${advertisementId}`,
      { advertiserId, advertisementId, updateData },
      result.data,
      result.data.message
    );
    throw new Error(result.data.message || 'Failed to update advertisement');
  }
  
  await logApiCall(
    supabase,
    'broadstreet_update_ad',
    'success',
    `Updated advertisement ${advertisementId}`,
    { advertiserId, advertisementId, updateData },
    result.data
  );
  
  return result.data;
}

// getAdvertisementDetail removed: Broadstreet GET /advertisements/{id} returns 404 for all ads.
// Click URLs are now stored in and read from the display_ad_placements table only.

async function getZones(
  supabase: SupabaseClientType,
  networkId: string,
  credentials?: BroadstreetCredentials
) {
  // Swagger: GET /zones?network_id=X
  const result = await safeBroadstreetRequest(`/zones?network_id=${networkId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Failed to fetch zones');
  }
  
  return result.data;
}

async function testConnection(supabase?: SupabaseClientType, siteId?: string) {
  const credentials = await getBroadstreetCredentials(supabase, siteId);
  // Swagger: GET /networks/{id}
  const result = await safeBroadstreetRequest(`/networks/${credentials.networkId}`, 'GET', undefined, credentials);
  
  if (!result.ok) {
    throw new Error(result.data.message || 'Connection test failed');
  }
  
  return { success: true, network: result.data };
}

// ---------------------------------------------------------------------------
// Bounded-concurrency runner: runs an array of tasks with at most `limit`
// in-flight Promises at any time. Used to keep us under Broadstreet's
// rate limits when fanning out per-ad/per-campaign requests.
// ---------------------------------------------------------------------------
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Compute campaign-level stats + active/archived ads for ONE campaign.
// Extracted from the original 'campaign-stats' case so it can be reused by
// both the single-campaign action (CampaignStatsDialog) and the new
// 'campaign-stats-bulk' action that backs the Display Ads tile grid.
// ---------------------------------------------------------------------------
interface ComputeCampaignStatsArgs {
  supabase: SupabaseClientType;
  campaignId: string;            // Broadstreet campaign ID (numeric, as string)
  advertiserId: string;          // Broadstreet advertiser ID (numeric, as string)
  siteId?: string;               // Local site UUID (used to resolve site-level credentials)
  dbCampaignId?: string;         // Local display_ad_campaigns UUID
  defaultCredentials: BroadstreetCredentials;
}

async function computeCampaignStats({
  supabase,
  campaignId,
  advertiserId,
  siteId,
  dbCampaignId,
  defaultCredentials,
}: ComputeCampaignStatsArgs): Promise<{
  stats: { views: number; clicks: number; hovers: number };
  ads: any[];
  archivedAds: any[];
  hasError: boolean;
}> {
  // Resolve site-level credentials if available
  let credentials = defaultCredentials;
  if (siteId) {
    try {
      credentials = await getBroadstreetCredentials(supabase, siteId);
    } catch {
      // Fall back to default
    }
  }

  // All-time window (matches stop-ad snapshot logic). Broadstreet account
  // predates 2020-01-01, so this covers the full lifetime of every campaign.
  const today = new Date();
  const startDate = '2020-01-01';
  const endDate = today.toISOString().split('T')[0];

  let stats = { views: 0, clicks: 0, hovers: 0 };
  let hasError = false;

  // 1. Fetch placements -> ad IDs
  const placementsResult = await safeBroadstreetRequest(
    `/placements?campaign_id=${campaignId}`,
    'GET',
    undefined,
    credentials
  );
  if (!placementsResult.ok) hasError = true;

  const rawPlacements = placementsResult.ok ? placementsResult.data : null;
  const placements = Array.isArray(rawPlacements)
    ? rawPlacements
    : (rawPlacements?.placements || []);
  const adIds = [...new Set(placements.map((p: any) => p.advertisement_id).filter(Boolean))];

  // 2. Resolve advertisement records
  let ads: any[] = [];
  if (adIds.length > 0 && advertiserId) {
    const allAdsResult = await safeBroadstreetRequest(
      `/advertisements?network_id=${credentials.networkId}&advertiser_id=${advertiserId}`,
      'GET',
      undefined,
      credentials
    );
    if (allAdsResult.ok) {
      const allAds = Array.isArray(allAdsResult.data)
        ? allAdsResult.data
        : (allAdsResult.data?.advertisements || []);
      const adIdSet = new Set(adIds.map(Number));
      ads = allAds.filter((ad: any) => adIdSet.has(ad.id));
    } else {
      hasError = true;
    }
  }

  // 3. Fetch per-ad stats with bounded concurrency (was sequential)
  if (ads.length > 0) {
    await runWithConcurrency(ads, 4, async (ad) => {
      try {
        const r = await safeBroadstreetRequest(
          `/records?type=advertisement&id=${ad.id}&start_date=${startDate}&end_date=${endDate}&summary=1`,
          'GET',
          undefined,
          credentials
        );
        if (r.ok && r.data?.totals) {
          ad.stats = {
            views: r.data.totals.views || 0,
            clicks: r.data.totals.clicks || 0,
            hovers: r.data.totals.hovers || 0,
          };
        } else {
          ad.stats = { views: 0, clicks: 0, hovers: 0 };
          ad.statsError = true;
          hasError = true;
        }
      } catch {
        ad.stats = { views: 0, clicks: 0, hovers: 0 };
        ad.statsError = true;
        hasError = true;
      }
    });
  }

  // 4. Attach started_at / click_url / placement IDs from DB (active ads)
  let activeAdMeta: Record<string, { startedAt: string; clickUrl: string | null; placementIds: number[] }> = {};
  if (dbCampaignId && ads.length > 0) {
    const { data: activePlacements } = await supabase
      .from('display_ad_placements')
      .select('broadstreet_advertisement_id, started_at, click_url, broadstreet_placement_ids')
      .eq('campaign_id', dbCampaignId)
      .eq('is_active', true);

    if (activePlacements) {
      for (const p of activePlacements) {
        activeAdMeta[String(p.broadstreet_advertisement_id)] = {
          startedAt: p.started_at,
          clickUrl: p.click_url || null,
          placementIds: (p.broadstreet_placement_ids || []).map(Number),
        };
      }
    }
  }
  for (const ad of ads) {
    const meta = activeAdMeta[String(ad.id)];
    ad.startedAt = meta?.startedAt || null;
    ad.placementIds = meta?.placementIds || [];
    ad.clickUrl = meta?.clickUrl || null;
  }

  // 5. Sum live stats
  stats = ads.reduce((acc: any, ad: any) => ({
    views: acc.views + (ad.stats?.views || 0),
    clicks: acc.clicks + (ad.stats?.clicks || 0),
    hovers: acc.hovers + (ad.stats?.hovers || 0),
  }), { views: 0, clicks: 0, hovers: 0 });

  // 6. Add archived ads + their snapshotted stats (memory: campaign-stats-persistence-v2)
  let archivedAds: any[] = [];
  if (dbCampaignId) {
    const { data: archivedPlacements } = await supabase
      .from('display_ad_placements')
      .select('*')
      .eq('campaign_id', dbCampaignId)
      .eq('is_active', false)
      .order('ended_at', { ascending: false });

    if (archivedPlacements && archivedPlacements.length > 0) {
      archivedAds = archivedPlacements.map((p: any) => ({
        id: p.broadstreet_advertisement_id,
        name: p.ad_name,
        imageUrl: p.ad_image_url,
        width: p.ad_width,
        height: p.ad_height,
        startedAt: p.started_at,
        endedAt: p.ended_at,
        clickUrl: p.click_url || null,
        stats: p.final_stats || { views: 0, clicks: 0, hovers: 0 },
      }));
      for (const a of archivedAds) {
        stats.views += a.stats.views || 0;
        stats.clicks += a.stats.clicks || 0;
        stats.hovers += a.stats.hovers || 0;
      }
    }
  }

  return { stats, ads, archivedAds, hasError };
}

// Tile-cache freshness window. Beyond this, we re-fetch from Broadstreet.
const CAMPAIGN_STATS_CACHE_TTL_MIN = 5;


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = await getSupabaseClient();
    const url = new URL(req.url);
    
    // Get siteId from query params to determine credentials
    const siteId = url.searchParams.get('siteId') || undefined;
    // Resolve credentials ONCE at the start and pass through all calls
    const credentials = await getBroadstreetCredentials(supabase, siteId);
    const { networkId } = credentials;
    
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Remove 'broadstreet-api' from path parts if present (function name in URL)
    const actionIndex = pathParts[0] === 'broadstreet-api' ? 1 : 0;
    let action = pathParts[actionIndex] || '';
    // Decode the resource ID in case it contains encoded characters
    const resourceId = pathParts[actionIndex + 1] ? decodeURIComponent(pathParts[actionIndex + 1]) : '';
    
    // Parse request body for POST/PUT/DELETE (moved up before action check)
    let body: Record<string, unknown> = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      try {
        body = await req.json();
      } catch {
        // Empty body is ok for some requests
      }
    }
    
    // If action is empty, check request body for action field
    // This supports both URL-path routing (/broadstreet-api/create-campaign)
    // and body-based routing (supabase.functions.invoke with action in body)
    if (!action && body.action && typeof body.action === 'string') {
      action = body.action;
    }
    
    // Enhanced logging for debugging path parsing
    console.log('Request parsed:', {
      method: req.method,
      pathname: url.pathname,
      pathParts,
      actionIndex,
      action,
      resourceId,
      siteId,
      networkId,
    });
    
    // Get query params
    const organizationId = url.searchParams.get('organizationId') || undefined;
    const useCache = url.searchParams.get('refresh') !== 'true';
    
    let result: unknown;
    
    switch (action) {
      case 'test-connection':
        result = await testConnection(supabase, siteId);
        break;
        
      case 'advertisers':
        result = await getAdvertisers(supabase, networkId, credentials);
        break;
        
      case 'advertiser': {
        const advertiserId = resourceId;
        if (!advertiserId) {
          throw new Error('Advertiser ID is required');
        }
        result = await getAdvertiser(supabase, advertiserId, credentials);
        break;
      }
        
      case 'campaigns': {
        const advertiserId = resourceId || body.advertiserId as string;
        if (!advertiserId) {
          throw new Error('Advertiser ID is required');
        }
        result = await getCampaigns(supabase, advertiserId, organizationId, useCache, credentials);
        break;
      }
        
      case 'advertisements': {
        const advertiserId = resourceId || body.advertiserId as string;
        if (!advertiserId) {
          throw new Error('Advertiser ID is required');
        }
        // Pass networkId to getAdvertisements for Swagger-compliant endpoint
        const adsResult = await getAdvertisements(supabase, advertiserId, networkId, organizationId, useCache, credentials);
        
        // Enrich each ad with click URL from database (API lookups return 404)
        const adsList = adsResult?.advertisements || (Array.isArray(adsResult) ? adsResult : []);
        if (adsList.length > 0) {
          const bsAdIds = adsList.map((ad: any) => Number(ad.id));
          const { data: dbPlacements } = await supabase
            .from('display_ad_placements')
            .select('broadstreet_advertisement_id, click_url')
            .in('broadstreet_advertisement_id', bsAdIds)
            .eq('is_active', true);
          
          if (dbPlacements) {
            const clickUrlMap: Record<string, string | null> = {};
            for (const p of dbPlacements) {
              // Keep the first non-null click_url found for each ad
              if (!clickUrlMap[String(p.broadstreet_advertisement_id)] && p.click_url) {
                clickUrlMap[String(p.broadstreet_advertisement_id)] = p.click_url;
              }
            }
            for (const ad of adsList) {
              ad.destination = clickUrlMap[String(ad.id)] || null;
            }
          }
        }
        
        result = adsResult;
        break;
      }
        
      case 'placements': {
        const campaignId = resourceId || body.campaignId as string;
        if (!campaignId) {
          throw new Error('Campaign ID is required');
        }
        result = await getPlacements(supabase, campaignId, organizationId, useCache, credentials);
        break;
      }
        
      case 'stats': {
        const advertiserId = resourceId || body.advertiserId as string;
        if (!advertiserId) {
          throw new Error('Advertiser ID is required');
        }
        const startDate = url.searchParams.get('startDate') || undefined;
        const endDate = url.searchParams.get('endDate') || undefined;
        // Pass networkId to getStats for Swagger-compliant endpoint
        result = await getStats(supabase, advertiserId, networkId, organizationId, useCache, startDate, endDate, credentials);
        break;
      }
        
      case 'zones':
        result = await getZones(supabase, networkId, credentials);
        break;
        
      case 'create-advertisement': {
        const { advertiserId, name, creative_url, click_url, width, height } = body;
        if (!advertiserId || !name || !creative_url || !click_url || !width || !height) {
          throw new Error('Missing required fields for advertisement creation');
        }
        result = await createAdvertisement(supabase, advertiserId as string, {
          name: name as string,
          creative_url: creative_url as string,
          click_url: click_url as string,
          width: width as number,
          height: height as number,
        }, credentials);
        // Clear ads cache after creation
        if (organizationId) {
          await clearCache(supabase, organizationId, `advertisements_${advertiserId}`);
        }
        break;
      }
        
      case 'create-placement': {
        const { campaignId, advertisement_id, zone_id } = body;
        if (!campaignId || !advertisement_id || !zone_id) {
          throw new Error('Missing required fields for placement creation');
        }
        result = await createPlacement(supabase, campaignId as string, {
          advertisement_id: advertisement_id as number,
          zone_id: zone_id as number,
        }, credentials);
        // Clear placements cache after creation
        if (organizationId) {
          await clearCache(supabase, organizationId, `placements_${campaignId}`);
        }
        break;
      }
        
      // 'delete-placement' action removed — superseded by composite-key deletion in 'stop-ad'
        
      case 'delete-advertisement': {
        const advertiserId = body.advertiserId as string;
        const advertisementId = pathParts[actionIndex + 1] || body.advertisementId as string;
        if (!advertiserId || !advertisementId) {
          throw new Error('Advertiser ID and Advertisement ID are required');
        }
        result = await deleteAdvertisement(supabase, advertiserId, advertisementId, credentials);
        // Clear ads cache after deletion
        if (organizationId) {
          await clearCache(supabase, organizationId, `advertisements_${advertiserId}`);
        }
        break;
      }
        
      case 'update-advertisement': {
        const advertiserId = body.advertiserId as string;
        const advertisementId = pathParts[actionIndex + 1] || body.advertisementId as string;
        if (!advertiserId || !advertisementId) {
          throw new Error('Advertiser ID and Advertisement ID are required');
        }
        const { name, click_url, creative_url } = body;
        // Resolve site-specific credentials if siteId is provided in body
        const updateCreds = body.siteId
          ? await getBroadstreetCredentials(supabase, body.siteId as string)
          : credentials;
        
        // Attempt Broadstreet API update, but don't let it block DB persistence
        let broadstreetUpdateFailed = false;
        try {
          result = await updateAdvertisement(supabase, advertiserId, advertisementId, {
            name: name as string | undefined,
            click_url: click_url as string | undefined,
            creative_url: creative_url as string | undefined,
          }, updateCreds);
        } catch (apiErr) {
          console.warn('Broadstreet API update failed, will still persist to DB:', apiErr);
          broadstreetUpdateFailed = true;
          result = { warning: 'Broadstreet API update failed, but data saved locally', error: String(apiErr) };
        }
        
        // Always update click_url in display_ad_placements for active placements of this ad
        if (click_url) {
          try {
            await supabase
              .from('display_ad_placements')
              .update({ click_url: click_url as string })
              .eq('broadstreet_advertisement_id', Number(advertisementId))
              .eq('is_active', true);
          } catch (e) {
            console.error('Failed to update click_url in DB:', e);
          }
        }
        // Always update ad name in display_ad_placements if changed
        if (name) {
          try {
            await supabase
              .from('display_ad_placements')
              .update({ ad_name: name as string })
              .eq('broadstreet_advertisement_id', Number(advertisementId))
              .eq('is_active', true);
          } catch (e) {
            console.error('Failed to update ad_name in DB:', e);
          }
        }
        
        // Clear ads cache after update
        if (organizationId) {
          await clearCache(supabase, organizationId, `advertisements_${advertiserId}`);
        }
        break;
      }
        
      case 'clear-cache': {
        if (!organizationId) {
          throw new Error('Organization ID is required to clear cache');
        }
        const cacheKey = body.cacheKey as string | undefined;
        await clearCache(supabase, organizationId, cacheKey);
        result = { success: true, message: 'Cache cleared' };
        break;
      }
      
      case 'create-campaign': {
        // Create a new campaign (and advertiser if needed)
        const { organizationId: orgId, siteId: targetSiteId, adType, startDate, endDate, notifyClient } = body;
        
        if (!orgId || !targetSiteId || !adType || !startDate) {
          throw new Error('Missing required fields: organizationId, siteId, adType, startDate');
        }
        
        // Fetch organization details
        const { data: org, error: orgError } = await supabase
          .from('organizations')
          .select('id, name, client_code, broadstreet_advertiser_id')
          .eq('id', orgId)
          .single();
        
        if (orgError || !org) {
          throw new Error('Organization not found');
        }
        
        // Fetch site details
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('id, name, broadstreet_config')
          .eq('id', targetSiteId)
          .single();
        
        if (siteError || !site) {
          throw new Error('Site not found');
        }
        
        // Check if site has Broadstreet config
        const siteConfig = site.broadstreet_config as Record<string, unknown> | null;
        if (!siteConfig?.enabled) {
          throw new Error('Site does not have Broadstreet enabled');
        }
        
        // Extract user ID from the Authorization header
        const authHeader = req.headers.get('Authorization');
        let userId: string | null = null;

        if (authHeader) {
          const token = authHeader.replace('Bearer ', '');
          try {
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            if (!userError && user) {
              userId = user.id;
            }
          } catch (e) {
            console.error('Failed to get user from token:', e);
          }
        }
        
        let advertiserId = org.broadstreet_advertiser_id;
        
        // Create advertiser if not exists
        if (!advertiserId) {
          const advertiserResult = await createBroadstreetAdvertiser(
            supabase,
            networkId,
            org.id,
            org.name,
            org.client_code,
            userId,
            credentials
          );
          advertiserId = advertiserResult.advertiserId;
        }
        
        // Create the campaign
        const campaignResult = await createBroadstreetCampaign(
          supabase,
          advertiserId,
          org.id,
          site.id,
          site.name,
          adType as 'billboard' | 'skyscraper',
          startDate as string,
          (endDate as string | null) || null,
          userId,
          credentials,
          org.name,
          org.client_code
        );
        
        // Send client notification if requested (default to true)
        if (notifyClient !== false) {
          try {
            const { data: orgUsers } = await supabase
              .from('user_organizations')
              .select('user_id')
              .eq('organization_id', orgId as string);

            // Determine base URL from request origin or fallback
            const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/+$/, '') || '';
            const baseUrl = origin || `https://${Deno.env.get('SUPABASE_URL')?.replace('https://', '').split('.')[0]}.lovable.app`;

            for (const orgUser of orgUsers || []) {
              try {
                await supabase.functions.invoke('send-user-notification', {
                  body: {
                    type: 'new_display_campaign',
                    userId: orgUser.user_id,
                    data: {
                      campaign_name: campaignResult.campaignName,
                      site_name: site.name,
                      ad_type: adType,
                      start_date: startDate,
                      end_date: endDate || 'Ongoing',
                      base_url: baseUrl,
                    }
                  }
                });
              } catch (notifErr) {
                console.error(`Failed to notify user ${orgUser.user_id}:`, notifErr);
              }
            }
            console.log(`Sent display campaign notifications to ${orgUsers?.length || 0} users`);
          } catch (notifErr) {
            console.error('Failed to send campaign notifications:', notifErr);
            // Don't throw - campaign was created successfully
          }
        }
        
        result = {
          success: true,
          advertiserId,
          campaignId: campaignResult.campaignId,
          campaignName: campaignResult.campaignName,
          localCampaignId: campaignResult.localCampaignId,
        };
        break;
      }

      case 'campaign-stats': {
        // Single-campaign stats (used by CampaignStatsDialog).
        // Delegates to the shared helper so logic stays consistent with the
        // bulk action below. Per-ad records are now fetched in parallel
        // (concurrency cap = 4) instead of sequentially.
        const campaignId = body.campaignId as string;
        const targetSiteId = body.siteId as string | undefined;
        const dbCampaignId = body.dbCampaignId as string | undefined;
        const advertiserId = body.advertiserId as string;

        if (!campaignId) {
          throw new Error('Campaign ID is required');
        }

        const computed = await computeCampaignStats({
          supabase,
          campaignId,
          advertiserId,
          siteId: targetSiteId,
          dbCampaignId,
          defaultCredentials: credentials,
        });

        result = {
          stats: computed.stats,
          ads: computed.ads,
          archivedAds: computed.archivedAds,
        };
        break;
      }

      case 'campaign-stats-bulk': {
        // Tile-grid stats for the Display Ads page. Returns one row per
        // local campaign UUID, served from cache when fresh and refreshed
        // on a bounded-concurrency basis when stale. This replaces the
        // previous per-tile fan-out that overwhelmed Broadstreet rate
        // limits and caused tiles to silently render 0.
        const campaignIds = (body.campaignIds as string[]) || [];
        const forceRefresh = body.forceRefresh === true;

        if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
          result = { campaigns: [] };
          break;
        }

        // Load the local campaign records (need Broadstreet IDs + site IDs)
        const { data: localCampaigns, error: lcErr } = await supabase
          .from('display_ad_campaigns')
          .select('id, organization_id, site_id, broadstreet_advertiser_id, broadstreet_campaign_id')
          .in('id', campaignIds);

        if (lcErr) throw lcErr;

        // Pull existing cache rows in one query
        const { data: cacheRows } = await supabase
          .from('display_ad_campaign_stats_cache')
          .select('*')
          .in('campaign_id', campaignIds);

        const cacheByCampaign = new Map<string, any>();
        for (const row of cacheRows || []) {
          cacheByCampaign.set(row.campaign_id, row);
        }

        const cutoff = Date.now() - CAMPAIGN_STATS_CACHE_TTL_MIN * 60_000;
        // Bump this when the stats computation changes so stale rows from the
        // prior version (e.g. the 30-day window) are forced to recompute.
        const STATS_VERSION_CUTOFF = new Date('2026-05-28T00:00:00Z').getTime();

        // Decide which campaigns need a refresh
        const toRefresh: typeof localCampaigns = [];
        const fresh: { id: string; row: any }[] = [];
        for (const c of (localCampaigns || [])) {
          const cached = cacheByCampaign.get(c.id);
          const cachedAt = cached ? new Date(cached.fetched_at).getTime() : 0;
          const isFresh = cached
            && cachedAt >= cutoff
            && cachedAt >= STATS_VERSION_CUTOFF
            && !cached.has_error;
          if (forceRefresh || !isFresh) {
            toRefresh.push(c);
          } else {
            fresh.push({ id: c.id, row: cached });
          }
        }

        // Refresh stale ones with bounded concurrency
        const refreshed = await runWithConcurrency(toRefresh, 3, async (camp) => {
          try {
            const computed = await computeCampaignStats({
              supabase,
              campaignId: String(camp.broadstreet_campaign_id),
              advertiserId: String(camp.broadstreet_advertiser_id),
              siteId: camp.site_id,
              dbCampaignId: camp.id,
              defaultCredentials: credentials,
            });

            // Build small ad-preview list (first 4 image URLs, active or archived)
            const previews = [
              ...computed.ads.map((a: any) => a?.active?.url || a?.image_url).filter(Boolean),
              ...computed.archivedAds.map((a: any) => a?.imageUrl).filter(Boolean),
            ].slice(0, 4);

            const adCount = computed.ads.length;
            const cacheRow = {
              campaign_id: camp.id,
              organization_id: camp.organization_id,
              views: computed.stats.views,
              clicks: computed.stats.clicks,
              hovers: computed.stats.hovers,
              ad_count: adCount,
              ad_previews: previews,
              has_error: computed.hasError,
              fetched_at: new Date().toISOString(),
            };

            // Upsert into cache (best-effort; don't fail the whole request)
            await supabase
              .from('display_ad_campaign_stats_cache')
              .upsert(cacheRow, { onConflict: 'campaign_id' });

            return { id: camp.id, row: cacheRow, error: false as const };
          } catch (e) {
            console.error('campaign-stats-bulk: refresh failed', camp.id, e);
            // Fall back to whatever stale row we have, if any
            const stale = cacheByCampaign.get(camp.id);
            return {
              id: camp.id,
              row: stale ?? {
                campaign_id: camp.id,
                organization_id: camp.organization_id,
                views: 0,
                clicks: 0,
                hovers: 0,
                ad_count: 0,
                ad_previews: [],
                has_error: true,
                fetched_at: stale?.fetched_at ?? new Date().toISOString(),
              },
              error: true as const,
            };
          }
        });

        const out = [
          ...fresh.map(f => ({
            campaignId: f.id,
            views: Number(f.row.views) || 0,
            clicks: Number(f.row.clicks) || 0,
            hovers: Number(f.row.hovers) || 0,
            adCount: Number(f.row.ad_count) || 0,
            adPreviews: f.row.ad_previews || [],
            hasError: false,
            fetchedAt: f.row.fetched_at,
            fromCache: true,
          })),
          ...refreshed.map(r => ({
            campaignId: r.id,
            views: Number(r.row.views) || 0,
            clicks: Number(r.row.clicks) || 0,
            hovers: Number(r.row.hovers) || 0,
            adCount: Number(r.row.ad_count) || 0,
            adPreviews: r.row.ad_previews || [],
            hasError: !!r.row.has_error || r.error,
            fetchedAt: r.row.fetched_at,
            fromCache: false,
          })),
        ];

        result = { campaigns: out };
        break;
      }

      case 'add-ad-to-campaign': {
        // Add an existing advertisement to a campaign by creating a placement
        const { advertisementId, campaignId: targetCampaignId, siteId: targetSiteId, adType, dbCampaignId: addDbCampaignId, adName: addAdName, adImageUrl: addAdImageUrl, adWidth: addAdWidth, adHeight: addAdHeight } = body;
        
        if (!advertisementId || !targetCampaignId) {
          throw new Error('Advertisement ID and Campaign ID are required');
        }
        
        // Get site config to determine zone ID
        if (!targetSiteId) {
          throw new Error('Site ID is required to determine zone placement');
        }
        
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('broadstreet_config')
          .eq('id', targetSiteId)
          .single();
        
        if (siteError || !site) {
          throw new Error('Site not found');
        }
        
        const siteConfig = site.broadstreet_config as Record<string, any> | null;
        if (!siteConfig?.enabled) {
          throw new Error('Site does not have Broadstreet enabled');
        }
        
        // Determine zone IDs based on ad type
        const zoneIds: number[] = [];
        if (adType === 'billboard') {
          const billboardZone = siteConfig.billboard_zone_id ? Number(siteConfig.billboard_zone_id) : null;
          if (billboardZone) zoneIds.push(billboardZone);
        } else if (adType === 'skyscraper' || adType === 'skyscraper_a') {
          // For skyscraper ads, add both primary and secondary zones if configured
          const primaryZone = siteConfig.skyscraper_zone_id ? Number(siteConfig.skyscraper_zone_id) : null;
          const secondaryZone = siteConfig.skyscraper_a_zone_id ? Number(siteConfig.skyscraper_a_zone_id) : null;
          if (primaryZone) zoneIds.push(primaryZone);
          if (secondaryZone) zoneIds.push(secondaryZone);
        }
        
        if (zoneIds.length === 0) {
          throw new Error(`No zone configured for ad type "${adType}" on this site`);
        }
        
        // Get site-specific credentials
        let placementCredentials = credentials;
        try {
          placementCredentials = await getBroadstreetCredentials(supabase, targetSiteId);
        } catch {
          // Fall back to default credentials
        }
        
        // Create placements for all configured zones
        const placementResults = await Promise.all(
          zoneIds.map(zoneId =>
            createPlacement(supabase, targetCampaignId as string, {
              advertisement_id: advertisementId as string,
              zone_id: zoneId,
            }, placementCredentials)
          )
        );
        
        // Extract placement IDs from results (try createdId from Location header first, then nested id)
        let createdPlacementIds = placementResults
          .map((r: any) => r?.createdId || r?.placement?.id || r?.id)
          .filter(Boolean)
          .map(Number);
        
        // Fallback: if no IDs captured, query placements from API and match by advertisement_id
        if (createdPlacementIds.length === 0 && advertisementId) {
          console.log('No placement IDs from creation response, trying fallback query...');
          try {
            const fallbackResult = await safeBroadstreetRequest(
              `/placements?campaign_id=${targetCampaignId}`,
              'GET',
              undefined,
              placementCredentials
            );
            if (fallbackResult.ok) {
              const fallbackPlacements = Array.isArray(fallbackResult.data)
                ? fallbackResult.data
                : (fallbackResult.data?.placements || []);
              // Look for placements matching this advertisement_id that have an id field
              const matchingPlacements = fallbackPlacements.filter(
                (p: any) => p.advertisement_id === Number(advertisementId) && p.id
              );
              createdPlacementIds = matchingPlacements.map((p: any) => Number(p.id));
              if (createdPlacementIds.length > 0) {
                console.log('Fallback query found placement IDs:', createdPlacementIds);
              } else {
                console.log('Fallback query found no placement IDs for ad', advertisementId);
              }
            }
          } catch (e) {
            console.error('Fallback placement ID query failed:', e);
          }
        }
        
        // Record in display_ad_placements table (include click_url if provided via override or from the ad)
        if (addDbCampaignId) {
          // Use click URL from override in body (API lookups don't work)
          const adClickUrl: string | null = (body.adClickUrl as string) || null;
          
          try {
            await supabase.from('display_ad_placements').insert({
              campaign_id: addDbCampaignId,
              broadstreet_advertisement_id: Number(advertisementId),
              broadstreet_placement_ids: createdPlacementIds,
              ad_name: (addAdName as string) || '',
              ad_image_url: (addAdImageUrl as string) || null,
              ad_width: Number(addAdWidth) || 0,
              ad_height: Number(addAdHeight) || 0,
              click_url: adClickUrl,
              started_at: new Date().toISOString(),
              is_active: true,
            });
          } catch (e) {
            console.error('Failed to record placement in DB:', e);
            // Don't throw - placement was created in Broadstreet
          }
        }
        
        // Return summary of placements created
        result = {
          placements: placementResults,
          zonesConfigured: zoneIds.length,
          message: `Created ${placementResults.length} placement(s) in ${zoneIds.length} zone(s)`
        };

        // Fire-and-forget QA check for the new ad placement
        if (addDbCampaignId) {
          // Get the placement ID we just inserted
          const { data: newPlacement } = await supabase
            .from('display_ad_placements')
            .select('id')
            .eq('campaign_id', addDbCampaignId)
            .eq('broadstreet_advertisement_id', Number(advertisementId))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // QA agent trigger removed for display ads
        }
        
        // Clear placements cache
        if (organizationId) {
          await clearCache(supabase, organizationId, `placements_${targetCampaignId}`);
        }
        break;
      }
        
      // 'remove-ad-from-campaign' action removed — superseded by 'stop-ad'
      
      case 'stop-ad': {
        // Stop an ad in a campaign: snapshot stats, archive in DB, then delete Broadstreet placements
        // Placement IDs (zone IDs) are derived from the site's broadstreet_config based on adType
        const { 
          advertisementId: stopAdId, 
          advertiserId: stopAdvertiserId,
          campaignId: stopCampaignId, 
          siteId: stopSiteId,
          dbCampaignId: stopDbCampaignId,
          adType: stopAdType,
        } = body;
        
        if (!stopAdId) {
          throw new Error('Advertisement ID is required');
        }
        if (!stopDbCampaignId) {
          throw new Error('Database campaign ID is required for stats persistence');
        }
        if (!stopSiteId) {
          throw new Error('Site ID is required to look up zone configuration');
        }
        if (!stopAdType) {
          throw new Error('Ad type is required to determine zone IDs');
        }
        
        // Look up site config to derive zone IDs (same pattern as add-ad-to-campaign)
        const { data: stopSite, error: stopSiteError } = await supabase
          .from('sites')
          .select('broadstreet_config')
          .eq('id', stopSiteId)
          .single();
        
        if (stopSiteError || !stopSite) {
          throw new Error('Site not found');
        }
        
        const stopSiteConfig = stopSite.broadstreet_config as Record<string, any> | null;
        if (!stopSiteConfig?.enabled) {
          throw new Error('Site does not have Broadstreet enabled');
        }
        
        // Derive zone IDs based on ad type (mirrors add-ad-to-campaign logic)
        const stopZoneIds: number[] = [];
        if (stopAdType === 'billboard') {
          const billboardZone = stopSiteConfig.billboard_zone_id ? Number(stopSiteConfig.billboard_zone_id) : null;
          if (billboardZone) stopZoneIds.push(billboardZone);
        } else if (stopAdType === 'skyscraper' || stopAdType === 'skyscraper_a') {
          const primaryZone = stopSiteConfig.skyscraper_zone_id ? Number(stopSiteConfig.skyscraper_zone_id) : null;
          const secondaryZone = stopSiteConfig.skyscraper_a_zone_id ? Number(stopSiteConfig.skyscraper_a_zone_id) : null;
          if (primaryZone) stopZoneIds.push(primaryZone);
          if (secondaryZone) stopZoneIds.push(secondaryZone);
        }
        
        if (stopZoneIds.length === 0) {
          throw new Error(`No zone configured for ad type "${stopAdType}" on this site`);
        }
        
        console.log(`Derived zone IDs for stop-ad: ${JSON.stringify(stopZoneIds)} (adType: ${stopAdType})`);
        
        // Get site-specific credentials
        let stopCredentials = credentials;
        try {
          stopCredentials = await getBroadstreetCredentials(supabase, stopSiteId as string);
        } catch {
          // Fall back to default credentials
        }
        
        // 1. Fetch current stats for this ad
        const today = new Date();
        const farPast = new Date('2020-01-01');
        const statsStartDate = farPast.toISOString().split('T')[0];
        const statsEndDate = today.toISOString().split('T')[0];
        
        let finalStats = { views: 0, clicks: 0, hovers: 0 };
        try {
          const adStatsResult = await safeBroadstreetRequest(
            `/records?type=advertisement&id=${stopAdId}&start_date=${statsStartDate}&end_date=${statsEndDate}&summary=1`,
            'GET',
            undefined,
            stopCredentials
          );
          if (adStatsResult.ok && adStatsResult.data?.totals) {
            finalStats = {
              views: adStatsResult.data.totals.views || 0,
              clicks: adStatsResult.data.totals.clicks || 0,
              hovers: adStatsResult.data.totals.hovers || 0,
            };
          }
        } catch (e) {
          console.error('Failed to fetch final stats for ad:', e);
        }
        
        // 2. Update the display_ad_placements record in DB
        const { error: updateError } = await supabase
          .from('display_ad_placements')
          .update({
            is_active: false,
            ended_at: new Date().toISOString(),
            final_stats: finalStats,
          })
          .eq('campaign_id', stopDbCampaignId)
          .eq('broadstreet_advertisement_id', Number(stopAdId))
          .eq('is_active', true);
        
        if (updateError) {
          console.error('Failed to update placement record:', updateError);
          // Continue anyway - we still want to delete the Broadstreet placements
        }
        
        // 3. Delete Broadstreet placements using composite key (campaign + ad + zone)
        const stopDeleteResults = await Promise.all(
          stopZoneIds.map(async (zoneId: number) => {
            try {
              const deleteResult = await safeBroadstreetRequest(
                `/placements?campaign_id=${stopCampaignId}&advertisement_id=${stopAdId}&zone_id=${zoneId}`,
                'DELETE',
                undefined,
                stopCredentials
              );
              if (!deleteResult.ok) {
                throw new Error(`DELETE /placements returned ${deleteResult.status}`);
              }
              return { id: zoneId, success: true };
            } catch (err) {
              return { id: zoneId, success: false, error: err instanceof Error ? err.message : 'Failed' };
            }
          })
        );
        
        // Fallback: if ALL zone deletions failed, try deleting the advertisement itself
        const allFailed = stopDeleteResults.every(r => !r.success);
        if (allFailed && stopDeleteResults.length > 0 && stopAdvertiserId) {
          console.warn(`All placement deletions failed for ad ${stopAdId}, falling back to deleteAdvertisement`);
          try {
            await deleteAdvertisement(supabase, stopAdvertiserId as string, stopAdId as string, stopCredentials);
            console.log(`Fallback deleteAdvertisement succeeded for ad ${stopAdId}`);
          } catch (fallbackErr) {
            console.error(`Fallback deleteAdvertisement also failed:`, fallbackErr);
          }
        }
        
        await logApiCall(
          supabase,
          'broadstreet_stop_ad',
          'success',
          `Stopped ad ${stopAdId} in campaign ${stopDbCampaignId}. Stats preserved: ${JSON.stringify(finalStats)}. Zone IDs: ${JSON.stringify(stopZoneIds)}`,
          { advertisementId: stopAdId, zoneIds: stopZoneIds, adType: stopAdType, dbCampaignId: stopDbCampaignId },
          { finalStats, deleteResults: stopDeleteResults }
        );
        
        result = {
          success: true,
          finalStats,
          deleted: stopDeleteResults.filter(r => r.success).length,
          total: stopZoneIds.length,
        };
        
        // Clear placements cache
        if (organizationId && stopCampaignId) {
          await clearCache(supabase, organizationId, `placements_${stopCampaignId}`);
        }
        break;
      }
        
      case 'track-ad-creation': {
        // Insert a tracking record into display_ad_placements using service role (bypasses RLS)
        const {
          campaignId: trackCampaignId,
          advertisementId: trackAdId,
          adName: trackAdName,
          adImageUrl: trackAdImageUrl,
          adWidth: trackAdWidth,
          adHeight: trackAdHeight,
          clickUrl: trackClickUrl,
          placementIds: trackPlacementIds,
        } = body;
        
        if (!trackCampaignId || !trackAdId) {
          throw new Error('campaignId and advertisementId are required for track-ad-creation');
        }
        
        const { data: insertedRow, error: trackError } = await supabase
          .from('display_ad_placements')
          .insert({
            campaign_id: trackCampaignId as string,
            broadstreet_advertisement_id: Number(trackAdId),
            broadstreet_placement_ids: Array.isArray(trackPlacementIds) && trackPlacementIds.length > 0
              ? trackPlacementIds.map(Number)
              : null,
            ad_name: (trackAdName as string) || '',
            ad_image_url: (trackAdImageUrl as string) || null,
            ad_width: Number(trackAdWidth) || 0,
            ad_height: Number(trackAdHeight) || 0,
            click_url: (trackClickUrl as string) || null,
            is_active: true,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (trackError) {
          console.error('track-ad-creation insert failed:', trackError);
          throw new Error(`Failed to insert tracking record: ${trackError.message}`);
        }
        
        result = { success: true, placement: insertedRow };
        break;
      }
        
      case 'update-campaign-end-date': {
        // Update a campaign's end date on Broadstreet and in local DB
        const {
          dbCampaignId: updateDbCampaignId,
          broadstreetCampaignId: updateBsCampaignId,
          advertiserId: updateAdvertiserId,
          siteId: updateSiteId,
          newEndDate: updateEndDate, // ISO date string or null for infinite
        } = body;

        if (!updateDbCampaignId || !updateBsCampaignId || !updateAdvertiserId) {
          throw new Error('dbCampaignId, broadstreetCampaignId, and advertiserId are required');
        }

        // Get site-specific credentials if available
        let updateCredentials = credentials;
        if (updateSiteId) {
          try {
            updateCredentials = await getBroadstreetCredentials(supabase, updateSiteId as string);
          } catch { /* fall back to default */ }
        }

        // For "infinite" campaigns, use far-future date in Broadstreet
        const broadstreetNewEndDate = (updateEndDate as string) || '2999-12-31';

        // PUT /campaigns/{id}?advertiser_id={advertiserId}
        const updateCampaignResult = await safeBroadstreetRequest(
          `/campaigns/${updateBsCampaignId}?advertiser_id=${updateAdvertiserId}`,
          'PUT',
          { end_date: broadstreetNewEndDate },
          updateCredentials
        );

        if (!updateCampaignResult.ok) {
          await logApiCall(
            supabase,
            'broadstreet_update_campaign_end_date',
            'error',
            `Failed to update end date for campaign ${updateBsCampaignId}`,
            { dbCampaignId: updateDbCampaignId, newEndDate: updateEndDate },
            updateCampaignResult.data,
            updateCampaignResult.data?.message
          );
          throw new Error(updateCampaignResult.data?.message || 'Failed to update campaign end date on Broadstreet');
        }

        // Update local database (store null for infinite, not 2999-12-31)
        const { error: updateDbError } = await supabase
          .from('display_ad_campaigns')
          .update({ end_date: (updateEndDate as string) || null })
          .eq('id', updateDbCampaignId);

        if (updateDbError) {
          console.error('Failed to update campaign end date in DB:', updateDbError);
          throw new Error('Broadstreet updated, but failed to update local database');
        }

        await logApiCall(
          supabase,
          'broadstreet_update_campaign_end_date',
          'success',
          `Updated end date for campaign ${updateBsCampaignId} to ${broadstreetNewEndDate}`,
          { dbCampaignId: updateDbCampaignId, newEndDate: updateEndDate },
          updateCampaignResult.data
        );

        result = { success: true };
        break;
      }

      case 'update-campaign-start-date': {
        // Update a campaign's start date on Broadstreet and in local DB
        const {
          dbCampaignId: startDbCampaignId,
          broadstreetCampaignId: startBsCampaignId,
          advertiserId: startAdvertiserId,
          siteId: startSiteId,
          newStartDate: updateStartDate, // ISO date string e.g. '2025-04-01'
        } = body;

        if (!startDbCampaignId || !startBsCampaignId || !startAdvertiserId || !updateStartDate) {
          throw new Error('dbCampaignId, broadstreetCampaignId, advertiserId, and newStartDate are required');
        }

        // Get site-specific credentials if available
        let startCredentials = credentials;
        if (startSiteId) {
          try {
            startCredentials = await getBroadstreetCredentials(supabase, startSiteId as string);
          } catch { /* fall back to default */ }
        }

        // PUT /campaigns/{id}?advertiser_id={advertiserId}
        const updateStartResult = await safeBroadstreetRequest(
          `/campaigns/${startBsCampaignId}?advertiser_id=${startAdvertiserId}`,
          'PUT',
          { start_date: updateStartDate },
          startCredentials
        );

        if (!updateStartResult.ok) {
          await logApiCall(
            supabase,
            'broadstreet_update_campaign_start_date',
            'error',
            `Failed to update start date for campaign ${startBsCampaignId}`,
            { dbCampaignId: startDbCampaignId, newStartDate: updateStartDate },
            updateStartResult.data,
            updateStartResult.data?.message
          );
          throw new Error(updateStartResult.data?.message || 'Failed to update campaign start date on Broadstreet');
        }

        // Update local database
        const { error: startDbError } = await supabase
          .from('display_ad_campaigns')
          .update({ start_date: updateStartDate as string })
          .eq('id', startDbCampaignId);

        if (startDbError) {
          console.error('Failed to update campaign start date in DB:', startDbError);
          throw new Error('Broadstreet updated, but failed to update local database');
        }

        await logApiCall(
          supabase,
          'broadstreet_update_campaign_start_date',
          'success',
          `Updated start date for campaign ${startBsCampaignId} to ${updateStartDate}`,
          { dbCampaignId: startDbCampaignId, newStartDate: updateStartDate },
          updateStartResult.data
        );

        result = { success: true };
        break;
      }

      case 'update-campaign-name': {
        const {
          dbCampaignId: nameDbCampaignId,
          broadstreetCampaignId: nameBsCampaignId,
          advertiserId: nameAdvertiserId,
          siteId: nameSiteId,
          newName,
        } = body;

        if (!nameDbCampaignId || !nameBsCampaignId || !nameAdvertiserId || !newName) {
          throw new Error('dbCampaignId, broadstreetCampaignId, advertiserId, and newName are required');
        }

        let nameCredentials = credentials;
        if (nameSiteId) {
          try {
            nameCredentials = await getBroadstreetCredentials(supabase, nameSiteId as string);
          } catch { /* fall back to default */ }
        }

        const updateNameResult = await safeBroadstreetRequest(
          `/campaigns/${nameBsCampaignId}?advertiser_id=${nameAdvertiserId}`,
          'PUT',
          { name: newName },
          nameCredentials
        );

        if (!updateNameResult.ok) {
          await logApiCall(
            supabase,
            'broadstreet_update_campaign_name',
            'error',
            `Failed to update name for campaign ${nameBsCampaignId}`,
            { dbCampaignId: nameDbCampaignId, newName },
            updateNameResult.data
          );
          throw new Error(updateNameResult.data?.message || 'Failed to update campaign name on Broadstreet');
        }

        const { error: nameDbError } = await supabase
          .from('display_ad_campaigns')
          .update({ name: newName as string })
          .eq('id', nameDbCampaignId);

        if (nameDbError) {
          console.error('Failed to update campaign name in DB:', nameDbError);
          throw new Error('Broadstreet updated, but failed to update local database');
        }

        await logApiCall(
          supabase,
          'broadstreet_update_campaign_name',
          'success',
          `Updated name for campaign ${nameBsCampaignId} to "${newName}"`,
          { dbCampaignId: nameDbCampaignId, newName },
          updateNameResult.data
        );

        result = { success: true };
        break;
      }

      case 'delete-campaign': {
        // Fully delete a campaign: stop all active ads, delete Broadstreet campaign, clean up local DB
        const {
          dbCampaignId: delDbCampaignId,
          broadstreetCampaignId: delBsCampaignId,
          advertiserId: delAdvertiserId,
          siteId: delSiteId,
        } = body;

        if (!delDbCampaignId || !delBsCampaignId || !delAdvertiserId) {
          throw new Error('dbCampaignId, broadstreetCampaignId, and advertiserId are required');
        }

        // Get site-specific credentials
        let delCredentials = credentials;
        if (delSiteId) {
          try {
            delCredentials = await getBroadstreetCredentials(supabase, delSiteId as string);
          } catch { /* fall back */ }
        }

        // 1. Fetch all placement records for this campaign
        const { data: allPlacements } = await supabase
          .from('display_ad_placements')
          .select('*')
          .eq('campaign_id', delDbCampaignId);

        const activePlacementsForDel = (allPlacements || []).filter((p: any) => p.is_active);
        const warnings: string[] = [];

        // 2. For each active ad: delete Broadstreet placements by zone, then delete the advertisement
        if (delSiteId) {
          const { data: delSite } = await supabase
            .from('sites')
            .select('broadstreet_config')
            .eq('id', delSiteId)
            .single();

          const delSiteConfig = delSite?.broadstreet_config as Record<string, any> | null;

          for (const placement of activePlacementsForDel) {
            const adId = placement.broadstreet_advertisement_id;

            // Delete placements by zone (same pattern as stop-ad)
            if (delSiteConfig?.enabled) {
              const delCampaignRow = await supabase
                .from('display_ad_campaigns')
                .select('ad_type')
                .eq('id', delDbCampaignId)
                .single();
              const adType = delCampaignRow.data?.ad_type;

              const zoneIds: number[] = [];
              if (adType === 'billboard') {
                const z = delSiteConfig.billboard_zone_id ? Number(delSiteConfig.billboard_zone_id) : null;
                if (z) zoneIds.push(z);
              } else if (adType === 'skyscraper') {
                const primary = delSiteConfig.skyscraper_zone_id ? Number(delSiteConfig.skyscraper_zone_id) : null;
                const secondary = delSiteConfig.skyscraper_a_zone_id ? Number(delSiteConfig.skyscraper_a_zone_id) : null;
                if (primary) zoneIds.push(primary);
                if (secondary) zoneIds.push(secondary);
              }

              for (const zoneId of zoneIds) {
                try {
                  await safeBroadstreetRequest(
                    `/placements?campaign_id=${delBsCampaignId}&advertisement_id=${adId}&zone_id=${zoneId}`,
                    'DELETE', undefined, delCredentials
                  );
                } catch (e) {
                  warnings.push(`Failed to delete placement for ad ${adId} zone ${zoneId}: ${e}`);
                }
              }
            }

            // Delete the advertisement from Broadstreet
            try {
              await safeBroadstreetRequest(
                `/advertisements/${adId}`,
                'DELETE', undefined, delCredentials
              );
            } catch (e) {
              warnings.push(`Failed to delete advertisement ${adId}: ${e}`);
            }
          }
        }

        // 3. Delete the Broadstreet campaign
        try {
          await safeBroadstreetRequest(
            `/campaigns/${delBsCampaignId}?advertiser_id=${delAdvertiserId}`,
            'DELETE', undefined, delCredentials
          );
        } catch (e) {
          warnings.push(`Failed to delete Broadstreet campaign: ${e}`);
        }

        // 4. Get org_id before deleting (for cache clearing)
        const { data: delCampaignOrg } = await supabase
          .from('display_ad_campaigns')
          .select('organization_id')
          .eq('id', delDbCampaignId)
          .maybeSingle();
        const delOrgId = delCampaignOrg?.organization_id;

        // 5. Clean up local database
        await supabase
          .from('display_ad_placements')
          .delete()
          .eq('campaign_id', delDbCampaignId);

        await supabase
          .from('display_ad_campaigns')
          .delete()
          .eq('id', delDbCampaignId);

        // 6. Clear related cache
        if (delOrgId) {
          await clearCache(supabase, delOrgId);
        }

        // 6. Log
        await logApiCall(
          supabase,
          'broadstreet_delete_campaign',
          warnings.length > 0 ? 'partial' : 'success',
          `Deleted campaign ${delBsCampaignId} (DB: ${delDbCampaignId}). Active ads stopped: ${activePlacementsForDel.length}. Warnings: ${warnings.length}`,
          { dbCampaignId: delDbCampaignId, broadstreetCampaignId: delBsCampaignId, advertiserId: delAdvertiserId },
          { warnings, activePlacementsCount: activePlacementsForDel.length }
        );

        result = { success: true, warnings, stoppedAds: activePlacementsForDel.length };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('Broadstreet API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
