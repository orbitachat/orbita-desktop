import { AccessToken } from 'livekit-server-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface Env {
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_URL?: string;
  ABLY_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  PUSHER_KEY?: string;
  PUSHER_SECRET?: string;
  PUSHER_APP_ID?: string;
  PUSHER_CLUSTER?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_CLOUD_NAME?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(error: string, status = 400): Response {
  return jsonResponse({ error }, status);
}

function getSupabaseClient(env: Env): SupabaseClient | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Генерация Ably TokenRequest через Web Crypto API (HMAC-SHA256)
 */
async function createAblyTokenRequest(
  apiKey: string,
  clientId?: string,
  capability = '{"*":["*"]}',
  ttl = 3600000
) {
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ABLY_API_KEY format (expected keyName:keySecret)');
  }
  const [keyName, keySecret] = parts;
  const timestamp = Date.now();

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let binaryNonce = '';
  for (let i = 0; i < randomBytes.byteLength; i++) {
    binaryNonce += String.fromCharCode(randomBytes[i]);
  }
  const nonce = btoa(binaryNonce);

  const ttlStr = ttl ? ttl.toString() : '';
  const clientIdStr = clientId || '';
  const signText = `${keyName}\n${ttlStr}\n${capability}\n${clientIdStr}\n${timestamp}\n${nonce}\n`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(keySecret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signText));
  const sigBytes = new Uint8Array(signatureBuffer);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]);
  }
  const mac = btoa(sigBinary);

  return {
    keyName,
    ttl,
    capability,
    clientId: clientIdStr || undefined,
    timestamp,
    nonce,
    mac,
  };
}

/**
 * Генерация Pusher Channel Auth подписи (HMAC-SHA256)
 */
async function signPusherChannel(
  pusherKey: string,
  pusherSecret: string,
  socketId: string,
  channelName: string,
  channelData?: string
): Promise<{ auth: string; channel_data?: string }> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(pusherSecret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  let stringToSign = `${socketId}:${channelName}`;
  if (channelData) {
    stringToSign += `:${channelData}`;
  }

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
  const sigBytes = new Uint8Array(signatureBuffer);
  const hexSignature = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    auth: `${pusherKey}:${hexSignature}`,
    ...(channelData ? { channel_data: channelData } : {}),
  };
}

/**
 * Генерация Cloudinary Upload подписи (SHA-1)
 */
async function signCloudinaryUpload(
  apiKey: string,
  apiSecret: string,
  cloudName: string,
  publicId: string,
  timestamp: string
) {
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign));
  const hashBytes = new Uint8Array(hashBuffer);
  const signature = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  };
}

/**
 * Отправка события Pusher с сервера (REST API)
 */
const PUSHER_CONFIGS = (env: Env): Array<{ appId: string; key: string; secret: string; cluster: string }> => [
  {
    appId: env.PUSHER_APP_ID || '',
    key: env.PUSHER_KEY || '',
    secret: env.PUSHER_SECRET || '',
    cluster: env.PUSHER_CLUSTER || 'eu',
  }
].filter((s): s is { appId: string; key: string; secret: string; cluster: string } => Boolean(s.secret));

async function triggerPusherEventOnServer(
  server: { appId: string; key: string; secret: string; cluster: string },
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  try {
    const bodyStr = JSON.stringify({
      name: event,
      channel: channel,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });

    const encoder = new TextEncoder();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = `/apps/${server.appId}/events`;
    const queryParams = `auth_key=${server.key}&auth_timestamp=${timestamp}&auth_version=1.0`;

    const stringToSign = `POST\n${path}\n${queryParams}`;
    const keyData = encoder.encode(server.secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
    const authSignature = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const url = `https://api-${server.cluster}.pusher.com${path}?${queryParams}&auth_signature=${authSignature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });

    return res.ok;
  } catch (err) {
    console.error(`[Worker] Pusher trigger on ${server.key} failed:`, err);
    return false;
  }
}

async function triggerPusherEvent(
  env: Env,
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  const configs = PUSHER_CONFIGS(env);
  if (configs.length === 0) return false;

  const results = await Promise.allSettled(
    configs.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );

  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

const OFFICIAL_CHANNEL_ID = 'orbita-official-news-community-36c';
const OFFICIAL_CHANNEL_DATA = {
  id: OFFICIAL_CHANNEL_ID,
  name: 'Orbita News',
  description: 'Официальный новостной канал мессенджера Orbita. Обновления, новые возможности и важные анонсы.',
  avatarUrl: null,
  creatorNickname: 'Orbita Team',
  subscribersCount: 1250,
  isOfficial: true,
  createdAt: 1700000000000,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'orbita-relay-worker',
          capabilities: ['livekit', 'ably', 'relay', 'pusher', 'cloudinary'],
          timestamp: Date.now(),
        });
      }

      // 3. LiveKit Token (/token или /api/livekit/token)
      if (pathname === '/token' || pathname === '/api/livekit/token') {
        if (request.method !== 'POST') return errorResponse('Method not allowed', 405);
        if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
          return errorResponse('LiveKit credentials not configured on server', 500);
        }

        const body = (await request.json()) as { room?: string; identity?: string; name?: string };
        const { room, identity, name } = body;

        if (!room || !identity) {
          return errorResponse('Missing room or identity', 400);
        }

        const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
          identity,
          name: name || identity,
        });

        at.addGrant({
          room,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        });

        const token = await at.toJwt();
        const livekitUrl = env.LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud';

        return jsonResponse({ token, url: livekitUrl });
      }

      if (pathname === '/ably-auth' || pathname === '/api/ably-auth') {
        const ablyKey = env.ABLY_API_KEY;
        if (!ablyKey) return errorResponse('Ably credentials not configured on server', 500);
        let clientId = url.searchParams.get('clientId') || undefined;
        let capability = url.searchParams.get('capability') || '{"*":["*"]}';
        let ttl = parseInt(url.searchParams.get('ttl') || '3600000', 10);

        if (request.method === 'POST') {
          try {
            const body = (await request.json()) as any;
            if (body.clientId) clientId = body.clientId;
            if (body.capability) capability = typeof body.capability === 'string' ? body.capability : JSON.stringify(body.capability);
            if (body.ttl) ttl = body.ttl;
          } catch {
          }
        }

        const tokenRequest = await createAblyTokenRequest(ablyKey, clientId, capability, ttl);
        return jsonResponse(tokenRequest);
      }

      if (pathname === '/pusher/auth' || pathname === '/api/pusher/auth') {
        const configs = PUSHER_CONFIGS(env);
        let socketId = '';
        let channelName = '';
        let userId = '';
        let userInfo: any = null;
        let requestedKey = '';

        if (request.method === 'POST') {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = (await request.json()) as any;
            socketId = body.socket_id || body.socketId;
            channelName = body.channel_name || body.channelName;
            userId = body.user_id || body.userId;
            userInfo = body.user_info || body.userInfo;
            requestedKey = body.pusher_key || body.key;
          } else {
            const formData = await request.formData();
            socketId = formData.get('socket_id')?.toString() || '';
            channelName = formData.get('channel_name')?.toString() || '';
            userId = formData.get('user_id')?.toString() || '';
            requestedKey = formData.get('pusher_key')?.toString() || '';
          }
        } else {
          socketId = url.searchParams.get('socket_id') || '';
          channelName = url.searchParams.get('channel_name') || '';
          requestedKey = url.searchParams.get('pusher_key') || '';
        }

        if (!socketId || !channelName) {
          return errorResponse('Missing socket_id or channel_name', 400);
        }

        const targetServer = configs.find((c) => c.key === requestedKey) || configs[0];
        if (!targetServer || !targetServer.secret) {
          return errorResponse('No matching Pusher credentials configured on server', 500);
        }

        let channelDataStr: string | undefined = undefined;
        if (channelName.startsWith('presence-')) {
          channelDataStr = JSON.stringify({
            user_id: userId || socketId,
            user_info: userInfo || { nickname: 'user' },
          });
        }

        const authResponse = await signPusherChannel(
          targetServer.key,
          targetServer.secret,
          socketId,
          channelName,
          channelDataStr
        );
        return jsonResponse(authResponse);
      }

      // 6. Cloudinary Signature (/cloudinary/sign или /api/cloudinary/sign)
      if (pathname === '/cloudinary/sign' || pathname === '/api/cloudinary/sign') {
        const apiKey = env.CLOUDINARY_API_KEY;
        const apiSecret = env.CLOUDINARY_API_SECRET;
        const cloudName = env.CLOUDINARY_CLOUD_NAME;

        if (!apiKey || !apiSecret || !cloudName) {
          return errorResponse('Cloudinary credentials not configured on server', 500);
        }

        let publicId = url.searchParams.get('public_id') || url.searchParams.get('publicId') || '';
        let timestamp = url.searchParams.get('timestamp') || Math.floor(Date.now() / 1000).toString();

        if (request.method === 'POST') {
          try {
            const body = (await request.json()) as any;
            if (body.publicId || body.public_id) publicId = body.publicId || body.public_id;
            if (body.timestamp) timestamp = body.timestamp.toString();
          } catch {}
        }

        if (!publicId) {
          return errorResponse('Missing publicId parameter', 400);
        }

        const signResult = await signCloudinaryUpload(apiKey, apiSecret, cloudName, publicId, timestamp);
        return jsonResponse(signResult);
      }

      // 7. Relay: Messages
      if (pathname === '/relay/message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          senderId: string;
          recipientId: string;
          ciphertext: string;
          messageIndex: number;
          dhPublicKey: string;
        };

        const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey } = body;
        if (!chatId || !senderId || !recipientId || !ciphertext) {
          return errorResponse('Missing required message parameters', 400);
        }

        const { data, error } = await supabase
          .from('messages')
          .insert({
            chat_id: chatId,
            sender_id: senderId,
            recipient_id: recipientId,
            ciphertext,
            message_index: messageIndex,
            dh_public_key: dhPublicKey,
          })
          .select();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/messages' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const recipientId = url.searchParams.get('recipientId');
        if (!recipientId) return errorResponse('Missing recipientId parameter', 400);

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('recipient_id', recipientId)
          .eq('delivered', false)
          .order('created_at', { ascending: true });

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ messages: data || [] });
      }

      if (pathname === '/relay/message/delivered' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as { messageId: string };
        if (!body.messageId) return errorResponse('Missing messageId parameter', 400);

        const { error } = await supabase
          .from('messages')
          .update({
            delivered: true,
            expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
          })
          .eq('id', body.messageId)
          .eq('delivered', false);

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok' });
      }

      // 8. Relay: Handshakes
      if (pathname === '/relay/handshake' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          recipientCode: string;
          senderNickname: string;
          senderPublicKey: string;
          senderAvatarUrl?: string | null;
          senderCode?: string | null;
        };

        const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;
        if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
          return errorResponse('Missing required handshake parameters', 400);
        }

        const { data, error } = await supabase
          .from('handshakes')
          .insert({
            chat_id: chatId,
            recipient_code: recipientCode,
            sender_nickname: senderNickname,
            sender_public_key: senderPublicKey,
            sender_avatar_url: senderAvatarUrl || null,
            sender_code: senderCode || null,
          })
          .select();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/handshakes' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const recipientCode = url.searchParams.get('recipientCode');
        if (!recipientCode) return errorResponse('Missing recipientCode parameter', 400);

        const { data, error } = await supabase
          .from('handshakes')
          .select('*')
          .eq('recipient_code', recipientCode)
          .eq('consumed', false)
          .order('created_at', { ascending: true });

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ handshakes: data || [] });
      }

      if (pathname === '/relay/handshake/consumed' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as { handshakeId: string };
        if (!body.handshakeId) return errorResponse('Missing handshakeId parameter', 400);

        const { error } = await supabase
          .from('handshakes')
          .update({ consumed: true })
          .eq('id', body.handshakeId);

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok' });
      }

      // 9. Relay: Profiles
      if (pathname === '/relay/profile' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          nickname?: string | null;
          avatarUrl?: string | null;
        };

        if (!body.chatId) return errorResponse('Missing chatId parameter', 400);

        const { data, error } = await supabase
          .from('profile_updates')
          .insert({
            chat_id: body.chatId,
            nickname: body.nickname || null,
            avatar_url: body.avatarUrl || null,
          })
          .select();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/profile' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const chatId = url.searchParams.get('chatId');
        if (!chatId) return errorResponse('Missing chatId parameter', 400);

        const { data, error } = await supabase
          .from('profile_updates')
          .select('*')
          .eq('chat_id', chatId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ profile: data || null });
      }

      // 10. Public Channels (Сообщества / Публичные каналы)
      if (pathname === '/channels/featured' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        let channels: any[] = [OFFICIAL_CHANNEL_DATA];
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20);
            if (data && data.length > 0) {
              const mapped = data.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description || '',
                avatarUrl: c.avatar_url || null,
                creatorNickname: c.creator_nickname,
                subscribersCount: c.subscribers_count || 1,
                isOfficial: c.is_official || false,
                createdAt: new Date(c.created_at).getTime(),
              }));
              // Объединяем, исключая дубликат официального
              const others = mapped.filter((c) => c.id !== OFFICIAL_CHANNEL_ID);
              channels = [OFFICIAL_CHANNEL_DATA, ...others];
            }
          } catch {}
        }
        return jsonResponse({ channels });
      }

      if (pathname === '/channels/get' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        if (channelId === OFFICIAL_CHANNEL_ID) {
          return jsonResponse({ channel: OFFICIAL_CHANNEL_DATA });
        }

        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('public_channels')
              .select('*')
              .eq('id', channelId)
              .maybeSingle();

            if (data && !error) {
              return jsonResponse({
                channel: {
                  id: data.id,
                  name: data.name,
                  description: data.description || '',
                  avatarUrl: data.avatar_url || null,
                  creatorNickname: data.creator_nickname,
                  subscribersCount: data.subscribers_count || 1,
                  isOfficial: data.is_official || false,
                  createdAt: new Date(data.created_at).getTime(),
                },
              });
            }
          } catch {}
        }

        return errorResponse('Channel not found', 404);
      }

      if (pathname === '/channels/create' && request.method === 'POST') {
        const body = (await request.json()) as {
          id?: string;
          name: string;
          description?: string;
          avatarUrl?: string | null;
          creatorNickname: string;
        };

        if (!body.name || !body.creatorNickname) {
          return errorResponse('Missing name or creatorNickname parameter', 400);
        }

        const channelId = body.id || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const supabase = getSupabaseClient(env);

        if (supabase) {
          try {
            const { error } = await supabase.from('public_channels').upsert({
              id: channelId,
              name: body.name,
              description: body.description || '',
              avatar_url: body.avatarUrl || null,
              creator_nickname: body.creatorNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: new Date().toISOString(),
            });

            if (error) console.warn('[Worker] Channels upsert warning:', error.message);
          } catch (e) {
            console.warn('[Worker] Channels db error:', e);
          }
        }

        const channelObj = {
          id: channelId,
          name: body.name,
          description: body.description || '',
          avatarUrl: body.avatarUrl || null,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
        };

        return jsonResponse({ status: 'ok', channel: channelObj });
      }

      if (pathname === '/channels/posts' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('channel_posts')
              .select('*')
              .eq('channel_id', channelId)
              .order('created_at', { ascending: true })
              .limit(100);

            if (!error && data) {
              const mapped = data.map((p) => ({
                id: p.id,
                channelId: p.channel_id,
                sender: p.sender_nickname,
                text: p.text || '',
                time: new Date(p.created_at).getTime(),
                mediaType: p.media_type || null,
                mediaUrl: p.media_url || null,
                mediaName: p.media_name || null,
                mime: p.mime || null,
                duration: p.duration || null,
                width: p.width || null,
                height: p.height || null,
                waveform: p.waveform || null,
                audioMetadata: p.audio_metadata || null,
                linkPreview: p.link_preview || null,
                reactions: p.reactions || {},
              }));
              return jsonResponse({ posts: mapped });
            }
          } catch {}
        }

        // Fallback для официального новостного канала Orbita
        if (channelId === OFFICIAL_CHANNEL_ID) {
          const defaultPosts = [
            {
              id: 'post_official_welcome',
              channelId: OFFICIAL_CHANNEL_ID,
              sender: 'Orbita Team',
              text: 'Добро пожаловать в официальный канал Orbita! 🎉\n\nЗдесь мы публикуем свежие обновления, новые фичи и полезные советы по использованию мессенджера.',
              time: Date.now() - 3600000 * 24,
              reactions: { '🔥': ['Orbita Team', 'User'] },
            },
            {
              id: 'post_official_features',
              channelId: OFFICIAL_CHANNEL_ID,
              sender: 'Orbita Team',
              text: '⚡️ Что нового в Orbita:\n• Публичные каналы и сообщества\n• Мгновенный обмен аудиофайлами и медиа\n• Сквозное шифрование Double Ratchet\n• Голосовые и видеозвонки LiveKit',
              time: Date.now() - 3600000 * 2,
              reactions: { '🚀': ['Orbita Team'] },
            },
          ];
          return jsonResponse({ posts: defaultPosts });
        }

        return jsonResponse({ posts: [] });
      }

      if (pathname === '/channels/post' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          senderNickname: string;
          text?: string;
          mediaType?: string | null;
          mediaUrl?: string | null;
          mediaName?: string | null;
          mime?: string | null;
          duration?: number | null;
          width?: number | null;
          height?: number | null;
          waveform?: number[] | null;
          audioMetadata?: any | null;
          linkPreview?: any | null;
        };

        if (!body.channelId || !body.senderNickname) {
          return errorResponse('Missing channelId or senderNickname parameter', 400);
        }

        const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const createdAt = new Date().toISOString();

        const postRecord = {
          id: postId,
          channelId: body.channelId,
          sender: body.senderNickname,
          text: body.text || '',
          time: Date.now(),
          mediaType: body.mediaType || null,
          mediaUrl: body.mediaUrl || null,
          mediaName: body.mediaName || null,
          mime: body.mime || null,
          duration: body.duration || null,
          width: body.width || null,
          height: body.height || null,
          waveform: body.waveform || null,
          audioMetadata: body.audioMetadata || null,
          linkPreview: body.linkPreview || null,
          reactions: {},
        };

        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            await supabase.from('channel_posts').insert({
              id: postId,
              channel_id: body.channelId,
              sender_nickname: body.senderNickname,
              text: body.text || '',
              media_type: body.mediaType || null,
              media_url: body.mediaUrl || null,
              media_name: body.mediaName || null,
              mime: body.mime || null,
              duration: body.duration || null,
              width: body.width || null,
              height: body.height || null,
              waveform: body.waveform || null,
              audio_metadata: body.audioMetadata || null,
              link_preview: body.linkPreview || null,
              reactions: {},
              created_at: createdAt,
            });
          } catch (e) {
            console.warn('[Worker] Save channel post to DB failed:', e);
          }
        }

        // Трансляция события через Pusher всем подписчикам канала в реальном времени
        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'new-post', postRecord);

        return jsonResponse({ status: 'ok', post: postRecord });
      }

      if (pathname === '/channels/join' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          nickname?: string;
        };
        if (!body.channelId) return errorResponse('Missing channelId parameter', 400);

        const channelId = body.channelId.trim();
        let newCount = 1;
        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('subscribers_count')
              .eq('id', channelId)
              .maybeSingle();

            const current = Number(data?.subscribers_count) || 1;
            newCount = current + 1;

            await supabase
              .from('public_channels')
              .update({ subscribers_count: newCount })
              .eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Join channel db error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'subscribers-updated', {
          channelId,
          subscribersCount: newCount,
          action: 'join',
          nickname: body.nickname || 'Unknown',
        });

        return jsonResponse({ status: 'ok', subscribersCount: newCount });
      }

      if (pathname === '/channels/leave' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          nickname?: string;
        };
        if (!body.channelId) return errorResponse('Missing channelId parameter', 400);

        const channelId = body.channelId.trim();
        let newCount = 1;
        const supabase = getSupabaseClient(env);
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('subscribers_count')
              .eq('id', channelId)
              .maybeSingle();

            const current = Number(data?.subscribers_count) || 1;
            newCount = Math.max(1, current - 1);

            await supabase
              .from('public_channels')
              .update({ subscribers_count: newCount })
              .eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Leave channel db error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'subscribers-updated', {
          channelId,
          subscribersCount: newCount,
          action: 'leave',
          nickname: body.nickname || 'Unknown',
        });

        return jsonResponse({ status: 'ok', subscribersCount: newCount });
      }

      if (pathname === '/channels/reaction' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          postId: string;
          emoji: string;
          userId: string;
          action?: 'add' | 'remove' | 'toggle';
        };

        if (!body.channelId || !body.postId || !body.emoji || !body.userId) {
          return errorResponse('Missing required reaction parameters', 400);
        }

        const supabase = getSupabaseClient(env);
        let updatedReactions: Record<string, string[]> = {};

        if (supabase) {
          try {
            const { data } = await supabase
              .from('channel_posts')
              .select('reactions')
              .eq('id', body.postId)
              .maybeSingle();

            let reactions: Record<string, string[]> = {};
            if (data?.reactions) {
              if (typeof data.reactions === 'string') {
                try {
                  reactions = JSON.parse(data.reactions);
                } catch {}
              } else if (typeof data.reactions === 'object') {
                reactions = { ...data.reactions };
              }
            }

            const currentUsers = Array.isArray(reactions[body.emoji]) ? reactions[body.emoji] : [];
            const alreadyPresent = currentUsers.includes(body.userId);

            if (
              body.action === 'add' ||
              (!body.action && !alreadyPresent) ||
              (body.action === 'toggle' && !alreadyPresent)
            ) {
              reactions[body.emoji] = [...currentUsers.filter((u) => u !== body.userId), body.userId];
            } else {
              const filtered = currentUsers.filter((u) => u !== body.userId);
              if (filtered.length > 0) {
                reactions[body.emoji] = filtered;
              } else {
                delete reactions[body.emoji];
              }
            }

            await supabase
              .from('channel_posts')
              .update({ reactions })
              .eq('id', body.postId);

            updatedReactions = reactions;
          } catch (e) {
            console.warn('[Worker] Update reaction in DB failed:', e);
          }
        }

        // Трансляция обновления реакции
        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'reaction-updated', {
          postId: body.postId,
          emoji: body.emoji,
          userId: body.userId,
          action: body.action || 'toggle',
          reactions: updatedReactions,
        });

        return jsonResponse({ status: 'ok', reactions: updatedReactions });
      }

      if ((pathname === '/developers' || pathname === '/relay/developers') && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) {
          return errorResponse('Supabase not configured on worker', 500);
        }
        const { data, error } = await supabase
          .from('developers')
          .select('code');

        if (error) {
          return errorResponse(error.message, 500);
        }

        const codes = (data || []).map((d: any) => d.code).filter(Boolean);
        return jsonResponse({ developers: codes });
      }

      return errorResponse('Endpoint not found', 404);
    } catch (err: any) {
      console.error('[Worker] Unhandled error:', err);
      return errorResponse(err?.message || 'Internal Server Error', 500);
    }
  },
};