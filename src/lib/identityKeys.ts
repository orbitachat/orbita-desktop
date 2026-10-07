import { generateKeyPair as x25519GenKeyPair } from '@stablelib/x25519';
import { generateSigningKeyPair, signData } from './signature';
import { supabaseService } from '../services/supabaseService';
import { useAuthStore } from '../store/useAuthStore';
import { encode as hexEncode } from '@stablelib/hex';
import { nanoid } from 'nanoid';

export async function initializeIdentityKeys(userCode: string) {
  const store = useAuthStore.getState();
  
  if (store.identityKeyPair && store.signedPreKeyPair && store.identitySigningKeyPair) {
    return; // Already initialized
  }

  try {
    // 1. Generate long-term identity key (X25519)
    const ikRaw = x25519GenKeyPair();
    const identityKeyPair = {
      publicKey: hexEncode(ikRaw.publicKey),
      privateKey: hexEncode(ikRaw.secretKey),
    };

    // 2. Generate signing key (ECDSA P-256)
    const identitySigningKeyPair = await generateSigningKeyPair();

    // 3. Generate medium-term signed prekey (X25519)
    const spkRaw = x25519GenKeyPair();
    const signedPreKeyPair = {
      publicKey: hexEncode(spkRaw.publicKey),
      privateKey: hexEncode(spkRaw.secretKey),
    };

    // 4. Sign the prekey with the signing key
    // We sign the concatenation of our identity public key and the signed prekey public key
    const preKeySignature = await signData(
      identitySigningKeyPair.privateKey, 
      identityKeyPair.publicKey + signedPreKeyPair.publicKey
    );

    // 5. Generate 50 One-Time PreKeys (OTPK)
    const oneTimePreKeys = [];
    const oneTimePreKeysForUpload = [];
    
    for (let i = 0; i < 50; i++) {
      const otpkRaw = x25519GenKeyPair();
      const otpk = {
        id: nanoid(),
        keyId: i + 1,
        publicKey: hexEncode(otpkRaw.publicKey),
        privateKey: hexEncode(otpkRaw.secretKey),
      };
      oneTimePreKeys.push(otpk);
      oneTimePreKeysForUpload.push({
        keyId: otpk.keyId,
        publicKey: otpk.publicKey,
      });
    }

    // 6. Save to local state
    store.setIdentityKeys({
      identityKeyPair,
      identitySigningKeyPair,
      signedPreKeyPair,
      oneTimePreKeys,
    });

    // 7. Upload to Supabase Key Server
    await supabaseService.uploadPublicKeys(
      userCode,
      identityKeyPair.publicKey,
      signedPreKeyPair.publicKey,
      preKeySignature,
      oneTimePreKeysForUpload,
      identitySigningKeyPair.publicKey
    );
    
    console.log('[IdentityKeys] Successfully initialized and uploaded Identity Keys');
  } catch (err) {
    console.error('[IdentityKeys] Failed to initialize keys:', err);
  }
}
