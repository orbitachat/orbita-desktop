import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex';

// WebCrypto ECDSA P-256
export const generateSigningKeyPair = async (): Promise<{ publicKey: string; privateKey: string }> => {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  
  const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  
  return {
    publicKey: hexEncode(new Uint8Array(pubRaw)),
    privateKey: hexEncode(new Uint8Array(privRaw)),
  };
};

export const signData = async (privateKeyHex: string, data: string): Promise<string> => {
  const privBuffer = hexDecode(privateKeyHex);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privBuffer as any,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  
  const dataBytes = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    dataBytes
  );
  
  return hexEncode(new Uint8Array(signature));
};

export const verifySignature = async (publicKeyHex: string, signatureHex: string, data: string): Promise<boolean> => {
  try {
    const pubBuffer = hexDecode(publicKeyHex);
    const sigBuffer = hexDecode(signatureHex);
    const dataBytes = new TextEncoder().encode(data);
    
    const key = await crypto.subtle.importKey(
      'raw',
      pubBuffer as any,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      sigBuffer as any,
      dataBytes as any
    );
  } catch {
    return false;
  }
};
