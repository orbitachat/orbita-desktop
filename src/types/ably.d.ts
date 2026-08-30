// src/types/ably.d.ts
import 'ably';

declare module 'ably' {
  interface RealtimePresence {
    get(callback: (err: any, members: PresenceMessage[]) => void): void;
    subscribe(event: 'enter' | 'leave' | 'update', callback: (message: PresenceMessage) => void): void;
    unsubscribe(event: 'enter' | 'leave' | 'update', callback: (message: PresenceMessage) => void): void;
  }
}