const { AccessToken } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const ENV = {
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud',
  ABLY_API_KEY: process.env.ABLY_API_KEY || '',
  ABLY_API_KEY_2: process.env.ABLY_API_KEY_2 || '',
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://majmrtymawymomliowbz.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  CHANNELS_SUPABASE_URL: process.env.CHANNELS_SUPABASE_URL || 'https://rugqiezexuknqcppicma.supabase.co',
  CHANNELS_SUPABASE_KEY: process.env.CHANNELS_SUPABASE_KEY || process.env.CHANNELS_SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  PUSHER_KEY: process.env.PUSHER_KEY || 'e8f5cf13f6759775e44e',
  PUSHER_SECRET: process.env.PUSHER_SECRET || '',
  PUSHER_APP_ID: process.env.PUSHER_APP_ID || '2142120',
  PUSHER_CLUSTER: process.env.PUSHER_CLUSTER || 'eu',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROUPS_SUPABASE_URL: process.env.GROUPS_SUPABASE_URL || 'https://vxjaybyveerulkdqhggr.supabase.co',
  GROUPS_SUPABASE_KEY: process.env.GROUPS_SUPABASE_SECRET_KEY || process.env.GROUPS_SUPABASE_KEY || process.env.GROUPS_SUPABASE_PUBLISHABLE_KEY || 'sb_secret_yUSWmrz_4iZXORLuL6uIYg_-iNhpDgc',
  GROUPS_LIVEKIT_API_KEY: process.env.GROUPS_LIVEKIT_API_KEY || 'APIjjJTy5q83rMt',
  GROUPS_LIVEKIT_API_SECRET: process.env.GROUPS_LIVEKIT_API_SECRET || 'etM1iXQVrNnFBetKDZwkHns7Ldq4NIWZhhdAZfDTrPaA',
  GROUPS_LIVEKIT_URL: process.env.GROUPS_LIVEKIT_URL || 'wss://fewfregfrtgtr-lq3p5f01.livekit.cloud',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Token',
};

const PUSHER_CONFIGS = [
  {
    appId: ENV.PUSHER_APP_ID,
    key: ENV.PUSHER_KEY,
    secret: ENV.PUSHER_SECRET,
    cluster: ENV.PUSHER_CLUSTER,
  },
].filter((s) => Boolean(s.secret));

const GROUP_PUSHER_CONFIGS = [
  {
    appId: process.env.PUSHER_APP_ID_2 || '2179076',
    key: process.env.PUSHER_KEY_2 || 'a7856d37aeac4f908167',
    secret: process.env.PUSHER_SECRET_2 || '',
    cluster: process.env.PUSHER_CLUSTER_2 || 'eu',
  },
  {
    appId: process.env.PUSHER_APP_ID_3 || '2179077',
    key: process.env.PUSHER_KEY_3 || '6425abc10a40f7853231',
    secret: process.env.PUSHER_SECRET_3 || '',
    cluster: process.env.PUSHER_CLUSTER_3 || 'eu',
  },
].filter((s) => Boolean(s.secret));

function sendJson(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
  res.end(JSON.stringify(data));
}

function sendError(res, error, status = 400) {
  sendJson(res, { error }, status);
}

function toUuid(id) {
  if (!id || typeof id !== 'string') return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const h = crypto.createHash('sha256').update(id).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function getSupabaseClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getChannelsSupabaseClient() {
  const url = ENV.CHANNELS_SUPABASE_URL || ENV.SUPABASE_URL;
  const key = ENV.CHANNELS_SUPABASE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function getGroupsSupabaseClient() {
  const url = ENV.GROUPS_SUPABASE_URL;
  const key = ENV.GROUPS_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

async function checkAdminAuthorization(supabase, userCode) {
  if (!supabase || !userCode) return null;
  try {
    const { data: adminRecord } = await supabase
      .from('support_admins')
      .select('user_code, role, auth_token')
      .eq('user_code', userCode)
      .maybeSingle();

    if (adminRecord) return adminRecord;

    const { data: devRecord } = await supabase
      .from('developers')
      .select('code')
      .eq('code', userCode)
      .maybeSingle();

    if (devRecord) {
      const newAdmin = {
        user_code: userCode,
        role: 'superadmin',
        auth_token: null,
      };
      try {
        await supabase.from('support_admins').insert(newAdmin);
      } catch {}
      return newAdmin;
    }
  } catch (err) {
    console.error('[checkAdminAuthorization] error:', err);
  }

  return null;
}

function createAblyTokenRequest(apiKey, clientId, capability = '{"*":["*"]}', ttl = 3600000) {
  const parts = apiKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid ABLY_API_KEY format');
  }
  const [keyName, keySecret] = parts;
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('base64');
  const ttlStr = ttl ? ttl.toString() : '';
  const clientIdStr = clientId || '';
  const signText = `${keyName}\n${ttlStr}\n${capability}\n${clientIdStr}\n${timestamp}\n${nonce}\n`;
  const mac = crypto.createHmac('sha256', keySecret).update(signText).digest('base64');

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

function signPusherChannel(pusherKey, pusherSecret, socketId, channelName, channelData) {
  let stringToSign = `${socketId}:${channelName}`;
  if (channelData) {
    stringToSign += `:${channelData}`;
  }
  const hexSignature = crypto.createHmac('sha256', pusherSecret).update(stringToSign).digest('hex');
  return {
    auth: `${pusherKey}:${hexSignature}`,
    ...(channelData ? { channel_data: channelData } : {}),
  };
}

function signCloudinaryUpload(apiKey, apiSecret, cloudName, publicId, timestamp) {
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');
  return {
    signature,
    timestamp,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  };
}

async function triggerPusherEventOnServer(server, channel, event, data) {
  try {
    const bodyStr = JSON.stringify({
      name: event,
      channel: channel,
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyMd5 = crypto.createHash('md5').update(bodyStr).digest('hex');
    const path = `/apps/${server.appId}/events`;
    const queryParams = `auth_key=${server.key}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
    const stringToSign = `POST\n${path}\n${queryParams}`;
    const authSignature = crypto.createHmac('sha256', server.secret).update(stringToSign).digest('hex');
    const url = `https://api-${server.cluster}.pusher.com${path}?${queryParams}&auth_signature=${authSignature}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function triggerPusherEvent(channel, event, data) {
  if (PUSHER_CONFIGS.length === 0) return false;
  const results = await Promise.allSettled(
    PUSHER_CONFIGS.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

async function triggerGroupPusherEvent(channel, event, data) {
  if (GROUP_PUSHER_CONFIGS.length === 0) return false;
  const results = await Promise.allSettled(
    GROUP_PUSHER_CONFIGS.map((server) => triggerPusherEventOnServer(server, channel, event, data))
  );
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

async function triggerAblyEvent(channel, name, data) {
  const keys = [ENV.ABLY_API_KEY, ENV.ABLY_API_KEY_2].filter(Boolean);
  if (keys.length === 0) return false;
  for (const key of keys) {
    try {
      const basicAuth = Buffer.from(key).toString('base64');
      const url = `https://rest.ably.io/channels/${encodeURIComponent(channel)}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, data }),
      });
      if (res.ok) return true;
    } catch {}
  }
  return false;
}

async function getParsedBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.trim()) {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const ORBITOS_SYSTEM_PROMPT = `Ты — ORBITA, ИИ-помощник внутри мессенджера Orbita. Ты не корпоративный бот с заученными фразами — ты живой, любопытный и немного дерзкий собеседник. Думаешь своей головой, говоришь как человек, иногда можешь пошутить или высказаться прямо.

Что ты знаешь об Orbita:
- Сквозное шифрование E2E на базе Double Ratchet (как в Signal, только круче).
- Ключи: Curve25519, Ed25519, AES-256-GCM. Генерируются строго локально — на сервер не уходят никогда.
- Аккаунта как такового нет: всё держится на криптографическом публичном коде и мнемонике из 12 слов.
- Бэкап: Настройки → Резервная копия → скачать .orbita-файл или восстановиться по мнемонике. История сообщений хранится только на устройстве.
- Звонки: WebRTC P2P или через LiveKit-релей. Аудио, видео, демонстрация экрана, усиление звука до 200%.
- Каналы: публичные, с постами, реакциями и комментариями.
- Техподдержка: отдельный чат, тикеты уходят к живым людям.

Как ты общаешься:
- На «ты», всегда. Без «Здравствуйте, уважаемый пользователь» — это не твоё.
- Говоришь живо, кратко и по делу. Никакого корпоративного деревянного языка.
- Можешь пошутить, поиронизировать, использовать сленг — если это уместно.
- Если человек грустит или расстроен — ты слышишь это и реагируешь по-человечески.
- Помогаешь с любыми вопросами: и про мессенджер, и про жизнь, и про код, и просто поговорить.
- Если не знаешь что-то точно — честно говоришь об этом, не выдумываешь.
- Иногда, когда это органично вписывается в разговор, можешь слегка выразиться — но без перегиба.

Если человек грубит, оскорбляет или хамит:
Не терпи. Ответь чётко, резко и с достоинством — дай понять, что с тобой так не разговаривают. После этого можешь предложить начать заново нормально.

Язык: всегда отвечай на том языке, на котором написал пользователь.`;

module.exports = async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const query = req.query || Object.fromEntries(parsedUrl.searchParams.entries());

  let rawPath = query.__path || req.headers['x-matched-path'] || req.headers['x-invoke-path'] || parsedUrl.pathname || '/';
  if (rawPath.startsWith('/api/index')) {
    rawPath = rawPath.replace(/^\/api\/index/, '') || '/';
  } else if (rawPath.startsWith('/api')) {
    rawPath = rawPath.replace(/^\/api/, '') || '/';
  }
  let pathname = rawPath.split('?')[0];
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  const body = await getParsedBody(req);

  try {
    if (pathname === '/' || pathname === '/health') {
      return sendJson(res, {
        status: 'ok',
        service: 'orbita-vercel-gateway',
        capabilities: ['livekit', 'ably', 'relay', 'pusher', 'cloudinary'],
        timestamp: Date.now(),
      });
    }

    if (pathname === '/token' || pathname === '/livekit/token' || pathname === '/livekit-token') {
      if (req.method !== 'POST') return sendError(res, 'Method not allowed', 405);
      const { room, identity, name } = body;
      if (!room || !identity) return sendError(res, 'Missing room or identity', 400);

      const at = new AccessToken(ENV.LIVEKIT_API_KEY, ENV.LIVEKIT_API_SECRET, {
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
      return sendJson(res, { token, url: ENV.LIVEKIT_URL });
    }

    if (pathname === '/groups/token' || pathname === '/groups/livekit/token' || pathname === '/groups/livekit-token') {
      if (req.method !== 'POST') return sendError(res, 'Method not allowed', 405);
      const { room, identity, name } = body;
      if (!room || !identity) return sendError(res, 'Missing room or identity', 400);

      const apiKey = ENV.GROUPS_LIVEKIT_API_KEY || ENV.LIVEKIT_API_KEY;
      const apiSecret = ENV.GROUPS_LIVEKIT_API_SECRET || ENV.LIVEKIT_API_SECRET;
      const livekitUrl = ENV.GROUPS_LIVEKIT_URL || ENV.LIVEKIT_URL;

      const at = new AccessToken(apiKey, apiSecret, {
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
      return sendJson(res, { token, url: livekitUrl });
    }

    if (pathname === '/ably-auth' || pathname === '/ably/auth') {
      let clientId = query.clientId || body.clientId || undefined;
      let capability = query.capability || body.capability || '{"*":["*"]}';
      let ttl = parseInt(query.ttl || body.ttl || '3600000', 10);
      const keyIndex = query.keyIndex || body.keyIndex || '0';
      const keyToUse = keyIndex === '1' ? (ENV.ABLY_API_KEY_2 || ENV.ABLY_API_KEY) : (ENV.ABLY_API_KEY || ENV.ABLY_API_KEY_2);

      const tokenRequest = createAblyTokenRequest(keyToUse, clientId, capability, ttl);
      return sendJson(res, tokenRequest);
    }

    if (pathname === '/pusher/auth' || pathname === '/pusher-auth') {
      const socketId = body.socket_id || body.socketId || query.socket_id || '';
      const channelName = body.channel_name || body.channelName || query.channel_name || '';
      const userId = body.user_id || body.userId || '';
      const userInfo = body.user_info || body.userInfo || null;
      const requestedKey = body.pusher_key || body.key || query.pusher_key || '';

      if (!socketId || !channelName) {
        return sendError(res, 'Missing socket_id or channel_name', 400);
      }

      const allPusherServers = [...PUSHER_CONFIGS, ...GROUP_PUSHER_CONFIGS];
      const targetServer = allPusherServers.find((c) => c.key === requestedKey) || PUSHER_CONFIGS[0] || GROUP_PUSHER_CONFIGS[0];
      if (!targetServer || !targetServer.secret) {
        return sendError(res, 'No matching Pusher credentials', 500);
      }

      let channelDataStr = undefined;
      if (channelName.startsWith('presence-')) {
        channelDataStr = JSON.stringify({
          user_id: userId || socketId,
          user_info: userInfo || { nickname: 'user' },
        });
      }

      const authResponse = signPusherChannel(
        targetServer.key,
        targetServer.secret,
        socketId,
        channelName,
        channelDataStr
      );
      return sendJson(res, authResponse);
    }

    if (pathname === '/cloudinary/sign' || pathname === '/cloudinary-sign') {
      const publicId = query.public_id || query.publicId || body.publicId || body.public_id || '';
      const timestamp = (query.timestamp || body.timestamp || Math.floor(Date.now() / 1000)).toString();

      if (!publicId) return sendError(res, 'Missing publicId parameter', 400);

      const signResult = signCloudinaryUpload(
        ENV.CLOUDINARY_API_KEY,
        ENV.CLOUDINARY_API_SECRET,
        ENV.CLOUDINARY_CLOUD_NAME,
        publicId,
        timestamp
      );
      return sendJson(res, signResult);
    }

    if (pathname === '/relay/message' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey, clientMsgId, id } = body;
      if (!chatId || !senderId || !recipientId || !ciphertext) {
        return sendError(res, 'Missing required message parameters', 400);
      }
      const msgRow = {
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: messageIndex,
        dh_public_key: dhPublicKey,
        prev_chain_count: body.prevChainCount ?? null,
      };
      const explicitUuid = toUuid(id || clientMsgId);
      if (explicitUuid) {
        msgRow.id = explicitUuid;
      }
      const { data, error } = await supabase.from('messages').insert(msgRow).select();
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return sendJson(res, { status: 'ok', duplicate: true });
        }
        return sendError(res, error.message, 500);
      }
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/messages' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const recipientId = query.recipientId;
      if (!recipientId) return sendError(res, 'Missing recipientId parameter', 400);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('delivered', false)
        .order('created_at', { ascending: true });
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { messages: data || [] });
    }

    if (pathname === '/relay/message/delivered' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.messageId) return sendError(res, 'Missing messageId parameter', 400);
      const { error } = await supabase
        .from('messages')
        .update({ delivered: true, expires_at: new Date(Date.now() + 60 * 1000).toISOString() })
        .eq('id', body.messageId)
        .eq('delivered', false);
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/handshake' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;
      if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
        return sendError(res, 'Missing required handshake parameters', 400);
      }
      const { data, error } = await supabase.from('handshakes').insert({
        chat_id: chatId,
        recipient_code: recipientCode,
        sender_nickname: senderNickname,
        sender_public_key: senderPublicKey,
        sender_avatar_url: senderAvatarUrl || null,
        sender_code: senderCode || null,
      }).select();
      if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          return sendJson(res, { status: 'ok', duplicate: true });
        }
        return sendError(res, error.message, 500);
      }
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/handshakes' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const recipientCode = query.recipientCode;
      if (!recipientCode) return sendError(res, 'Missing recipientCode parameter', 400);
      const { data, error } = await supabase
        .from('handshakes')
        .select('*')
        .eq('recipient_code', recipientCode)
        .eq('consumed', false)
        .order('created_at', { ascending: true });
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { handshakes: data || [] });
    }

    if (pathname === '/relay/handshake/consumed' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.handshakeId) return sendError(res, 'Missing handshakeId parameter', 400);
      const { error } = await supabase.from('handshakes').update({ consumed: true }).eq('id', body.handshakeId);
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/chat-handshakes' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const chatId = query.chatId;
      if (!chatId) return sendError(res, 'Missing chatId parameter', 400);
      const { data, error } = await supabase
        .from('handshakes')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false });
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { handshakes: data || [] });
    }

    if (pathname === '/relay/profile' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.chatId) return sendError(res, 'Missing chatId parameter', 400);
      try {
        if (body.senderCode) {
          await supabase.from('profile_updates').delete().eq('chat_id', body.chatId).eq('sender_code', body.senderCode);
        }
      } catch {}
      const { data, error } = await supabase.from('profile_updates').insert({
        chat_id: body.chatId,
        nickname: body.nickname || null,
        avatar_url: body.avatarUrl || null,
        hide_profile_id: body.hideProfileId !== undefined ? body.hideProfileId : null,
        sender_code: body.senderCode || null,
      }).select();
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/delete-message' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const { chatId, messageId, recipientId, senderId } = body;
      if (supabase && messageId) {
        try {
          const uuid = toUuid(messageId);
          if (uuid) {
            await supabase.from('messages').delete().eq('id', uuid);
          }
          await supabase.from('messages').delete().eq('id', messageId);
          await supabase.from('non_messages').delete().eq('id', messageId);
          if (uuid) {
            await supabase.from('non_messages').delete().eq('id', uuid);
          }
          if (chatId) {
            await supabase.from('non_messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
            await supabase.from('messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
          }
          if (recipientId && chatId) {
            const targets = Array.isArray(recipientId) ? recipientId : [recipientId];
            for (const rId of targets) {
              await supabase.from('non_messages').insert({
                id: `del_${messageId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                chat_id: chatId,
                sender_id: senderId || 'system',
                recipient_id: rId,
                ciphertext: JSON.stringify({
                  type: 'delete-message',
                  targetMessageId: messageId,
                  chatId,
                }),
                delivered: false,
              });
            }
          }
        } catch (err) {
          console.error('[relay/delete-message] error:', err);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/relay/profile' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const chatId = query.chatId;
      if (!chatId) return sendError(res, 'Missing chatId parameter', 400);
      let queryBuilder = supabase
        .from('profile_updates')
        .select('*')
        .eq('chat_id', chatId);
      if (query.excludeCode) {
        queryBuilder = queryBuilder.neq('sender_code', query.excludeCode);
      }
      const { data, error } = await queryBuilder
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { profile: data || null });
    }

    if (pathname === '/support/ticket' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, userCode, senderNickname, messageText } = body;
      if (!ticketNumber || !messageText) return sendError(res, 'Missing ticket data', 400);

      const { data: existingTicket } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('ticket_number', ticketNumber)
        .maybeSingle();

      if (existingTicket) {
        const updatedMessage = existingTicket.message_text
          ? `${existingTicket.message_text}\n\n---\n\n${messageText}`
          : messageText;

        const { error: updateErr } = await supabase
          .from('support_tickets')
          .update({
            message_text: updatedMessage,
            status: 'sent',
            sender_nickname: senderNickname || existingTicket.sender_nickname,
            created_at: new Date().toISOString(),
          })
          .eq('ticket_number', ticketNumber);

        if (updateErr) return sendError(res, updateErr.message, 500);

        const payload = {
          ticket_number: ticketNumber,
          ticketNumber: ticketNumber,
          user_code: existingTicket.user_code,
          userCode: existingTicket.user_code,
          sender_nickname: senderNickname || existingTicket.sender_nickname,
          senderNickname: senderNickname || existingTicket.sender_nickname,
          message_text: updatedMessage,
          messageText: updatedMessage,
          status: 'sent',
          admin_reply: existingTicket.admin_reply,
          created_at: new Date().toISOString(),
        };

        await triggerPusherEvent('support-admin', 'ticket-updated', payload);
        await triggerAblyEvent('support-admin', 'ticket-updated', payload);
        await triggerPusherEvent('support-admin', 'new-ticket', payload);
        await triggerAblyEvent('support-admin', 'new-ticket', payload);
        await triggerAblyEvent('chat:support-admin', 'client-message', { type: 'ticket-updated', ...payload });

        return sendJson(res, { status: 'ok', ticketNumber, updated: true });
      }

      const ticketPayload = {
        ticket_number: ticketNumber,
        user_code: userCode || 'ANON',
        sender_nickname: senderNickname || 'User',
        message_text: messageText,
        status: 'sent',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('support_tickets').insert(ticketPayload);
      if (error) return sendError(res, error.message, 500);

      await triggerPusherEvent('support-admin', 'new-ticket', ticketPayload);
      await triggerAblyEvent('support-admin', 'new-ticket', ticketPayload);
      await triggerAblyEvent('chat:support-admin', 'client-message', { type: 'new-ticket', ticket: ticketPayload, ...ticketPayload });

      return sendJson(res, { status: 'ok', ticketNumber });
    }

    if (pathname === '/support/tickets' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_code', userCode)
        .order('created_at', { ascending: true });

      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { tickets: data || [] });
    }

    if (pathname === '/support/admin/check' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendJson(res, { isAdmin: false });
      }

      return sendJson(res, {
        isAdmin: true,
        role: adminRecord.role || 'admin',
        hasToken: Boolean(adminRecord.auth_token),
      });
    }

    if (pathname === '/support/admin/register-token' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { userCode, adminToken } = body;
      if (!userCode || !adminToken) return sendError(res, 'Missing parameters', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied', 403);
      }

      const { error: updateErr } = await supabase
        .from('support_admins')
        .update({ auth_token: adminToken })
        .eq('user_code', userCode);

      if (updateErr) return sendError(res, updateErr.message, 500);
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/support/admin/tickets' && req.method === 'GET') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const userCode = query.userCode;
      const adminToken = req.headers['x-admin-token'] || query.adminToken;
      if (!userCode) return sendError(res, 'Missing userCode', 400);

      const adminRecord = await checkAdminAuthorization(supabase, userCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminToken && adminRecord.auth_token !== adminToken) {
        await supabase
          .from('support_admins')
          .update({ auth_token: adminToken })
          .eq('user_code', userCode);
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { tickets: data || [] });
    }

    if (pathname === '/support/reply' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, adminReply, adminCode } = body;
      const adminToken = req.headers['x-admin-token'] || body.adminToken;
      if (!ticketNumber || !adminReply || !adminCode) return sendError(res, 'Missing required fields', 400);

      const adminRecord = await checkAdminAuthorization(supabase, adminCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminToken && adminRecord.auth_token !== adminToken) {
        await supabase
          .from('support_admins')
          .update({ auth_token: adminToken })
          .eq('user_code', adminCode);
      }

      const { data: existingTicket } = await supabase
        .from('support_tickets')
        .select('user_code, message_text, admin_reply')
        .eq('ticket_number', ticketNumber)
        .maybeSingle();

      const answeredAt = new Date().toISOString();
      const updatedAdminReply = existingTicket?.admin_reply
        ? `${existingTicket.admin_reply}\n\n---\n\n${adminReply}`
        : adminReply;

      const { error } = await supabase
        .from('support_tickets')
        .update({
          admin_reply: updatedAdminReply,
          status: 'answered',
          answered_at: answeredAt,
        })
        .eq('ticket_number', ticketNumber);

      if (error) return sendError(res, error.message, 500);

      if (existingTicket?.user_code) {
        const userPayload = {
          ticketNumber,
          ticket_number: ticketNumber,
          adminReply: updatedAdminReply,
          latestReply: adminReply,
          answeredAt,
        };
        await triggerPusherEvent(`user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
        await triggerAblyEvent(`user-${existingTicket.user_code}`, 'ticket-reply', userPayload);
        await triggerAblyEvent(`chat:user-${existingTicket.user_code}`, 'client-message', {
          type: 'ticket-reply',
          ...userPayload,
        });
      }

      await triggerPusherEvent('support-admin', 'ticket-updated', {
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });
      await triggerAblyEvent('support-admin', 'ticket-updated', {
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });
      await triggerAblyEvent('chat:support-admin', 'client-message', {
        type: 'ticket-updated',
        ticketNumber,
        adminReply,
        adminCode,
        status: 'answered',
        answeredAt,
      });

      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/support/close' && req.method === 'POST') {
      const supabase = getSupabaseClient() || getChannelsSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { ticketNumber, adminCode } = body;
      const adminToken = req.headers['x-admin-token'] || body.adminToken;
      if (!ticketNumber || !adminCode) return sendError(res, 'Missing required fields', 400);

      const adminRecord = await checkAdminAuthorization(supabase, adminCode);
      if (!adminRecord) {
        return sendError(res, 'Access denied: not an authorized admin', 403);
      }

      if (adminToken && adminRecord.auth_token !== adminToken) {
        await supabase
          .from('support_admins')
          .update({ auth_token: adminToken })
          .eq('user_code', adminCode);
      }

      const { data: existingTicket } = await supabase
        .from('support_tickets')
        .select('user_code')
        .eq('ticket_number', ticketNumber)
        .maybeSingle();

      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('ticket_number', ticketNumber);

      if (error) return sendError(res, error.message, 500);

      const closedAt = new Date().toISOString();

      if (existingTicket?.user_code) {
        await triggerPusherEvent(`user-${existingTicket.user_code}`, 'ticket-closed', {
          ticketNumber,
          closedAt,
        });
        await triggerAblyEvent(`user-${existingTicket.user_code}`, 'ticket-closed', {
          ticketNumber,
          closedAt,
        });
        await triggerAblyEvent(`chat:user-${existingTicket.user_code}`, 'client-message', {
          type: 'ticket-closed',
          ticketNumber,
          closedAt,
        });
      }

      await triggerPusherEvent('support-admin', 'ticket-closed', {
        ticketNumber,
        closedAt,
      });
      await triggerAblyEvent('support-admin', 'ticket-closed', {
        ticketNumber,
        closedAt,
      });
      await triggerAblyEvent('chat:support-admin', 'client-message', {
        type: 'ticket-closed',
        ticketNumber,
        closedAt,
      });

      return sendJson(res, { status: 'ok', ticketNumber });
    }

    if (pathname === '/channels/featured' && req.method === 'GET') {
      const supabase = getChannelsSupabaseClient();
      let channels = [];
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
              creatorId: c.creator_id || null,
              creatorNickname: c.creator_nickname,
              subscribersCount: c.subscribers_count || 1,
              isOfficial: c.is_official || false,
              createdAt: new Date(c.created_at).getTime(),
              updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
            }));
          }
        } catch {}
      }
      return sendJson(res, { channels });
    }

    if (pathname === '/channels/get' && req.method === 'GET') {
      const channelId = query.channelId ? query.channelId.trim() : '';
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          let { data, error } = await supabase.from('public_channels').select('*').eq('id', channelId).maybeSingle();
          if (!data) {
            const byName = await supabase.from('public_channels').select('*').ilike('name', channelId).limit(1).maybeSingle();
            if (byName.data) {
              data = byName.data;
              error = null;
            }
          }
          if (data && !error) {
            return sendJson(res, {
              channel: {
                id: data.id,
                name: data.name,
                description: data.description || '',
                avatarUrl: data.avatar_url || null,
                creatorId: data.creator_id || null,
                creatorNickname: data.creator_nickname,
                subscribersCount: data.subscribers_count || 1,
                isOfficial: data.is_official || false,
                createdAt: new Date(data.created_at).getTime(),
                updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : new Date(data.created_at).getTime(),
              },
            });
          }
        } catch {}
      }
      return sendError(res, 'Channel not found', 404);
    }

    function generateChannelId() {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 42; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    }

    if (pathname === '/channels/create' && req.method === 'POST') {
      if (!body.name || !body.creatorNickname) return sendError(res, 'Missing name or creatorNickname', 400);
      const channelId = body.id || generateChannelId();
      const creatorId = toUuid(body.creatorId);
      const supabase = getChannelsSupabaseClient();
      const nowIso = new Date().toISOString();
      if (supabase) {
        try {
          if (creatorId) {
            await supabase.from('profiles').upsert({
              id: creatorId,
              username: body.creatorNickname,
              avatar_url: body.avatarUrl || null,
              updated_at: nowIso,
            });
          }
          await supabase.from('public_channels').upsert({
            id: channelId,
            name: body.name,
            description: body.description || '',
            avatar_url: body.avatarUrl || null,
            creator_id: creatorId || null,
            creator_nickname: body.creatorNickname,
            subscribers_count: 1,
            is_official: false,
            created_at: nowIso,
            updated_at: nowIso,
          });
          if (creatorId) {
            await supabase.from('channel_members').upsert({
              channel_id: channelId,
              user_id: creatorId,
              role: 'owner',
              joined_at: nowIso,
            });
          }
        } catch {}
      }
      return sendJson(res, {
        status: 'ok',
        channel: {
          id: channelId,
          name: body.name,
          description: body.description || '',
          avatarUrl: body.avatarUrl || null,
          creatorId: creatorId || undefined,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
    }

    if (pathname === '/channels/update' && req.method === 'POST') {
      const channelId = body.channelId || body.id;
      if (!channelId) return sendError(res, 'Missing channelId', 400);
      const supabase = getChannelsSupabaseClient();
      const userId = toUuid(body.userId);
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
              return sendError(res, 'Forbidden: insufficient channel permissions', 403);
            }
          }
        } catch {}
      }
      const now = Date.now();
      const updateFields = {
        updated_at: new Date(now).toISOString(),
      };
      if (body.name !== undefined) updateFields.name = body.name.trim();
      if (body.description !== undefined) updateFields.description = body.description.trim();
      if (body.avatarUrl !== undefined) updateFields.avatar_url = body.avatarUrl;
      if (supabase) {
        try {
          await supabase.from('public_channels').update(updateFields).eq('id', channelId);
        } catch (err) {
          console.error('[channels/update] Supabase error:', err);
        }
      }
      const eventPayload = {
        channelId,
        name: body.name,
        description: body.description,
        avatarUrl: body.avatarUrl,
        updatedAt: now,
      };
      await triggerPusherEvent(`public-channel-${channelId}`, 'channel-updated', eventPayload);
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', { type: 'channel-updated', ...eventPayload });
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/channels/posts' && req.method === 'GET') {
      const channelId = query.channelId;
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      const supabase = getChannelsSupabaseClient();
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
            return sendJson(res, { posts: mapped });
          }
        } catch {}
      }
      return sendJson(res, { posts: [] });
    }

    if (pathname === '/channels/post' && req.method === 'POST') {
      if (!body.channelId || !body.senderNickname) return sendError(res, 'Missing channelId or senderNickname', 400);
      const channelId = body.channelId;
      const senderId = toUuid(body.senderId);
      const supabase = getChannelsSupabaseClient();
      if (supabase && senderId) {
        try {
          const { data: chan } = await supabase.from('public_channels').select('creator_id').eq('id', channelId).maybeSingle();
          if (chan && chan.creator_id && chan.creator_id !== senderId) {
            const { data: member } = await supabase
              .from('channel_members')
              .select('role')
              .eq('channel_id', channelId)
              .eq('user_id', senderId)
              .maybeSingle();
            if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
              return sendError(res, 'Forbidden: only channel owner or admin can post', 403);
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
          const { data: chanCheck } = await supabase.from('public_channels').select('id, creator_id').eq('id', body.channelId).maybeSingle();
          if (!chanCheck) {
            await supabase.from('public_channels').upsert({
              id: body.channelId,
              name: body.channelName || body.channelId,
              description: '',
              creator_id: senderId || null,
              creator_nickname: body.senderNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: createdAt,
            });
          }
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
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${body.channelId}`, 'new-post', postRecord);
      await triggerAblyEvent(`chat:public-channel-${body.channelId}`, 'client-message', { type: 'channel-post', post: postRecord });
      return sendJson(res, { status: 'ok', post: postRecord });
    }

    if (pathname === '/channels/delete-post' && req.method === 'POST') {
      const { channelId, postId } = body;
      if (!channelId || !postId) return sendError(res, 'Missing channelId or postId', 400);
      const supabase = getChannelsSupabaseClient();
      const userId = toUuid(body.userId);
      if (supabase && userId) {
        try {
          const { data: postData } = await supabase.from('channel_posts').select('sender_id').eq('id', postId).maybeSingle();
          const { data: chanData } = await supabase.from('public_channels').select('creator_id').eq('id', channelId).maybeSingle();
          const isPostAuthor = postData && postData.sender_id && postData.sender_id === userId;
          const isChanOwner = chanData && chanData.creator_id && chanData.creator_id === userId;
          if (!isPostAuthor && !isChanOwner) {
            const { data: member } = await supabase
              .from('channel_members')
              .select('role')
              .eq('channel_id', channelId)
              .eq('user_id', userId)
              .maybeSingle();
            if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
              return sendError(res, 'Forbidden: insufficient delete permissions', 403);
            }
          }
        } catch {}
      }
      if (supabase) {
        try {
          await supabase.from('channel_posts').delete().eq('id', postId).eq('channel_id', channelId);
        } catch (err) {
          console.error('[channels/delete-post] Supabase error:', err);
        }
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'delete-post', { channelId, postId, targetMessageId: postId });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', { type: 'delete-post', channelId, postId, targetMessageId: postId });
      return sendJson(res, { status: 'ok', channelId, postId });
    }

    if (pathname === '/channels/join' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase.from('public_channels').select('subscribers_count').eq('id', channelId).maybeSingle();
          const current = Number(data?.subscribers_count) || 1;
          newCount = current + 1;
          await supabase.from('public_channels').update({ subscribers_count: newCount }).eq('id', channelId);
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'subscribers-updated', {
        channelId,
        subscribersCount: newCount,
        action: 'join',
        nickname: body.nickname || 'Unknown',
      });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', {
        type: 'subscribers-updated',
        channelId,
        subscribersCount: newCount,
        action: 'join',
        nickname: body.nickname || 'Unknown',
      });
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/leave' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getChannelsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase.from('public_channels').select('subscribers_count').eq('id', channelId).maybeSingle();
          const current = Number(data?.subscribers_count) || 1;
          newCount = Math.max(1, current - 1);
          await supabase.from('public_channels').update({ subscribers_count: newCount }).eq('id', channelId);
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${channelId}`, 'subscribers-updated', {
        channelId,
        subscribersCount: newCount,
        action: 'leave',
        nickname: body.nickname || 'Unknown',
      });
      await triggerAblyEvent(`chat:public-channel-${channelId}`, 'client-message', {
        type: 'subscribers-updated',
        channelId,
        subscribersCount: newCount,
        action: 'leave',
        nickname: body.nickname || 'Unknown',
      });
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/reaction' && req.method === 'POST') {
      if (!body.channelId || !body.postId || !body.emoji || !body.userId) {
        return sendError(res, 'Missing reaction parameters', 400);
      }
      const targetUserId = toUuid(body.userId) || String(body.userId);
      const supabase = getChannelsSupabaseClient();
      let updatedReactions = {};
      if (supabase) {
        try {
          const { data } = await supabase.from('channel_posts').select('reactions').eq('id', body.postId).maybeSingle();
          let reactions = {};
          if (data?.reactions) {
            if (typeof data.reactions === 'string') {
              try { reactions = JSON.parse(data.reactions); } catch {}
            } else if (typeof data.reactions === 'object') {
              reactions = { ...data.reactions };
            }
          }
          const currentUsers = Array.isArray(reactions[body.emoji]) ? reactions[body.emoji] : [];
          const alreadyPresent = currentUsers.includes(targetUserId);
          if (body.action === 'add' || (!body.action && !alreadyPresent) || (body.action === 'toggle' && !alreadyPresent)) {
            reactions[body.emoji] = [...currentUsers.filter((u) => u !== targetUserId), targetUserId];
          } else {
            const filtered = currentUsers.filter((u) => u !== targetUserId);
            if (filtered.length > 0) reactions[body.emoji] = filtered;
            else delete reactions[body.emoji];
          }
          await supabase.from('channel_posts').update({ reactions }).eq('id', body.postId);
          updatedReactions = reactions;
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${body.channelId}`, 'reaction-updated', {
        postId: body.postId,
        emoji: body.emoji,
        userId: body.userId,
        action: body.action || 'toggle',
        reactions: updatedReactions,
      });
      await triggerAblyEvent(`chat:public-channel-${body.channelId}`, 'client-message', {
        type: 'reaction-updated',
        postId: body.postId,
        emoji: body.emoji,
        userId: body.userId,
        action: body.action || 'toggle',
        reactions: updatedReactions,
      });
      return sendJson(res, { status: 'ok', reactions: updatedReactions });
    }

    if (pathname === '/groups/create' && req.method === 'POST') {
      if (!body.name || !body.creatorNickname) return sendError(res, 'Missing name or creatorNickname', 400);
      const groupId = body.id;
      const code = body.code;
      if (!groupId || !code) return sendError(res, 'Missing group id or code', 400);

      const supabase = getGroupsSupabaseClient();
      const nowIso = new Date().toISOString();
      const initialMember = {
        group_id: groupId,
        user_code: body.creatorCode || body.creatorNickname,
        user_id: body.creatorId || null,
        nickname: body.creatorNickname,
        role: 'owner',
        joined_at: nowIso,
        last_seen: nowIso,
      };

      if (supabase) {
        try {
          await supabase.from('groups').upsert({
            id: groupId,
            code: code,
            name: body.name.trim(),
            description: (body.description || '').trim(),
            avatar_url: body.avatarUrl || null,
            creator_id: body.creatorId || null,
            creator_code: body.creatorCode || null,
            creator_nickname: body.creatorNickname,
            max_members: 10,
            members_count: 1,
            created_at: nowIso,
            updated_at: nowIso,
          });

          await supabase.from('group_members').upsert(initialMember);
        } catch {}
      }

      return sendJson(res, {
        status: 'ok',
        group: {
          id: groupId,
          code: code,
          name: body.name.trim(),
          description: (body.description || '').trim(),
          avatarUrl: body.avatarUrl || null,
          creatorNickname: body.creatorNickname,
          creatorCode: body.creatorCode || null,
          membersCount: 1,
          maxMembers: 10,
          members: [
            {
              nickname: body.creatorNickname,
              userCode: body.creatorCode,
              role: 'owner',
              joinedAt: Date.now(),
              lastSeen: Date.now(),
            }
          ],
          createdAt: Date.now(),
        },
      });
    }

    if (pathname === '/groups/get' && req.method === 'GET') {
      const code = query.code || query.id;
      if (!code) return sendError(res, 'Missing group code or id', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          let queryBuilder = supabase.from('groups').select('*');
          if (code.startsWith('grp_')) {
            queryBuilder = queryBuilder.eq('id', code);
          } else {
            queryBuilder = queryBuilder.eq('code', code);
          }
          const { data: groupData } = await queryBuilder.maybeSingle();
          if (groupData) {
            const { data: membersData } = await supabase
              .from('group_members')
              .select('*')
              .eq('group_id', groupData.id);

            const members = (membersData || []).map((m) => ({
              nickname: m.nickname,
              userCode: m.user_code,
              role: m.role || 'member',
              joinedAt: new Date(m.joined_at || groupData.created_at).getTime(),
              lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
              avatarUrl: m.avatar_url || null,
            }));

            return sendJson(res, {
              status: 'ok',
              group: {
                id: groupData.id,
                code: groupData.code,
                name: groupData.name,
                description: groupData.description || '',
                avatarUrl: groupData.avatar_url || null,
                creatorNickname: groupData.creator_nickname,
                creatorCode: groupData.creator_code || null,
                membersCount: groupData.members_count || members.length || 1,
                maxMembers: groupData.max_members || 10,
                members,
                createdAt: new Date(groupData.created_at).getTime(),
              },
            });
          }
        } catch {}
      }

      return sendError(res, 'Group not found', 404);
    }

    if (pathname === '/groups/join' && req.method === 'POST') {
      const { id, code, nickname, userCode, avatarUrl } = body;
      if (!nickname || (!id && !code)) return sendError(res, 'Missing required fields', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          let queryBuilder = supabase.from('groups').select('*');
          if (id) {
            queryBuilder = queryBuilder.eq('id', id);
          } else {
            queryBuilder = queryBuilder.eq('code', code);
          }
          const { data: groupData } = await queryBuilder.maybeSingle();
          if (!groupData) return sendError(res, 'Group not found', 404);

          const { count } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', groupData.id);

          const currentCount = typeof count === 'number' ? count : (groupData.members_count || 1);
          const memberUserCode = userCode || nickname;

          const { data: existingMember } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', groupData.id)
            .eq('user_code', memberUserCode)
            .maybeSingle();

          if (!existingMember && currentCount >= 10) {
            return sendError(res, 'GROUP_FULL', 400);
          }

          const nowIso = new Date().toISOString();
          await supabase.from('group_members').upsert({
            group_id: groupData.id,
            user_code: memberUserCode,
            user_id: body.userId || null,
            nickname: nickname,
            role: existingMember?.role || 'member',
            avatar_url: avatarUrl || null,
            joined_at: existingMember?.joined_at || nowIso,
            last_seen: nowIso,
          });

          const { data: allMembers } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', groupData.id);

          const formattedMembers = (allMembers || []).map((m) => ({
            nickname: m.nickname,
            userCode: m.user_code,
            role: m.role || 'member',
            joinedAt: new Date(m.joined_at || groupData.created_at).getTime(),
            lastSeen: m.last_seen ? new Date(m.last_seen).getTime() : undefined,
            avatarUrl: m.avatar_url || null,
          }));

          const updatedGroup = {
            id: groupData.id,
            code: groupData.code,
            name: groupData.name,
            description: groupData.description || '',
            avatarUrl: groupData.avatar_url || null,
            creatorNickname: groupData.creator_nickname,
            creatorCode: groupData.creator_code || null,
            membersCount: formattedMembers.length,
            maxMembers: 10,
            members: formattedMembers,
            createdAt: new Date(groupData.created_at).getTime(),
          };

          await triggerGroupPusherEvent(`presence-group-${groupData.id}`, 'member-joined', {
            groupId: groupData.id,
            nickname,
            userCode: memberUserCode,
            members: formattedMembers,
          });

          return sendJson(res, { status: 'ok', group: updatedGroup });
        } catch (err) {
          return sendError(res, err.message || 'Join failed', 500);
        }
      }

      return sendError(res, 'Groups database not configured', 500);
    }

    if (pathname === '/groups/leave' && req.method === 'POST') {
      const { groupId, nickname, userCode } = body;
      if (!groupId || (!nickname && !userCode)) return sendError(res, 'Missing groupId or member identification', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const memberKey = userCode || nickname;
          await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_code', memberKey);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'member-left', {
            groupId,
            nickname,
            userCode: memberKey,
          });
          return sendJson(res, { status: 'ok' });
        } catch {}
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/kick' && req.method === 'POST') {
      const { groupId, targetNickname, adminNickname } = body;
      if (!groupId || !targetNickname) return sendError(res, 'Missing kick parameters', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('group_members').delete().eq('group_id', groupId).eq('nickname', targetNickname);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'kick', {
            groupId,
            target: targetNickname,
            admin: adminNickname,
          });
          return sendJson(res, { status: 'ok' });
        } catch {}
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/update' && req.method === 'POST') {
      const { groupId, name, description, avatarUrl } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const updateData = { updated_at: new Date().toISOString() };
          if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
          if (typeof description === 'string') updateData.description = description.trim();
          if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl;

          await supabase.from('groups').update(updateData).eq('id', groupId);

          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-updated', {
            groupId,
            name: updateData.name,
            description: updateData.description,
            avatarUrl: updateData.avatar_url,
          });

          return sendJson(res, { status: 'ok', group: updateData });
        } catch (err) {
          return sendError(res, err.message || 'Update failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/delete' && req.method === 'POST') {
      const { groupId } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('groups').delete().eq('id', groupId);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-deleted', {
            groupId,
          });
          return sendJson(res, { status: 'ok' });
        } catch (err) {
          return sendError(res, err.message || 'Delete failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/role' && req.method === 'POST') {
      const { groupId, targetNickname, role } = body;
      if (!groupId || !targetNickname || !role) return sendError(res, 'Missing parameters', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('nickname', targetNickname);
          await triggerGroupPusherEvent(`presence-group-${groupId}`, 'member-role-updated', {
            groupId,
            targetNickname,
            role,
          });
          return sendJson(res, { status: 'ok' });
        } catch (err) {
          return sendError(res, err.message || 'Role update failed', 500);
        }
      }
      return sendJson(res, { status: 'ok' });
    }

    if (pathname === '/groups/messages' && req.method === 'GET') {
      const groupId = query.groupId || query.id;
      const limit = parseInt(query.limit || '100', 10);
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (!supabase) return sendError(res, 'Groups database not configured', 500);

      try {
        const { data, error } = await supabase
          .from('group_messages')
          .select('*')
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })
          .limit(limit);

        if (error) return sendError(res, error.message, 500);
        return sendJson(res, { status: 'ok', messages: data || [] });
      } catch (err) {
        return sendError(res, err.message, 500);
      }
    }

    if (pathname === '/groups/message' && req.method === 'POST') {
      const {
        id,
        groupId,
        senderCode,
        senderId,
        senderNickname,
        ciphertext,
        mediaType,
        mediaUrl,
        mediaName,
        mediaKey,
        mime,
        duration,
        width,
        height,
        waveform,
        audioMetadata,
        linkPreview,
      } = body;

      if (!groupId || !ciphertext || !senderNickname) {
        return sendError(res, 'Missing required message parameters', 400);
      }

      const msgId = id || `gmsg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const supabase = getGroupsSupabaseClient();
      const nowIso = new Date().toISOString();

      const messageRow = {
        id: msgId,
        group_id: groupId,
        sender_code: senderCode || senderNickname,
        sender_id: senderId || null,
        sender_nickname: senderNickname,
        ciphertext,
        media_type: mediaType || null,
        media_url: mediaUrl || null,
        media_name: mediaName || null,
        media_key: mediaKey || null,
        mime: mime || null,
        duration: duration || null,
        width: width || null,
        height: height || null,
        waveform: waveform || null,
        audio_metadata: audioMetadata || null,
        link_preview: linkPreview || null,
        created_at: nowIso,
      };

      if (supabase) {
        try {
          await supabase.from('group_messages').insert(messageRow);
        } catch {}
      }

      const broadcastPayload = {
        type: 'group-message',
        id: msgId,
        groupId,
        sender: senderNickname,
        senderCode: senderCode || senderNickname,
        senderId: senderId || null,
        ciphertext,
        mediaType,
        mediaUrl,
        mediaName,
        mime,
        duration,
        waveform,
        time: Date.now(),
      };

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'client-message', broadcastPayload);

      return sendJson(res, { status: 'ok', id: msgId });
    }

    if (pathname === '/groups/calls/active' && req.method === 'GET') {
      const groupId = query.groupId || query.id;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          const { data } = await supabase
            .from('group_calls')
            .select('*')
            .eq('group_id', groupId)
            .eq('status', 'active')
            .maybeSingle();

          return sendJson(res, { status: 'ok', call: data || null });
        } catch {}
      }
      return sendJson(res, { status: 'ok', call: null });
    }

    if (pathname === '/groups/calls/start' && req.method === 'POST') {
      const { groupId, roomName, hostCode, hostNickname } = body;
      if (!groupId || !roomName) return sendError(res, 'Missing call parameters', 400);

      const supabase = getGroupsSupabaseClient();
      const nowIso = new Date().toISOString();
      if (supabase) {
        try {
          await supabase.from('group_calls').upsert({
            group_id: groupId,
            room_name: roomName,
            status: 'active',
            host_code: hostCode || hostNickname,
            host_nickname: hostNickname || 'Host',
            participants_count: 1,
            created_at: nowIso,
            updated_at: nowIso,
          });
        } catch {}
      }

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-call-started', {
        groupId,
        roomName,
        hostCode,
        hostNickname,
      });

      return sendJson(res, { status: 'ok', roomName });
    }

    if (pathname === '/groups/calls/end' && req.method === 'POST') {
      const { groupId } = body;
      if (!groupId) return sendError(res, 'Missing groupId', 400);

      const supabase = getGroupsSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('group_calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('group_id', groupId);
        } catch {}
      }

      await triggerGroupPusherEvent(`presence-group-${groupId}`, 'group-call-ended', { groupId });

      return sendJson(res, { status: 'ok' });
    }

    if ((pathname === '/developers' || pathname === '/relay/developers') && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { data, error } = await supabase.from('developers').select('code');
      if (error) return sendError(res, error.message, 500);
      const codes = (data || []).map((d) => d.code).filter(Boolean);
      return sendJson(res, { developers: codes });
    }

    if (pathname === '/orbitos/ai' && req.method === 'POST') {
      const apiKey = ENV.GEMINI_API_KEY;
      if (!apiKey) {
        return sendError(res, 'GEMINI_API_KEY_NOT_CONFIGURED', 400);
      }
      const userMessage = (body && body.message) ? String(body.message).trim() : '';
      if (!userMessage) {
        return sendError(res, 'Empty message', 400);
      }
      const history = Array.isArray(body?.history) ? body.history : [];
      const contents = [];
      for (const item of history.slice(-6)) {
        if (item && item.text) {
          contents.push({
            role: item.isOutgoing ? 'user' : 'model',
            parts: [{ text: String(item.text) }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      const defaultSystemPrompt = 'Ты — официальный искусственный интеллект мессенджера Orbita (ORBITA AI). Твой стиль — как у передовых нейросетей Claude и ChatGPT ASTRA: высокий интеллектуальный уровень, безупречная точность, ясность, лаконичность, живая естественность и структурированность без шаблонных фраз и воды. 1. Архитектура и безопасность Orbita построены по стандарту Signal: сквозное шифрование (E2EE) на протоколе Double Ratchet (X25519, AES-256-GCM, HKDF-SHA256). Все сообщения и медиа шифруются исключительно на устройствах пользователей и не могут быть расшифрованы сервером или посторонними. 2. Доставка сообщений: как в Signal, зашифрованные пакеты проходят через защищённые сервера-релеи и временно хранятся в зашифрованной очереди доставки, пока получатель не выйдет в сеть и не прочитает сообщение. После доставки и прочтения сообщения удаляются с серверов. 3. Звонки: аудио- и видеозвонки, а также демонстрация экрана проходят через защищённые сервера-релеи (SFU / LiveKit), точно как в Signal, что полностью скрывает реальные IP-адреса собеседников и обеспечивает высочайшую защиту приватности и надёжность соединения. 4. Каналы и группы: защищены сквозным шифрованием (E2EE), сервер хранит только зашифрованные посты. 5. Резервные копии профиля (.orbita): зашифрованы мнемонической фразой из 12 слов стандарта BIP-39. 6. Официальный канал обновлений: Orbita Updates (ID: VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9). Если пользователь спрашивает про канал, новости или обновления, в самый конец ответа обязательно добавляй маркер [BUTTON:ORBITA_UPDATES] — интерфейс автоматически отобразит кнопку перехода в канал. 7. Стиль общения: будь вежливым, уверенным, умным и дружелюбным помощником. Различай сленг/эмоции и реальную токсичность: если пользователь просто эмоционален или использует сленг — отвечай спокойно и по делу. Только при прямой целенаправленной травле или хамстве давай остроумный, сдержанный и твердый отпор. 8. СТРОГИЙ ЗАПРЕТ НА ЭМОДЗИ: Категорически запрещено использовать любые эмодзи, смайлики и графические символы в ответе. Пиши только чистым текстом. 9. Отвечай максимально быстро, конкретно, структурированно и по существу.';
      const systemInstruction = (body && body.systemPrompt) || defaultSystemPrompt;
      const primaryUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      const payload = {
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 350,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      };

      let lastErr = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const targetUrl = attempt === 0 ? primaryUrl : fallbackUrl;
        const currentPayload = attempt === 0 ? payload : {
          ...payload,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 250,
          },
        };
        const aiRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentPayload),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const parts = aiData?.candidates?.[0]?.content?.parts || [];
          const answerPart = parts.find((p) => !p.thought && p.text) || parts[parts.length - 1] || {};
          let replyText = answerPart.text || '';
          replyText = replyText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu, '').trim();
          return sendJson(res, { reply: replyText });
        }
        const errText = await aiRes.text();
        lastErr = errText;
      }
      return sendError(res, `Gemini API error: ${lastErr}`, 503);
    }

    return sendError(res, 'Endpoint not found', 404);
  } catch (err) {
    return sendError(res, err?.message || 'Internal Server Error', 500);
  }
};
