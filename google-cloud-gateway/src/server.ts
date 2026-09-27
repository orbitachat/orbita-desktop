// @ts-nocheck
// google-cloud-gateway/src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment configuration
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

const PUSHER_KEY = process.env.PUSHER_KEY || '';
const PUSHER_SECRET = process.env.PUSHER_SECRET || '';
const PUSHER_APP_ID = process.env.PUSHER_APP_ID || '';

const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';

/**
 * 1. Health check endpoint (Used by Orbita client for latency racing)
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'Google Cloud Run (Orbita Gateway)',
    timestamp: Date.now(),
  });
});

/**
 * 2. LiveKit Voice & Video Token Generator
 */
app.post('/token', async (req, res) => {
  try {
    const { room, identity, name } = req.body;
    if (!room || !identity) {
      return res.status(400).json({ error: 'room and identity are required' });
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
    res.json({
      token,
      url: LIVEKIT_URL,
    });
  } catch (err: any) {
    console.error('Error generating LiveKit token:', err);
    res.status(500).json({ error: err?.message || 'Token generation failed' });
  }
});

/**
 * 3. Pusher Channel Authentication
 */
app.post('/pusher-auth', (req, res) => {
  try {
    const { socket_id, channel_name, channel_data } = req.body;
    if (!socket_id || !channel_name) {
      return res.status(400).json({ error: 'socket_id and channel_name are required' });
    }

    let stringToSign = `${socket_id}:${channel_name}`;
    if (channel_data) {
      stringToSign += `:${channel_data}`;
    }

    const hmac = crypto.createHmac('sha256', PUSHER_SECRET);
    hmac.update(stringToSign);
    const signature = hmac.digest('hex');

    res.json({
      auth: `${PUSHER_KEY}:${signature}`,
      ...(channel_data ? { channel_data } : {}),
    });
  } catch (err: any) {
    console.error('Pusher auth error:', err);
    res.status(500).json({ error: err?.message });
  }
});

/**
 * 4. Cloudinary Signed Upload
 */
app.post('/cloudinary-sign', (req, res) => {
  try {
    const { public_id, timestamp = Math.floor(Date.now() / 1000).toString() } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: 'public_id is required' });
    }

    const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const shasum = crypto.createHash('sha1');
    shasum.update(paramsToSign);
    const signature = shasum.digest('hex');

    res.json({
      signature,
      timestamp,
      apiKey: CLOUDINARY_API_KEY,
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    });
  } catch (err: any) {
    console.error('Cloudinary sign error:', err);
    res.status(500).json({ error: err?.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Google Cloud Gateway] Server listening on port ${PORT}`);
});
