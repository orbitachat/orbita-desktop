import { sharedKey as x25519SharedKey } from '@stablelib/x25519';
import { hkdfSha256 } from './crypto';
import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex';
import { verifySignature } from './signature';

export async function x3dhInitiator(
  ourIdentityKey: { publicKey: string; privateKey: string },
  ourEphemeralKey: { publicKey: string; privateKey: string },
  theirIdentityKeyPublic: string,
  theirSignedPreKeyPublic: string,
  theirIdentitySigningKeyPublic: string,
  theirPreKeySignature: string,
  theirOneTimePreKeyPublic?: string
): Promise<string> {
  // 1. (Optional) Verify the signed prekey signature
  const isValid = await verifySignature(
    theirIdentitySigningKeyPublic,
    theirPreKeySignature,
    theirIdentityKeyPublic + theirSignedPreKeyPublic
  );
  if (!isValid) {
    console.warn('[X3DH] Warning: PreKey signature verification failed or skipped.');
  }

  // 2. Compute DH outputs
  const dh1 = x25519SharedKey(hexDecode(ourIdentityKey.privateKey), hexDecode(theirSignedPreKeyPublic));
  const dh2 = x25519SharedKey(hexDecode(ourEphemeralKey.privateKey), hexDecode(theirIdentityKeyPublic));
  const dh3 = x25519SharedKey(hexDecode(ourEphemeralKey.privateKey), hexDecode(theirSignedPreKeyPublic));
  
  let ikmLength = dh1.length + dh2.length + dh3.length;
  let dh4: Uint8Array | null = null;
  
  if (theirOneTimePreKeyPublic) {
    dh4 = x25519SharedKey(hexDecode(ourEphemeralKey.privateKey), hexDecode(theirOneTimePreKeyPublic));
    ikmLength += dh4.length;
  }

  // 3. Concatenate DH outputs
  const ikm = new Uint8Array(ikmLength);
  ikm.set(dh1, 0);
  ikm.set(dh2, dh1.length);
  ikm.set(dh3, dh1.length + dh2.length);
  if (dh4) {
    ikm.set(dh4, dh1.length + dh2.length + dh3.length);
  }

  // 4. KDF
  const salt = new Uint8Array(32); // All zeros
  const info = new TextEncoder().encode('X3DH');
  const sk = hkdfSha256(ikm, salt, info, 32);

  return hexEncode(sk);
}

export async function x3dhResponder(
  ourIdentityKey: { publicKey: string; privateKey: string },
  ourSignedPreKey: { publicKey: string; privateKey: string },
  theirIdentityKeyPublic: string,
  theirEphemeralKeyPublic: string,
  ourOneTimePreKey?: { publicKey: string; privateKey: string }
): Promise<string> {
  // Compute DH outputs
  const dh1 = x25519SharedKey(hexDecode(ourSignedPreKey.privateKey), hexDecode(theirIdentityKeyPublic));
  const dh2 = x25519SharedKey(hexDecode(ourIdentityKey.privateKey), hexDecode(theirEphemeralKeyPublic));
  const dh3 = x25519SharedKey(hexDecode(ourSignedPreKey.privateKey), hexDecode(theirEphemeralKeyPublic));
  
  let ikmLength = dh1.length + dh2.length + dh3.length;
  let dh4: Uint8Array | null = null;
  
  if (ourOneTimePreKey) {
    dh4 = x25519SharedKey(hexDecode(ourOneTimePreKey.privateKey), hexDecode(theirEphemeralKeyPublic));
    ikmLength += dh4.length;
  }

  // Concatenate DH outputs
  const ikm = new Uint8Array(ikmLength);
  ikm.set(dh1, 0);
  ikm.set(dh2, dh1.length);
  ikm.set(dh3, dh1.length + dh2.length);
  if (dh4) {
    ikm.set(dh4, dh1.length + dh2.length + dh3.length);
  }

  // KDF
  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode('X3DH');
  const sk = hkdfSha256(ikm, salt, info, 32);

  return hexEncode(sk);
}
