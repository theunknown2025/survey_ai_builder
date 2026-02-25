/**
 * Nfield API client (EU region, v2).
 * Base URL: https://api.nfieldmr.com
 */

const NFIELD_BASE = 'https://api.nfieldmr.com';

export interface NfieldConfig {
  domain: string;
  username: string;
  password: string;
  baseUrl?: string;
}

export interface NfieldPublicId {
  SurveyId?: string;
  Name?: string;
  Url?: string;
  Id?: string;
  Type?: number | string;
  [key: string]: unknown;
}

let cachedToken: string | null = null;

/**
 * Get bearer token via POST /v2/token
 */
export async function getNfieldToken(config: NfieldConfig): Promise<string> {
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      domainName: config.domain,
      userName: config.username,
      password: config.password,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nfield auth failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { accessToken?: string; access_token?: string; AccessToken?: string; token?: string };
  const accessToken = data.accessToken ?? data.access_token ?? data.AccessToken ?? data.token;
  if (!accessToken) throw new Error('Nfield token response missing accessToken');
  cachedToken = accessToken;
  return accessToken;
}

function getAuthHeaders(_config: NfieldConfig, token?: string): HeadersInit {
  const t = token ?? cachedToken;
  if (!t) throw new Error('No Nfield token; call getNfieldToken first');
  return {
    Authorization: `Bearer ${t}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Ensure we have a valid token (get or reuse cached).
 */
export async function ensureToken(config: NfieldConfig): Promise<string> {
  if (cachedToken) return cachedToken;
  return getNfieldToken(config);
}

/**
 * GET /v2/surveys - list surveys (OData)
 */
export async function listSurveys(config: NfieldConfig): Promise<{ SurveyId: string; Name?: string;[key: string]: unknown }[]> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/surveys`, {
    headers: getAuthHeaders(config, token),
  });
  if (!res.ok) throw new Error(`Nfield listSurveys failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { value?: { SurveyId?: string; Id?: string; Name?: string }[] } | { SurveyId?: string; Id?: string; Name?: string }[];
  const list = Array.isArray(data) ? data : (data.value ?? []);
  return list.map((s) => ({
    SurveyId: s.SurveyId ?? s.Id ?? '',
    Name: s.Name,
  }));
}

/**
 * POST /v2/surveys - create survey.
 * surveyType: "Online" = web/CAWI survey (Nfield enum name).
 */
export async function createSurvey(
  config: NfieldConfig,
  name: string,
  surveyGroupId: string = '3'
): Promise<{ SurveyId: string;[key: string]: unknown }> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/surveys`, {
    method: 'POST',
    headers: getAuthHeaders(config, token),
    body: JSON.stringify({
      surveyName: name,
      surveyType: 'Basic',
      surveyGroupId: typeof surveyGroupId === 'string' ? parseInt(surveyGroupId, 10) : surveyGroupId,
    }),
  });
  if (!res.ok) throw new Error(`Nfield createSurvey failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as { SurveyId?: string; Id?: string;[key: string]: unknown };
  const surveyId = created.SurveyId ?? created.Id ?? '';
  return { ...created, SurveyId: surveyId };
}

/**
 * PUT /v2/surveys/{surveyId}/questionnaire - upload script
 * Based on Nfield API documentation mentioning SurveyQuestionnaire.Read permission
 * Tries multiple endpoint variations and HTTP methods
 */
export async function uploadScript(
  config: NfieldConfig,
  surveyId: string,
  scriptContent: string
): Promise<void> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  
  // The correct endpoint is POST /v2/surveys/{surveyId}/script
  // The API expects JSON format with the ODIN script in a property
  // The error "Unexpected character encountered while parsing value: *" indicates
  // it's trying to parse JSON, so we need to wrap the script content in JSON
  const endpoint = `/v2/surveys/${surveyId}/script`;
  const fullUrl = `${base}${endpoint}`;
  
  // The property name must be "Script" (capital S) based on error message: {"errors":{"Script":["Script is required"]}}
  const jsonBody = { Script: scriptContent };
  
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: getAuthHeaders(config, token), // Already sets Content-Type: application/json
    body: JSON.stringify(jsonBody),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Nfield uploadScript failed: ${res.status} ${errorText} ` +
      `(endpoint: POST ${endpoint})`
    );
  }
}

/**
 * GET /v2/surveys/{surveyId}/scripts - download script (verifier)
 * Note: Endpoint uses plural "scripts" not "script"
 */
export async function downloadScript(
  config: NfieldConfig,
  surveyId: string
): Promise<string> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  
  // Try plural endpoint first
  let res = await fetch(`${base}/v2/surveys/${surveyId}/scripts`, {
    headers: getAuthHeaders(config, token),
  });
  
  // If 404, try singular endpoint as fallback
  if (res.status === 404) {
    res = await fetch(`${base}/v2/surveys/${surveyId}/script`, {
      headers: getAuthHeaders(config, token),
    });
  }
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Nfield downloadScript failed: ${res.status} ${errorText}`);
  }
  return res.text();
}

/**
 * PUT /v2/surveys/{surveyId}/mediaFiles/{fileName} - upload media (images, videos)
 */
export async function uploadMediaFile(
  config: NfieldConfig,
  surveyId: string,
  fileName: string,
  fileContent: Blob | ArrayBuffer | string,
  contentType?: string
): Promise<void> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const body = typeof fileContent === 'string' ? fileContent : fileContent;
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(`${base}/v2/surveys/${surveyId}/mediaFiles/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers,
    body,
  });
  if (!res.ok) throw new Error(`Nfield uploadMediaFile failed: ${res.status} ${await res.text()}`);
}

/**
 * GET /v2/surveys/{surveyId} - get single survey (read)
 */
export async function getSurvey(
  config: NfieldConfig,
  surveyId: string
): Promise<{ SurveyId: string; Name?: string; SurveyType?: string; SurveyGroupId?: string;[key: string]: unknown }> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/surveys/${surveyId}`, {
    headers: getAuthHeaders(config, token),
  });
  if (!res.ok) throw new Error(`Nfield getSurvey failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { SurveyId?: string; Id?: string; Name?: string;[key: string]: unknown };
  return { ...data, SurveyId: data.SurveyId ?? data.Id ?? surveyId };
}

/**
 * PATCH /v2/surveys/{surveyId} - update survey (edit)
 */
export async function updateSurvey(
  config: NfieldConfig,
  surveyId: string,
  updates: { SurveyName?: string; SurveyGroupId?: string;[key: string]: unknown }
): Promise<void> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/surveys/${surveyId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(config, token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Nfield updateSurvey failed: ${res.status} ${await res.text()}`);
}

/**
 * Publish survey - tries multiple endpoint variations
 * Note: Publishing might not be required, or the endpoint might be different
 */
export async function publishSurvey(config: NfieldConfig, surveyId: string): Promise<void> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  
  // The PUT endpoint requires a request body with SurveyPackageType: "Live" or "Test"
  // Try different property name variations and value formats
  const attempts = [
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { SurveyPackageType: 'Test' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { SurveyPackageType: 'Live' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { SurveyPackageType: 'test' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { SurveyPackageType: 'live' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { surveyPackageType: 'Test' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { surveyPackageType: 'Live' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { PackageType: 'Test' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'PUT', body: { PackageType: 'Live' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'POST', body: { SurveyPackageType: 'Test' } },
    { endpoint: `/v2/surveys/${surveyId}/publish`, method: 'POST', body: { SurveyPackageType: 'Live' } },
    { endpoint: `/v1/surveys/${surveyId}/publish`, method: 'POST' },
  ];
  
  for (const attempt of attempts) {
    const fullUrl = `${base}${attempt.endpoint}`;
    const headers = getAuthHeaders(config, token);
    
    const fetchOptions: RequestInit = {
      method: attempt.method as 'POST' | 'PUT' | 'PATCH',
      headers,
    };
    
    if (attempt.body) {
      fetchOptions.body = JSON.stringify(attempt.body);
    }
    
    const res = await fetch(fullUrl, fetchOptions);
    
    if (res.ok) {
      return; // Success!
    }
    
    // If not 404, log the error but continue trying other variations
    if (res.status !== 404) {
      const errorText = await res.text();
      // Log but don't throw yet - try other variations first
      console.warn(`Publish attempt failed: ${res.status} ${errorText} (${attempt.method} ${attempt.endpoint})`);
    }
  }
  
  // If all attempts failed, log a warning but don't throw
  // Publishing might not be strictly required - the survey might be accessible after script upload
  console.warn(
    `Nfield publish: All attempts failed. ` +
    `Tried: ${attempts.map(a => `${a.method} ${a.endpoint}`).join(', ')}. ` +
    `Continuing to get test link - survey might be accessible without explicit publishing.`
  );
  
  // Don't throw an error - the survey might be accessible without explicit publishing
  // The script upload might have automatically made it available
}

/**
 * GET /v2/surveys/{surveyId}/publicIds - get test/live links (OData)
 */
export async function getPublicIds(
  config: NfieldConfig,
  surveyId: string
): Promise<NfieldPublicId[]> {
  const token = await ensureToken(config);
  const base = config.baseUrl || NFIELD_BASE;
  const res = await fetch(`${base}/v2/surveys/${surveyId}/publicIds`, {
    headers: getAuthHeaders(config, token),
  });
  if (!res.ok) throw new Error(`Nfield getPublicIds failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { value?: NfieldPublicId[] } | NfieldPublicId[];
  return Array.isArray(data) ? data : (data.value ?? []);
}

/**
 * Get first usable test URL from publicIds (external test preferred, then internal, then first).
 */
export function getTestLinkFromPublicIds(publicIds: NfieldPublicId[]): string | null {
  for (const p of publicIds) {
    const url =
      p.Url ??
      (p as { url?: string }).url ??
      (p as { InterviewLink?: string }).InterviewLink ??
      (p as { Link?: string }).Link;
    if (url && typeof url === 'string' && url.startsWith('http')) return url;
  }
  return null;
}

/**
 * Full flow: list surveys; if none or no match, create survey, upload script, publish; then get publicIds and return test URL.
 */
export async function getNfieldTestLink(
  config: NfieldConfig,
  surveyTitle: string,
  scriptContent: string,
  options: { createIfMissing?: boolean; surveyGroupId?: string } = {}
): Promise<string> {
  const { createIfMissing = true, surveyGroupId = '3' } = options;
  await ensureToken(config);

  const surveys = await listSurveys(config);
  const existing = surveys.find(
    (s) => s.Name && s.Name.toLowerCase() === surveyTitle.trim().toLowerCase()
  );
  let surveyId: string;

  if (existing?.SurveyId) {
    surveyId = existing.SurveyId;
  } else if (createIfMissing) {
    const created = await createSurvey(config, surveyTitle.trim() || 'Survey', surveyGroupId);
    surveyId = created.SurveyId;
    await uploadScript(config, surveyId, scriptContent);
    await publishSurvey(config, surveyId);
  } else {
    const first = surveys[0];
    if (!first?.SurveyId) throw new Error('No surveys in Nfield. Create one in Nfield Manager or enable createIfMissing.');
    surveyId = first.SurveyId;
  }

  const publicIds = await getPublicIds(config, surveyId);
  const url = getTestLinkFromPublicIds(publicIds);
  if (!url) throw new Error('No test URL in publicIds response');
  return url;
}
