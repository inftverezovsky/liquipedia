import fs from 'fs';
import https from 'https';
import path from 'path';

export interface AdminHttpClientOptions {
  agent?: https.Agent;
  headers: Record<string, string>;
}

/**
 * Server-side helper to configure mTLS and Auth for Admin API requests.
 * Reads configuration from environment variables.
 */
export function getAdminHttpClientOptions(): AdminHttpClientOptions {
  const headers: Record<string, string> = {};
  let agentOptions: https.AgentOptions = {};
  let hasAgent = false;

  // 1. Authentication
  const authMode = process.env.ADMIN_AUTH_MODE || 'none';

  if (authMode === 'basic') {
    const username = process.env.ADMIN_BASIC_USERNAME || '';
    const password = process.env.ADMIN_BASIC_PASSWORD || '';
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else if (authMode === 'bearer') {
    const token = process.env.ADMIN_API_TOKEN || '';
    headers['Authorization'] = `Bearer ${token}`;
  } else if (authMode === 'x-api-key') {
    const headerName = process.env.ADMIN_API_KEY_HEADER || 'x-api-key';
    const keyValue = process.env.ADMIN_API_KEY_VALUE || '';
    headers[headerName] = keyValue;
  }

  // 2. mTLS (Client Certificates)
  const mtlsEnabled = process.env.ADMIN_MTLS_ENABLED === 'true';

  if (mtlsEnabled) {
    try {
      // PFX / P12 mode
      const pfxPath = process.env.ADMIN_MTLS_PFX_PATH;
      const pfxBase64 = process.env.ADMIN_MTLS_PFX_BASE64;
      const passphrase = process.env.ADMIN_MTLS_PFX_PASSPHRASE || process.env.ADMIN_MTLS_PASSPHRASE;

      if (pfxBase64) {
        agentOptions.pfx = Buffer.from(pfxBase64, 'base64');
        if (passphrase) agentOptions.passphrase = passphrase;
        hasAgent = true;
      } else if (pfxPath) {
        const resolvedPath = path.resolve(process.cwd(), pfxPath);
        if (fs.existsSync(resolvedPath)) {
          agentOptions.pfx = fs.readFileSync(resolvedPath);
          if (passphrase) agentOptions.passphrase = passphrase;
          hasAgent = true;
        } else {
          console.error(`Admin mTLS: PFX file not found at ${resolvedPath}`);
        }
      }

      // Cert / Key mode
      const certPath = process.env.ADMIN_MTLS_CERT_PATH;
      const keyPath = process.env.ADMIN_MTLS_KEY_PATH;
      const caPath = process.env.ADMIN_MTLS_CA_PATH;
      const certBase64 = process.env.ADMIN_MTLS_CERT_BASE64;
      const keyBase64 = process.env.ADMIN_MTLS_KEY_BASE64;
      const caBase64 = process.env.ADMIN_MTLS_CA_BASE64;

      if (certBase64) {
        agentOptions.cert = Buffer.from(certBase64, 'base64');
        hasAgent = true;
      } else if (certPath) {
        const resolvedCert = path.resolve(process.cwd(), certPath);
        if (fs.existsSync(resolvedCert)) {
          agentOptions.cert = fs.readFileSync(resolvedCert);
          hasAgent = true;
        }
      }

      if (keyBase64) {
        agentOptions.key = Buffer.from(keyBase64, 'base64');
        hasAgent = true;
      } else if (keyPath) {
        const resolvedKey = path.resolve(process.cwd(), keyPath);
        if (fs.existsSync(resolvedKey)) {
          agentOptions.key = fs.readFileSync(resolvedKey);
          hasAgent = true;
        }
      }

      if (caBase64) {
        agentOptions.ca = Buffer.from(caBase64, 'base64');
      } else if (caPath) {
        const resolvedCa = path.resolve(process.cwd(), caPath);
        if (fs.existsSync(resolvedCa)) {
          agentOptions.ca = fs.readFileSync(resolvedCa);
        }
      }

      if (process.env.ADMIN_MTLS_PASSPHRASE) {
        agentOptions.passphrase = process.env.ADMIN_MTLS_PASSPHRASE;
      }

    } catch (error) {
      console.error('Error configuring Admin mTLS:', error);
    }
  }

  return {
    headers,
    agent: hasAgent ? new https.Agent(agentOptions) : undefined,
  };
}

/**
 * Helper to check configuration status without revealing secrets.
 */
export function getAdminAuthConfigStatus() {
  return {
    mtlsEnabled: process.env.ADMIN_MTLS_ENABLED === 'true',
    mtlsConfigured: !!(
      process.env.ADMIN_MTLS_PFX_BASE64 || 
      process.env.ADMIN_MTLS_PFX_PATH || 
      (process.env.ADMIN_MTLS_CERT_BASE64 && process.env.ADMIN_MTLS_KEY_BASE64) ||
      (process.env.ADMIN_MTLS_CERT_PATH && process.env.ADMIN_MTLS_KEY_PATH)
    ),
    authMode: process.env.ADMIN_AUTH_MODE || 'none',
    authConfigured: process.env.ADMIN_AUTH_MODE !== 'none' && !!(
      process.env.ADMIN_BASIC_PASSWORD || 
      process.env.ADMIN_API_TOKEN || 
      process.env.ADMIN_API_KEY_VALUE
    ),
  };
}
