import { getVercelBaseUrl } from './gatewayManager';

export interface RelayNode {
  id: string;
  url: string;
  name: string;
  region?: string;
  isHealthy?: boolean;
}

export const DEFAULT_RELAY_NODES: RelayNode[] = [
  {
    id: 'relay-edge-main',
    url: getVercelBaseUrl(),
    name: 'Orbita Vercel Serverless Relay',
    region: 'global',
  },
];

export class RelayRouter {
  private nodes: RelayNode[] = DEFAULT_RELAY_NODES;
  private epochDurationMs = 24 * 60 * 60 * 1000;

  constructor(customNodes?: RelayNode[], epochDurationMs?: number) {
    if (customNodes && customNodes.length > 0) {
      this.nodes = customNodes;
    }
    if (epochDurationMs) {
      this.epochDurationMs = epochDurationMs;
    }
  }

  public getNodes(): RelayNode[] {
    return this.nodes;
  }

  public setNodes(nodes: RelayNode[]): void {
    if (nodes.length > 0) {
      this.nodes = nodes;
    }
  }

  public addNode(node: RelayNode): void {
    if (!this.nodes.some((n) => n.id === node.id || n.url === node.url)) {
      this.nodes.push(node);
    }
  }

  public getCurrentEpoch(timestamp: number = Date.now()): number {
    return Math.floor(timestamp / this.epochDurationMs);
  }

  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  public getRelayForRecipient(recipientId: string, epochOffset = 0): RelayNode {
    if (this.nodes.length === 0) {
      return DEFAULT_RELAY_NODES[0];
    }
    if (this.nodes.length === 1) {
      return this.nodes[0];
    }

    const epoch = this.getCurrentEpoch() + epochOffset;
    const seed = `${recipientId.trim().toLowerCase()}::${epoch}`;
    const hash = this.hashString(seed);
    const index = hash % this.nodes.length;
    return this.nodes[index];
  }

  public getActiveRelaysForMe(myId: string): RelayNode[] {
    const current = this.getRelayForRecipient(myId, 0);
    const previous = this.getRelayForRecipient(myId, -1);

    if (current.url === previous.url) {
      return [current];
    }
    return [current, previous];
  }
}

export const relayRouter = new RelayRouter();
