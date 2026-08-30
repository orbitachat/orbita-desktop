// @ts-nocheck
// supabase/functions/gateway/index.ts
// Supabase Edge Function: Orbita Multi-Gateway
import { AccessToken } from 'npm:livekit-server-sdk@2.9.5';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

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

// API Credentials
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || '';
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || '';
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || '';

const PUSHER_KEY = Deno.env.get('PUSHER_KEY') || '';
const PUSHER_SECRET = Deno.env.get('PUSHER_SECRET') || '';

const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') || '';
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') || '';
const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') || '';

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  return createClient(supabaseUrl, supabaseKey);
}

Deno.serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gateway/, '').replace(/^\/functions\/v1\/gateway/, '');

  try {
    // 2. Health check
    if (path === '' || path === '/' || path === '/health') {
      return jsonResponse({
        status: 'ok',
        server: 'Supabase Edge Functions (AWS Global)',
        timestamp: Date.now(),
      });
    }

    // 3. LiveKit генератор токенов звонков
    if ((path === '/token' || path.endsWith('/token')) && req.method === 'POST') {
      const body = await req.json();
      const { room, identity, name } = body;

      if (!room || !identity) {
        return jsonResponse({ error: 'room and identity are required' }, 400);
      }

      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name: name || identity,
        ttl: '4h',
      });

      at.addGrant({
        roomJoin: true,
        room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      return jsonResponse({ token, url: LIVEKIT_URL });
    }

    // 4. Ably Token Request (/ably-auth)
    if ((path === '/ably-auth' || path.endsWith('/ably-auth')) && (req.method === 'GET' || req.method === 'POST')) {
      let clientId = url.searchParams.get('clientId') || undefined;
      if (req.method === 'POST') {
        try {
          const body = await req.json();
          if (body.clientId) clientId = body.clientId;
        } catch {}
      }

      const ablyRes = await fetch(`https://orbita.ypgreg78.workers.dev/ably-auth?clientId=${encodeURIComponent(clientId || '')}`);
      if (ablyRes.ok) {
        const data = await ablyRes.json();
        return jsonResponse(data);
      }
    }

    // 5. Pusher Channel Auth
    if ((path === '/pusher-auth' || path.endsWith('/pusher-auth') || path.endsWith('/pusher/auth')) && req.method === 'POST') {
      const body = await req.json();
      const { socket_id, channel_name, channel_data } = body;

      if (!socket_id || !channel_name) {
        return jsonResponse({ error: 'socket_id and channel_name are required' }, 400);
      }

      let stringToSign = `${socket_id}:${channel_name}`;
      if (channel_data) {
        stringToSign += `:${channel_data}`;
      }

      const encoder = new TextEncoder();
      const keyData = encoder.encode(PUSHER_SECRET);
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(stringToSign));
      const sigBytes = new Uint8Array(signatureBuffer);
      const hexSignature = Array.from(sigBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return jsonResponse({
        auth: `${PUSHER_KEY}:${hexSignature}`,
        ...(channel_data ? { channel_data } : {}),
      });
    }

    // 6. Cloudinary Upload Sign
    if ((path === '/cloudinary-sign' || path.endsWith('/cloudinary-sign')) && req.method === 'POST') {
      const body = await req.json();
      const { public_id, timestamp = Math.floor(Date.now() / 1000).toString() } = body;

      if (!public_id) {
        return jsonResponse({ error: 'public_id is required' }, 400);
      }

      const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(paramsToSign));
      const hashBytes = new Uint8Array(hashBuffer);
      const signature = Array.from(hashBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return jsonResponse({
        signature,
        timestamp,
        apiKey: CLOUDINARY_API_KEY,
        cloudName: CLOUDINARY_CLOUD_NAME,
        uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      });
    }

    // 7. Relay: Сохранение входящего рукопожатия / заявки в друзья
    if ((path === '/relay/handshake' || path.endsWith('/relay/handshake')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { chatId, recipientCode, senderNickname, senderPublicKey, senderAvatarUrl, senderCode } = body;

      if (!chatId || !recipientCode || !senderNickname || !senderPublicKey) {
        return jsonResponse({ error: 'Missing required handshake parameters' }, 400);
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

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    // 8. Relay: Получение входящих рукопожатий / заявок в друзья
    if ((path === '/relay/handshakes' || path.endsWith('/relay/handshakes')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const recipientCode = url.searchParams.get('recipientCode');
      if (!recipientCode) return jsonResponse({ error: 'Missing recipientCode parameter' }, 400);

      const { data, error } = await supabase
        .from('handshakes')
        .select('*')
        .eq('recipient_code', recipientCode)
        .eq('consumed', false)
        .order('created_at', { ascending: true });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ handshakes: data || [] });
    }

    // 9. Relay: Пометить рукопожатие как обработанное (принято/отклонено)
    if ((path === '/relay/handshake/consumed' || path.endsWith('/relay/handshake/consumed')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.handshakeId) return jsonResponse({ error: 'Missing handshakeId parameter' }, 400);

      const { error } = await supabase
        .from('handshakes')
        .update({ consumed: true })
        .eq('id', body.handshakeId);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok' });
    }

    // 10. Relay: Отправка сообщения (офлайн/резерв)
    if ((path === '/relay/message' || path.endsWith('/relay/message')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { data, error } = await supabase
        .from('messages')
        .insert({
          chat_id: body.chatId,
          sender_id: body.senderId,
          recipient_id: body.recipientId,
          ciphertext: body.ciphertext,
          message_index: body.messageIndex,
          dh_public_key: body.dhPublicKey,
        })
        .select();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    // 11. Relay: Получение сообщений для получателя
    if ((path === '/relay/messages' || path.endsWith('/relay/messages')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const recipientId = url.searchParams.get('recipientId');
      if (!recipientId) return jsonResponse({ error: 'Missing recipientId parameter' }, 400);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('delivered', false)
        .order('created_at', { ascending: true });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ messages: data || [] });
    }

    // 12. Relay: Пометить сообщение доставленным
    if ((path === '/relay/message/delivered' || path.endsWith('/relay/message/delivered')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.messageId) return jsonResponse({ error: 'Missing messageId parameter' }, 400);

      const { error } = await supabase
        .from('messages')
        .update({
          delivered: true,
          expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        })
        .eq('id', body.messageId)
        .eq('delivered', false);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok' });
    }

    // 13. Relay: Сохранение обновления профиля (ник/аватар)
    if ((path === '/relay/profile' || path.endsWith('/relay/profile')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      if (!body.chatId) return jsonResponse({ error: 'Missing chatId parameter' }, 400);

      const { data, error } = await supabase
        .from('profile_updates')
        .insert({
          chat_id: body.chatId,
          nickname: body.nickname || null,
          avatar_url: body.avatarUrl || null,
        })
        .select();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ status: 'ok', data });
    }

    // 14. Relay: Получение обновления профиля для чата
    if ((path === '/relay/profile' || path.endsWith('/relay/profile')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const chatId = url.searchParams.get('chatId');
      if (!chatId) return jsonResponse({ error: 'Missing chatId parameter' }, 400);

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .eq('chat_id', chatId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ profile: data || null });
    }

    // 15. Relay: Пакетное получение обновлений профилей для списка чатов
    if ((path === '/relay/profiles/latest' || path.endsWith('/relay/profiles/latest')) && req.method === 'POST') {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const { chatIds } = body as { chatIds: string[] };

      if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
        return jsonResponse({ updates: [] });
      }

      const { data, error } = await supabase
        .from('profile_updates')
        .select('*')
        .in('chat_id', chatIds)
        .order('updated_at', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      // Оставляем только самое последнее обновление для каждого chatId
      const latestMap = new Map<string, any>();
      for (const update of data || []) {
        if (!latestMap.has(update.chat_id)) {
          latestMap.set(update.chat_id, update);
        }
      }

      return jsonResponse({ updates: Array.from(latestMap.values()) });
    }

    // 16. Список разработчиков Orbita
    if ((path === '/developers' || path === '/relay/developers' || path.endsWith('/developers')) && req.method === 'GET') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('developers')
        .select('code');

      if (error) return jsonResponse({ error: error.message }, 500);
      const codes = (data || []).map((d: any) => d.code).filter(Boolean);
      return jsonResponse({ developers: codes });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err: any) {
    console.error('[Supabase Gateway] Error:', err);
    return jsonResponse({ error: err?.message || 'Internal server error' }, 500);
  }
});
