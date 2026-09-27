export interface GatewayEndpoint {
  id: string;
  name: string;
  provider: 'custom';
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
    id: 'vercel-edge',
    name: 'Vercel Serverless Gateway',
    provider: 'custom',
    url: getVercelBaseUrl(),
    ping: null,
    status: 'healthy',
    lastChecked: null,
  },
];

class GatewayManager {
  private gateways: GatewayEndpoint[] = [...DEFAULT_GATEWAYS];
  private activeGatewayId: string = 'vercel-edge';

  constructor() {
    try {
      const saved = localStorage.getItem('orbita_custom_gateways');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(
            (g) => g && g.url && !g.url.includes('workers.dev') && !g.url.includes('a.run.app') && !g.url.includes('google')
          );
          if (filtered.length > 0) {
            this.gateways = filtered;
          } else {
            localStorage.removeItem('orbita_custom_gateways');
            this.gateways = [...DEFAULT_GATEWAYS];
          }
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

  public async selectFastestGateway(_force = false): Promise<GatewayEndpoint> {
    return this.getActiveGateway();
  }

  private resolvePathForGateway(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  public async fetch(path: string, options?: RequestInit): Promise<Response> {
    const primary = this.getActiveGateway();
    const primaryPath = this.resolvePathForGateway(path);
    const url = `${primary.url.replace(/\/+$/, '')}${primaryPath}`;
    return fetch(url, options);
  }
}

export const gatewayManager = new GatewayManager();
