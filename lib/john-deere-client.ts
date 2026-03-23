import { supabase } from './supabase';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  console.log('[john-deere-client] Session:', session ? 'exists' : 'null');
  if (!session) {
    throw new Error('Not authenticated');
  }
  console.log('[john-deere-client] Access token (first 20 chars):', session.access_token.substring(0, 20) + '...');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  console.log('[john-deere-client] Exchanging code for tokens...');
  console.log('[john-deere-client] Redirect URI:', redirectUri);

  const headers = await getAuthHeaders();
  console.log('[john-deere-client] Headers prepared, making request...');

  const url = `${SUPABASE_URL}/functions/v1/john-deere-auth?action=exchange`;
  console.log('[john-deere-client] URL:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, redirectUri }),
  });

  console.log('[john-deere-client] Response status:', response.status);

  if (!response.ok) {
    const error = await response.json();
    console.error('[john-deere-client] Error response:', error);
    throw new Error(error.error || 'Failed to exchange code');
  }

  const result = await response.json();
  console.log('[john-deere-client] Exchange successful');
  return result;
}

export async function refreshJohnDeereToken() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-auth?action=refresh`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to refresh token');
  }

  return response.json();
}

export async function disconnectJohnDeere() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-auth?action=disconnect`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to disconnect');
  }

  return response.json();
}

export async function fetchOrganizations() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-api?action=organizations`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch organizations');
  }

  return response.json();
}

export async function selectOrganization(orgId: string, orgName: string) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-api?action=select-organization`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ orgId, orgName }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to select organization');
  }

  return response.json();
}

export async function fetchFields() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-api?action=fields`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch fields');
  }

  return response.json();
}

export async function fetchHarvestOperations() {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/john-deere-api?action=harvest-operations`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch harvest operations');
  }

  return response.json();
}

export function getJohnDeereAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_JOHN_DEERE_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'ag1 ag2 ag3 org1 org2 work1 work2 offline_access',
    state,
  });

  return `https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/v1/authorize?${params.toString()}`;
}
