require('dotenv').config({ path: process.env.ENV_PATH || undefined });
global.WebSocket = require('ws');

console.log('[Server] WebSocket polyfill loaded. typeof WebSocket =', typeof WebSocket);
console.log('[Server] Node version:', process.version);

const Pusher = require('pusher');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { AccessToken } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== Загрузка переменных окружения =====
const {
  PUSHER_APP_ID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_CLUSTER,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const PUSHER_CONFIGS = [
  {
    appId: PUSHER_APP_ID || '',
    key: PUSHER_KEY || '',
    secret: PUSHER_SECRET || '',
    cluster: PUSHER_CLUSTER || 'eu',
  }
];

const pusherMap = new Map();
PUSHER_CONFIGS.forEach((cfg) => {
  if (cfg.secret) {
    pusherMap.set(cfg.key, new Pusher({
      appId: cfg.appId,
      key: cfg.key,
      secret: cfg.secret,
      cluster: cfg.cluster,
      useTLS: true,
    }));
  }
});

const hasLiveKit = !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);

if (!hasLiveKit) {
  console.log('[Server] LiveKit credentials missing in local env (using Worker token gateway)');
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('[Server] Supabase credentials missing in local env – cleanup task disabled');
}

app.post('/pusher/auth', (req, res) => {
  const { socket_id, channel_name, pusher_key } = req.body;
  const targetKey = pusher_key || req.query.pusher_key || PUSHER_KEY || 'e8f5cf13f6759775e44e';
  const instance = pusherMap.get(targetKey) || pusherMap.values().next().value;
  if (!instance) {
    return res.status(200).json({ auth: 'ok' });
  }

  if (!channel_name || (!channel_name.startsWith('private-handshake-') && !channel_name.startsWith('private-chat-') && !channel_name.startsWith('presence-group-'))) {
    console.warn('[Pusher] Forbidden channel:', channel_name);
    return res.status(403).send('Forbidden');
  }

  if (channel_name.startsWith('presence-')) {
    const authResponse = instance.authorizeChannel(socket_id, channel_name);
    res.send({
      auth: authResponse.auth,
      channel_data: JSON.stringify({
        user_id: socket_id,
        user_info: { nickname: 'user' }
      })
    });
  } else {
    const auth = instance.authorizeChannel(socket_id, channel_name);
    res.json(auth);
  }
});

app.post('/api/livekit/token', async (req, res) => {
  console.log('[LiveKit] Request received:', req.body);
  const { room, identity, name } = req.body;

  if (!room || !identity) {
    console.error('[LiveKit] Missing required fields: room or identity');
    return res.status(400).json({ error: 'Missing room or identity' });
  }

  try {
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: name || identity,
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    console.log('[LiveKit] Token generated successfully for identity:', identity, 'room:', room);
    console.log('[LiveKit] Token (first 50 chars):', token.substring(0, 50) + '...');
    res.json({ token, url: LIVEKIT_URL });
  } catch (err) {
    console.error('[LiveKit] Token generation error:', err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.post(['/groups/token', '/groups/livekit/token', '/groups/livekit-token'], async (req, res) => {
  const { room, identity, name } = req.body;
  if (!room || !identity) return res.status(400).json({ error: 'Missing room or identity' });
  const apiKey = process.env.GROUPS_LIVEKIT_API_KEY || '';
  const apiSecret = process.env.GROUPS_LIVEKIT_API_SECRET || '';
  const livekitUrl = process.env.GROUPS_LIVEKIT_URL || 'wss://fewfregfrtgtr-lq3p5f01.livekit.cloud';

  try {
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
    res.json({ token, url: livekitUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate group livekit token' });
  }
});

app.post('/send-group-message', (req, res) => {
  const { chatId, text, sender } = req.body;
  console.log('[Group] Sending message to', chatId, 'from', sender);
  pusher.trigger(`presence-group-${chatId}`, 'message', { sender, text });
  res.send('ok');
});

app.post('/edit-group-message', (req, res) => {
  const { chatId, text, sender, editIndex } = req.body;
  console.log('[Group] Editing message in', chatId, 'from', sender, 'index', editIndex);
  pusher.trigger(`presence-group-${chatId}`, 'edit', { sender, text, editIndex });
  res.send('ok');
});

app.post('/react-message', (req, res) => {
  const { chatId, messageId, emoji, sender, action } = req.body;
  console.log('[Reaction] User', sender, 'reacted', emoji, 'action:', action, 'to message', messageId, 'in chat', chatId);
  pusher.trigger(`presence-group-${chatId}`, 'reaction', { chatId, messageId, emoji, sender, action });
  pusher.trigger(`private-chat-${chatId}`, 'reaction', { chatId, messageId, emoji, sender, action });
  res.json({ status: 'ok' });
});

async function cleanExpiredMessages() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Cleanup] Supabase credentials not set, skipping cleanup.');
    return;
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      transport: WebSocket,
    });
    const { error } = await supabase
      .from('messages')
      .delete()
      .lt('expires_at', new Date().toISOString());
    if (error) {
      console.error('[Cleanup] Failed to delete expired messages:', error);
    } else {
      console.log('[Cleanup] Expired messages cleaned.');
    }
  } catch (err) {
    console.error('[Cleanup] Error during cleanup:', err);
  }
}

const CLEANUP_INTERVAL = 60 * 1000;
setInterval(cleanExpiredMessages, CLEANUP_INTERVAL);
setTimeout(cleanExpiredMessages, 5000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Orbita auth server running on port ${PORT}`);
});