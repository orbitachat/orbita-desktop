import Pusher from 'pusher-js';
import { gatewayManager } from '../services/gatewayManager';

export interface PusherServerConfig {
  id: string;
  key: string;
  cluster: string;
}

export const PUSHER_SERVERS: PusherServerConfig[] = [
  {
    id: 'pusher-1',
    key: import.meta.env.VITE_PUSHER_KEY || 'e8f5cf13f6759775e44e',
    cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'eu',
  },
  {
    id: 'pusher-2',
    key: 'a7856d37aeac4f908167',
    cluster: 'eu',
  },
  {
    id: 'pusher-3',
    key: '6425abc10a40f7853231',
    cluster: 'eu',
  },
];

let activeServerIndex = 0;
let pusherInstance: Pusher | null = null;

export const getPusher = (): Pusher => {
  if (!pusherInstance) {
    const currentServer = PUSHER_SERVERS[activeServerIndex] || PUSHER_SERVERS[0];
    pusherInstance = new Pusher(currentServer.key, {
      cluster: currentServer.cluster,
      authorizer: (channel) => ({
        authorize: async (socketId, callback) => {
          try {
            const response = await gatewayManager.fetch('/pusher/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                socket_id: socketId,
                channel_name: channel.name,
                pusher_key: currentServer.key,
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Pusher auth failed (${response.status}): ${errText}`);
            }

            const data = await response.json();
            callback(null, data);
          } catch (err: any) {
            console.error('[Pusher] Authorizer error:', err);
            callback(err, { auth: '' });
          }
        },
      }),
    });

    pusherInstance.connection.bind('unavailable', () => {
      switchToNextPusherServer();
    });

    console.log(`[Pusher] Active server: ${currentServer.id} (key: ${currentServer.key}, cluster: ${currentServer.cluster})`);
    if (typeof window !== 'undefined') {
      (window as any).orbitaPusher = pusherInstance;
      (window as any).switchToNextPusherServer = switchToNextPusherServer;
      (window as any).getActivePusherServer = getActivePusherServer;
    }
  }
  return pusherInstance;
};

export const switchToNextPusherServer = (): Pusher => {
  if (pusherInstance) {
    try {
      pusherInstance.disconnect();
    } catch {}
    pusherInstance = null;
  }
  activeServerIndex = (activeServerIndex + 1) % PUSHER_SERVERS.length;
  const nextServer = PUSHER_SERVERS[activeServerIndex];
  console.log(`[Pusher] Failover: switched to ${nextServer.id} (key: ${nextServer.key}, cluster: ${nextServer.cluster})`);
  return getPusher();
};

export const getActivePusherServer = (): PusherServerConfig => PUSHER_SERVERS[activeServerIndex];

