// Types for WireGuard configuration and clients derived from src/lib/WireGuard.ts

// Server section inside config
export interface ServerConfig {
  privateKey: string;
  publicKey: string;
  address: string; // e.g., 10.8.0.1
  jc: number;
  jmin: number;
  jmax: number;
  s1: number;
  s2: number;
  h1: number;
  h2: number;
  h3: number;
  h4: number;
}

// Client entry as stored in config.clients (persisted JSON)
export interface ClientConfig {
  id: string;
  name: string;
  address: string; // IPv4
  privateKey?: string; // may be missing for non-downloadable configs
  publicKey: string;
  preSharedKey?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiredAt: Date | string | null;
  enabled: boolean;
  allowedIPs?: string; // not always present in persisted config
  oneTimeLink?: string | null;
  oneTimeLinkExpiresAt?: Date | string | null;
}

// Full config file shape
export interface WireGuardConfig {
  server: ServerConfig;
  clients: Record<string, ClientConfig>;
}

// Client shape returned by WireGuard.getClients()
export interface ClientListItem {
  id: string;
  name: string;
  enabled: boolean;
  address: string;
  publicKey: string;
  createdAt: Date;
  updatedAt: Date;
  expiredAt: Date | null;
  allowedIPs?: string;
  oneTimeLink: string | null;
  oneTimeLinkExpiresAt: Date | string | null;
  downloadableConfig: boolean; // whether "privateKey" exists in the stored client
  persistentKeepalive: string | null;
  latestHandshakeAt: Date | null;
  transferRx: number | null;
  transferTx: number | null;
  endpoint: string | null;
}
