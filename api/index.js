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
  PUSHER_KEY: process.env.PUSHER_KEY || 'e8f5cf13f6759775e44e',
  PUSHER_SECRET: process.env.PUSHER_SECRET || '',
  PUSHER_APP_ID: process.env.PUSHER_APP_ID || '2142120',
  PUSHER_CLUSTER: process.env.PUSHER_CLUSTER || 'eu',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

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

const PUSHER_CONFIGS = [
  {
    appId: ENV.PUSHER_APP_ID,
    key: ENV.PUSHER_KEY,
    secret: ENV.PUSHER_SECRET,
    cluster: ENV.PUSHER_CLUSTER,
  },
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

function getSupabaseClient() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
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

      const targetServer = PUSHER_CONFIGS.find((c) => c.key === requestedKey) || PUSHER_CONFIGS[0];
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
      const { chatId, senderId, recipientId, ciphertext, messageIndex, dhPublicKey } = body;
      if (!chatId || !senderId || !recipientId || !ciphertext) {
        return sendError(res, 'Missing required message parameters', 400);
      }
      const { data, error } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: messageIndex,
        dh_public_key: dhPublicKey,
      }).select();
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

    if (pathname === '/relay/profile' && req.method === 'POST') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      if (!body.chatId) return sendError(res, 'Missing chatId parameter', 400);
      const { data, error } = await supabase.from('profile_updates').insert({
        chat_id: body.chatId,
        nickname: body.nickname || null,
        avatar_url: body.avatarUrl || null,
      }).select();
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { status: 'ok', data });
    }

    if (pathname === '/relay/profile' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const chatId = query.chatId;
      if (!chatId) return sendError(res, 'Missing chatId parameter', 400);
      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .eq('chat_id', chatId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return sendError(res, error.message, 500);
      return sendJson(res, { profile: data || null });
    }

    if (pathname === '/channels/featured' && req.method === 'GET') {
      const supabase = getSupabaseClient();
      let channels = [OFFICIAL_CHANNEL_DATA];
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
            const others = mapped.filter((c) => c.id !== OFFICIAL_CHANNEL_ID);
            channels = [OFFICIAL_CHANNEL_DATA, ...others];
          }
        } catch {}
      }
      return sendJson(res, { channels });
    }

    if (pathname === '/channels/get' && req.method === 'GET') {
      const channelId = query.channelId ? query.channelId.trim() : '';
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      if (channelId === OFFICIAL_CHANNEL_ID) return sendJson(res, { channel: OFFICIAL_CHANNEL_DATA });
      const supabase = getSupabaseClient();
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
                creatorNickname: data.creator_nickname,
                subscribersCount: data.subscribers_count || 1,
                isOfficial: data.is_official || false,
                createdAt: new Date(data.created_at).getTime(),
              },
            });
          }
        } catch {}
      }
      return sendError(res, 'Channel not found', 404);
    }

    if (pathname === '/channels/create' && req.method === 'POST') {
      if (!body.name || !body.creatorNickname) return sendError(res, 'Missing name or creatorNickname', 400);
      const channelId = body.id || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.from('public_channels').upsert({
            id: channelId,
            name: body.name,
            description: body.description || '',
            avatar_url: body.avatarUrl || null,
            creator_nickname: body.creatorNickname,
            subscribers_count: 1,
            is_official: false,
            created_at: new Date().toISOString(),
          });
        } catch {}
      }
      return sendJson(res, {
        status: 'ok',
        channel: {
          id: channelId,
          name: body.name,
          description: body.description || '',
          avatarUrl: body.avatarUrl || null,
          creatorNickname: body.creatorNickname,
          subscribersCount: 1,
          isOfficial: false,
          createdAt: Date.now(),
        },
      });
    }

    if (pathname === '/channels/posts' && req.method === 'GET') {
      const channelId = query.channelId;
      if (!channelId) return sendError(res, 'Missing channelId parameter', 400);
      const supabase = getSupabaseClient();
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
            return sendJson(res, { posts: mapped });
          }
        } catch {}
      }
      return sendJson(res, { posts: [] });
    }

    if (pathname === '/channels/post' && req.method === 'POST') {
      if (!body.channelId || !body.senderNickname) return sendError(res, 'Missing channelId or senderNickname', 400);
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
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data: chanCheck } = await supabase.from('public_channels').select('id').eq('id', body.channelId).maybeSingle();
          if (!chanCheck) {
            await supabase.from('public_channels').upsert({
              id: body.channelId,
              name: body.channelName || body.channelId,
              description: '',
              creator_nickname: body.senderNickname,
              subscribers_count: 1,
              is_official: false,
              created_at: createdAt,
            });
          }
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
        } catch {}
      }
      await triggerPusherEvent(`public-channel-${body.channelId}`, 'new-post', postRecord);
      await triggerAblyEvent(`chat:public-channel-${body.channelId}`, 'client-message', { type: 'channel-post', post: postRecord });
      return sendJson(res, { status: 'ok', post: postRecord });
    }

    if (pathname === '/channels/join' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getSupabaseClient();
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
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/leave' && req.method === 'POST') {
      if (!body.channelId) return sendError(res, 'Missing channelId parameter', 400);
      const channelId = body.channelId.trim();
      let newCount = 1;
      const supabase = getSupabaseClient();
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
      return sendJson(res, { status: 'ok', subscribersCount: newCount });
    }

    if (pathname === '/channels/reaction' && req.method === 'POST') {
      if (!body.channelId || !body.postId || !body.emoji || !body.userId) {
        return sendError(res, 'Missing reaction parameters', 400);
      }
      const supabase = getSupabaseClient();
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
          const alreadyPresent = currentUsers.includes(body.userId);
          if (body.action === 'add' || (!body.action && !alreadyPresent) || (body.action === 'toggle' && !alreadyPresent)) {
            reactions[body.emoji] = [...currentUsers.filter((u) => u !== body.userId), body.userId];
          } else {
            const filtered = currentUsers.filter((u) => u !== body.userId);
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

    if ((pathname === '/developers' || pathname === '/relay/developers') && req.method === 'GET') {
      const supabase = getSupabaseClient();
      if (!supabase) return sendError(res, 'Database not configured', 500);
      const { data, error } = await supabase.from('developers').select('code');
      if (error) return sendError(res, error.message, 500);
      const codes = (data || []).map((d) => d.code).filter(Boolean);
      return sendJson(res, { developers: codes });
    }

    return sendError(res, 'Endpoint not found', 404);
  } catch (err) {
    return sendError(res, err?.message || 'Internal Server Error', 500);
  }
};
