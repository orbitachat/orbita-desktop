import { AccessToken } from 'livekit-server-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ed25519 } from '@noble/curves/ed25519.js';

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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-user-id',
};

function verifyWorkerEd25519(userIdHex: string, version: number, configBlob: string, signatureHex: string): boolean {
  if (!userIdHex || !signatureHex || version === undefined || !configBlob) return false;
  try {
    const cleanUserId = String(userIdHex).trim().toLowerCase();
    const cleanSig = String(signatureHex).trim().toLowerCase();
    const messageStr = `${cleanUserId}${version}${configBlob}`;
    const messageBytes = new TextEncoder().encode(messageStr);
    const pubBytes = new Uint8Array(cleanUserId.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    return ed25519.verify(sigBytes, messageBytes, pubBytes);
  } catch {
    return false;
  }
}

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

async function toUuid(id?: string): Promise<string | null> {
  if (!id || typeof id !== 'string') return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const enc = new TextEncoder().encode(id);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  const hashArr = Array.from(new Uint8Array(hashBuf)).slice(0, 16);
  const h = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

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
          supabase_host: env.SUPABASE_URL ? new URL(env.SUPABASE_URL).hostname : null,
          timestamp: Date.now(),
        });
      }

      if (pathname === '/user/config' || pathname === '/api/user/config') {
        if (request.method === 'GET') {
          const userId = (url.searchParams.get('user_id') || url.searchParams.get('userId') || '').trim().toLowerCase();
          if (!userId) return errorResponse('Missing user_id', 400);
          if (!/^[0-9a-f]{64}$/i.test(userId)) return errorResponse('Invalid user_id format', 400);

          const supabase = getSupabaseClient(env);
          if (!supabase) return errorResponse('Database not configured on server', 503);

          const { data, error } = await supabase
            .from('user_configs')
            .select('config_blob, version, updated_at')
            .eq('user_id', userId)
            .maybeSingle();

          if (error) {
            return errorResponse(error.message, 500);
          }

          if (!data) {
            return jsonResponse({ status: 'not_found', config_blob: null, version: 0, updated_at: null }, 404);
          }

          return jsonResponse({
            status: 'ok',
            config_blob: data.config_blob,
            version: Number(data.version),
            updated_at: data.updated_at,
          });
        }

        if (request.method === 'PUT' || request.method === 'POST') {
          let body: any;
          try {
            body = await request.json();
          } catch {
            return errorResponse('Invalid JSON body', 400);
          }

          const userId = String(body.user_id || body.userId || url.searchParams.get('user_id') || url.searchParams.get('userId') || request.headers.get('x-user-id') || '').trim().toLowerCase();
          const configBlob = body.config_blob || body.configBlob;
          const version = Number(body.version);
          const signature = String(body.signature || '').trim().toLowerCase();

          if (!userId || !/^[0-9a-f]{64}$/i.test(userId)) {
            return errorResponse('Invalid or missing user_id', 400);
          }
          if (!configBlob || typeof configBlob !== 'string') {
            return errorResponse('Invalid or missing config_blob', 400);
          }
          if (!Number.isSafeInteger(version) || version <= 0) {
            return errorResponse('Invalid version: must be a positive integer', 400);
          }
          if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) {
            return errorResponse('Invalid or missing signature (expected 128 hex chars)', 400);
          }

          const blobBytesLength = new TextEncoder().encode(configBlob).length;
          if (blobBytesLength > 128 * 1024) {
            return errorResponse('Payload too large: config_blob exceeds 128 KB limit', 413);
          }

          const isValidSig = verifyWorkerEd25519(userId, version, configBlob, signature);
          if (!isValidSig) {
            return errorResponse('Invalid Ed25519 signature', 401);
          }

          const supabase = getSupabaseClient(env);
          if (!supabase) return errorResponse('Database not configured on server', 503);

          const { data: existing, error: selectErr } = await supabase
            .from('user_configs')
            .select('version')
            .eq('user_id', userId)
            .maybeSingle();

          if (selectErr) {
            return errorResponse(selectErr.message, 500);
          }

          if (existing && existing.version !== null && existing.version !== undefined) {
            const currentVersion = Number(existing.version);
            if (version <= currentVersion) {
              return errorResponse(`Conflict: incoming version (${version}) must be strictly greater than current version (${currentVersion})`, 409);
            }
          }

          const nowIso = new Date().toISOString();
          const { error: upsertErr } = await supabase
            .from('user_configs')
            .upsert({
              user_id: userId,
              config_blob: configBlob,
              version: version,
              signature: signature,
              updated_at: nowIso,
            });

          if (upsertErr) {
            return errorResponse(upsertErr.message, 500);
          }

          return jsonResponse({
            status: 'ok',
            version,
            updated_at: nowIso,
          });
        }

        return errorResponse('Method not allowed', 405);
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
          prevChainCount?: number;
          clientMsgId?: string;
          id?: string;
        };

        const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey, clientMsgId, id } = body;
        if (!chatId || !senderId || !recipientId || !ciphertext) {
          return errorResponse('Missing required message parameters', 400);
        }

        const msgRow: any = {
          chat_id: chatId,
          sender_id: senderId,
          recipient_id: recipientId,
          ciphertext,
          message_index: messageIndex,
          dh_public_key: dhPublicKey,
          prev_chain_count: body.prevChainCount ?? null,
        };
        const explicitUuid = await toUuid(id || clientMsgId);
        if (explicitUuid) {
          msgRow.id = explicitUuid;
        }

        const { data, error } = await supabase
          .from('messages')
          .insert(msgRow)
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

      if (pathname === '/relay/chat-handshakes' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);
        const chatId = url.searchParams.get('chatId');
        if (!chatId) return errorResponse('Missing chatId parameter', 400);
        const { data, error } = await supabase
          .from('handshakes')
          .select('*')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false });
        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ handshakes: data || [] });
      }

      if (pathname === '/relay/profile' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId: string;
          nickname?: string | null;
          avatarUrl?: string | null;
          hideProfileId?: boolean | null;
          senderCode?: string | null;
        };

        if (!body.chatId) return errorResponse('Missing chatId parameter', 400);

        try {
          if (body.senderCode) {
            await supabase.from('profile_updates').delete().eq('chat_id', body.chatId).eq('sender_code', body.senderCode);
          }
        } catch {}

        const { data, error } = await supabase
          .from('profile_updates')
          .insert({
            chat_id: body.chatId,
            nickname: body.nickname || null,
            avatar_url: body.avatarUrl || null,
            hide_profile_id: body.hideProfileId !== undefined ? body.hideProfileId : null,
            sender_code: body.senderCode || null,
          })
          .select();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ status: 'ok', data });
      }

      if (pathname === '/relay/delete-message' && request.method === 'POST') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const body = (await request.json()) as {
          chatId?: string;
          messageId: string;
          recipientId?: string;
          senderId?: string;
        };

        if (body.messageId) {
          try {
            const uuid = await toUuid(body.messageId);
            if (uuid) {
              await supabase.from('messages').delete().eq('id', uuid);
            }
            await supabase.from('messages').delete().eq('id', body.messageId);
            await supabase.from('non_messages').delete().eq('id', body.messageId);
            if (uuid) {
              await supabase.from('non_messages').delete().eq('id', uuid);
            }
            if (body.chatId) {
              await supabase.from('non_messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${body.messageId}%`);
              await supabase.from('messages').delete().eq('chat_id', body.chatId).ilike('ciphertext', `%${body.messageId}%`);
            }
            if (body.recipientId && body.chatId) {
              const targets = Array.isArray(body.recipientId) ? body.recipientId : [body.recipientId];
              for (const rId of targets) {
                await supabase.from('non_messages').insert({
                  id: `del_${body.messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  chat_id: body.chatId,
                  sender_id: body.senderId || 'system',
                  recipient_id: rId,
                  ciphertext: JSON.stringify({
                    type: 'delete-message',
                    targetMessageId: body.messageId,
                    chatId: body.chatId,
                  }),
                  delivered: false,
                });
              }
            }
          } catch (e) {
            console.warn('[Worker] delete-message error:', e);
          }
        }

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/relay/profile' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        if (!supabase) return errorResponse('Database not configured on server', 500);

        const chatId = url.searchParams.get('chatId');
        if (!chatId) return errorResponse('Missing chatId parameter', 400);
        const excludeCode = url.searchParams.get('excludeCode');

        let query = supabase
          .from('profile_updates')
          .select('*')
          .eq('chat_id', chatId);

        if (excludeCode) {
          query = query.neq('sender_code', excludeCode);
        }

        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return errorResponse(error.message, 500);
        return jsonResponse({ profile: data || null });
      }

      // 10. Public Channels (Сообщества / Публичные каналы)
      if (pathname === '/channels/featured' && request.method === 'GET') {
        const supabase = getSupabaseClient(env);
        let channels: any[] = [];
        if (supabase) {
          try {
            const { data } = await supabase
              .from('public_channels')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20);
            if (data && data.length > 0) {
              channels = data.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description || '',
                avatarUrl: c.avatar_url || null,
                creatorNickname: c.creator_nickname,
                subscribersCount: c.subscribers_count || 1,
                isOfficial: c.is_official || false,
                createdAt: new Date(c.created_at).getTime(),
              }));
            }
          } catch {}
        }
        return jsonResponse({ channels });
      }

      if (pathname === '/channels/get' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

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
          creatorId?: string;
        };

        if (!body.name || !body.creatorNickname) {
          return errorResponse('Missing name or creatorNickname parameter', 400);
        }

        const channelId = body.id || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const creatorId = await toUuid(body.creatorId);
        const supabase = getSupabaseClient(env);

        if (supabase) {
          try {
            if (creatorId) {
              await supabase.from('profiles').upsert({
                id: creatorId,
                username: body.creatorNickname,
                avatar_url: body.avatarUrl || null,
                updated_at: new Date().toISOString(),
              });
            }
            const { error } = await supabase.from('public_channels').upsert({
              id: channelId,
              name: body.name,
              description: body.description || '',
              avatar_url: body.avatarUrl || null,
              creator_id: creatorId || null,
              creator_nickname: body.creatorNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: new Date().toISOString(),
            });

            if (creatorId) {
              await supabase.from('channel_members').upsert({
                channel_id: channelId,
                user_id: creatorId,
                role: 'owner',
                joined_at: new Date().toISOString(),
              });
            }

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
          creatorId: creatorId || undefined,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
        };

        return jsonResponse({ status: 'ok', channel: channelObj });
      }

      if (pathname === '/channels/update' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId?: string;
          id?: string;
          userId?: string;
          name?: string;
          description?: string;
          avatarUrl?: string | null;
        };

        const channelId = body.channelId || body.id;
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        const userId = await toUuid(body.userId);
        if (supabase && userId) {
          try {
            const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', channelId).maybeSingle();
            if (chan && chan.creator_id && chan.creator_id !== userId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', channelId)
                .eq('user_id', userId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: insufficient channel permissions', 403);
              }
            }
          } catch {}
        }

        const updateFields: any = {};
        if (body.name !== undefined) updateFields.name = body.name.trim();
        if (body.description !== undefined) updateFields.description = body.description.trim();
        if (body.avatarUrl !== undefined) updateFields.avatar_url = body.avatarUrl;

        if (supabase) {
          try {
            await supabase.from('public_channels').update(updateFields).eq('id', channelId);
          } catch (e) {
            console.warn('[Worker] Channels update error:', e);
          }
        }

        const eventPayload = {
          channelId,
          name: body.name,
          description: body.description,
          avatarUrl: body.avatarUrl,
        };

        await triggerPusherEvent(env, `public-channel-${channelId}`, 'channel-updated', eventPayload);

        return jsonResponse({ status: 'ok' });
      }

      if (pathname === '/channels/posts' && request.method === 'GET') {
        const channelId = url.searchParams.get('channelId');
        if (!channelId) return errorResponse('Missing channelId parameter', 400);

        const supabase = getSupabaseClient(env);
        let posts: any[] = [];
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('channel_posts')
              .select('*')
              .eq('channel_id', channelId)
              .order('created_at', { ascending: true })
              .limit(100);

            if (!error && data) {
              posts = data.map((p: any) => ({
                id: p.id,
                channelId: p.channel_id,
                senderId: p.sender_id || null,
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
            }
          } catch (e) {
            console.warn('[Worker] Fetch channel posts error:', e);
          }
        }

        return jsonResponse({ posts });
      }

      if (pathname === '/channels/post' && request.method === 'POST') {
        const body = (await request.json()) as {
          id?: string;
          channelId: string;
          senderNickname: string;
          senderId?: string;
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

        const supabase = getSupabaseClient(env);
        const senderId = await toUuid(body.senderId);
        if (supabase && senderId) {
          try {
            const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', body.channelId).maybeSingle();
            if (chan && chan.creator_id && chan.creator_id !== senderId) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', body.channelId)
                .eq('user_id', senderId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: only channel owner or admin can post', 403);
              }
            }
          } catch {}
        }

        const postId = body.id || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const createdAt = new Date().toISOString();

        const postRecord = {
          id: postId,
          channelId: body.channelId,
          senderId: senderId || null,
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

        if (supabase) {
          try {
            if (senderId) {
              await supabase.from('profiles').upsert({
                id: senderId,
                username: body.senderNickname,
                updated_at: createdAt,
              });
            }
            await supabase.from('channel_posts').insert({
              id: postId,
              channel_id: body.channelId,
              sender_id: senderId || null,
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

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'new-post', postRecord);

        return jsonResponse({ status: 'ok', post: postRecord });
      }

      if (pathname === '/channels/delete-post' && request.method === 'POST') {
        const body = (await request.json()) as {
          channelId: string;
          postId: string;
          userId?: string;
        };
        if (!body.channelId || !body.postId) return errorResponse('Missing channelId or postId parameter', 400);

        const supabase = getSupabaseClient(env);
        const userId = await toUuid(body.userId);
        if (supabase && userId) {
          try {
            const { data: postData } = await supabase.from('channel_posts').select('sender_id').eq('id', body.postId).maybeSingle();
            const { data: chanData } = await supabase.from('public_channels').select('creator_id').eq('id', body.channelId).maybeSingle();
            const isPostAuthor = postData && postData.sender_id && postData.sender_id === userId;
            const isChanOwner = chanData && chanData.creator_id && chanData.creator_id === userId;
            if (!isPostAuthor && !isChanOwner) {
              const { data: member } = await supabase
                .from('channel_members')
                .select('role')
                .eq('channel_id', body.channelId)
                .eq('user_id', userId)
                .maybeSingle();
              if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                return errorResponse('Forbidden: insufficient delete permissions', 403);
              }
            }
          } catch {}
        }
        if (supabase) {
          try {
            await supabase.from('channel_posts').delete().eq('id', body.postId).eq('channel_id', body.channelId);
          } catch (e) {
            console.warn('[Worker] delete channel post error:', e);
          }
        }

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'delete-post', { channelId: body.channelId, postId: body.postId, targetMessageId: body.postId });

        return jsonResponse({ status: 'ok', channelId: body.channelId, postId: body.postId });
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
          sessionId?: string;
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
            const alreadyPresent = currentUsers.some((u) => u === body.userId || u.toLowerCase() === body.userId.toLowerCase());

            if (
              body.action === 'add' ||
              (!body.action && !alreadyPresent) ||
              (body.action === 'toggle' && !alreadyPresent)
            ) {
              reactions[body.emoji] = [...currentUsers.filter((u) => u !== body.userId && u.toLowerCase() !== body.userId.toLowerCase()), body.userId];
            } else {
              const filtered = currentUsers.filter((u) => u !== body.userId && u.toLowerCase() !== body.userId.toLowerCase());
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

        await triggerPusherEvent(env, `public-channel-${body.channelId}`, 'reaction-updated', {
          postId: body.postId,
          emoji: body.emoji,
          userId: body.userId,
          sessionId: body.sessionId,
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