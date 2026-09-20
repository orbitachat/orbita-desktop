export interface GatewayEndpoint {
  id: string;
  name: string;
  provider: 'cloudflare' | 'supabase' | 'google' | 'custom';
  url: string;
  ping: number | null;
  status: 'healthy' | 'unhealthy' | 'testing' | 'idle';
  lastChecked: number | null;
}

export function getVercelBaseUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin.startsWith('http') &&
    !window.location.origin.includes('127.0.0.1') &&
    !window.location.origin.includes('localhost')
  ) {
    return window.location.origin;
  }
  const custom = import.meta.env.VITE_VERCEL_URL;
  if (custom) {
    return custom.startsWith('http') ? custom : `https://${custom}`;
  }
  return 'https://orbitad.vercel.app';
}

const DEFAULT_GATEWAYS: GatewayEndpoint[] = [
  {
    id: 'cloudflare-worker',
    name: 'Cloudflare Relay Worker',
    provider: 'cloudflare',
    url: 'https://orbita.ypgreg78.workers.dev',
    ping: null,
    status: 'idle',
    lastChecked: null,
  },
  {
    id: 'vercel-edge',
    name: 'Vercel Serverless Gateway',
    provider: 'custom',
    url: getVercelBaseUrl(),
    ping: null,
    status: 'idle',
    lastChecked: null,
  },
  ...(import.meta.env.VITE_GOOGLE_GATEWAY_URL
    ? [
        {
          id: 'google-cloud-run',
          name: 'Google Cloud (Direct Gateway)',
          provider: 'google' as const,
          url: import.meta.env.VITE_GOOGLE_GATEWAY_URL,
          ping: null,
          status: 'idle' as const,
          lastChecked: null,
        },
      ]
    : []),
];

class GatewayManager {
  private gateways: GatewayEndpoint[] = [...DEFAULT_GATEWAYS];
  private activeGatewayId: string = 'vercel-edge';
  private isTesting = false;
  private lastTestTime = 0;
  private readonly TEST_COOLDOWN_MS = 5 * 60 * 1000;

  constructor() {
    try {
      const saved = localStorage.getItem('orbita_custom_gateways');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.gateways = parsed;
        }
      }
    } catch {}
  }

  public getGateways(): GatewayEndpoint[] {
    return this.gateways;
  }

  public getActiveGateway(): GatewayEndpoint {
    const found = this.gateways.find((g) => g.id === this.activeGatewayId && g.status === 'healthy');
    return found || this.gateways.find((g) => g.id === this.activeGatewayId) || this.gateways[0];
  }

  public getBaseUrl(): string {
    return this.getActiveGateway().url.replace(/\/+$/, '');
  }

  public getUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.getBaseUrl()}${cleanPath}`;
  }

  public async selectFastestGateway(force = false): Promise<GatewayEndpoint> {
    if (this.isTesting) return this.getActiveGateway();
    
    const now = Date.now();
    const hasHealthy = this.gateways.some((g) => g.id === this.activeGatewayId && g.status === 'healthy');
    if (hasHealthy && now - this.lastTestTime < (force ? 10000 : this.TEST_COOLDOWN_MS)) {
      return this.getActiveGateway();
    }

    this.isTesting = true;
    this.lastTestTime = now;

    try {
      const results = await Promise.all(
        this.gateways.map(async (gw) => {
          const startTime = performance.now();
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500);

            const res = await fetch(`${gw.url.replace(/\/+$/, '')}/health`, {
              method: 'GET',
              signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.ok) {
              const ping = Math.round(performance.now() - startTime);
              return { ...gw, ping, status: 'healthy' as const, lastChecked: Date.now() };
            }
            return { ...gw, ping: null, status: 'unhealthy' as const, lastChecked: Date.now() };
          } catch {
            return { ...gw, ping: null, status: 'unhealthy' as const, lastChecked: Date.now() };
          }
        })
      );

      this.gateways = results;

      const healthy = results.filter((g) => g.status === 'healthy' && g.ping !== null);
      if (healthy.length > 0) {
        healthy.sort((a, b) => (a.ping ?? 9999) - (b.ping ?? 9999));
        this.activeGatewayId = healthy[0].id;
        console.log(`[GatewayManager] Active gateway selected: ${healthy[0].name} (${healthy[0].ping} ms)`);
      } else {
        console.warn('[GatewayManager] No healthy gateways responded to /health, keeping fallback');
      }
    } finally {
      this.isTesting = false;
    }

    return this.getActiveGateway();
  }

  private resolvePathForGateway(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const primary = this.getActiveGateway();
    const primaryPath = this.resolvePathForGateway(path);

    try {
      const url = `${primary.url.replace(/\/+$/, '')}${primaryPath}`;
      const res = await fetch(url, options);

      if (res.status >= 500 && res.status <= 504) {
        throw new Error(`Gateway returned HTTP ${res.status}`);
      }
      return res;
    } catch (err: any) {
      console.warn(`[GatewayManager] Primary gateway (${primary.name}) failed for ${path}:`, err?.message);

      const backups = this.gateways.filter((g) => g.id !== primary.id);
      for (const backup of backups) {
        try {
          console.log(`[GatewayManager] Retrying request via backup gateway: ${backup.name}`);
          const backupPath = this.resolvePathForGateway(path);
          const backupUrl = `${backup.url.replace(/\/+$/, '')}${backupPath}`;
          const backupRes = await fetch(backupUrl, options);
          if (backupRes.ok || backupRes.status < 500) {
            this.activeGatewayId = backup.id;
            console.log(`[GatewayManager] Switched active gateway to: ${backup.name}`);
            return backupRes;
          }
        } catch (backupErr: any) {
          console.error(`[GatewayManager] Backup gateway (${backup.name}) also failed:`, backupErr?.message);
        }
      }

      throw err;
    }
  }
}

export const gatewayManager = new GatewayManager();
