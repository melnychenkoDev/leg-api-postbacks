import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const DISCOVERY_URL = 'https://oauth.telegram.org/.well-known/openid-configuration';

interface OidcConfig {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

// Fallback endpoints per https://core.telegram.org/widgets/login
const FALLBACK: OidcConfig = {
  issuer: 'https://oauth.telegram.org',
  authorization_endpoint: 'https://oauth.telegram.org/auth',
  token_endpoint: 'https://oauth.telegram.org/token',
  jwks_uri: 'https://oauth.telegram.org/.well-known/jwks.json',
};

let cachedConfig: OidcConfig | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function getOidcConfig(): Promise<OidcConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch(DISCOVERY_URL);
    if (res.ok) {
      const data = (await res.json()) as Partial<OidcConfig>;
      cachedConfig = {
        issuer: data.issuer || FALLBACK.issuer,
        authorization_endpoint: data.authorization_endpoint || FALLBACK.authorization_endpoint,
        token_endpoint: data.token_endpoint || FALLBACK.token_endpoint,
        jwks_uri: data.jwks_uri || FALLBACK.jwks_uri,
      };
    } else {
      cachedConfig = FALLBACK;
    }
  } catch {
    cachedConfig = FALLBACK;
  }
  return cachedConfig;
}

export function createPkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

export async function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  challenge: string;
}): Promise<string> {
  const config = await getOidcConfig();
  const url = new URL(config.authorization_endpoint);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  verifier: string;
}) {
  const config = await getOidcConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.verifier,
  });

  const res = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return (await res.json()) as { id_token?: string; access_token?: string };
}

export async function verifyIdToken(idToken: string, clientId: string) {
  const config = await getOidcConfig();
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwks_uri));
  }
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: config.issuer,
    audience: clientId,
  });
  return payload;
}
