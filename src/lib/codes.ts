export const generateRandomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(36);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 36; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};

export const generateChannelId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const array = new Uint8Array(42);
  crypto.getRandomValues(array);
  let code = '';
  for (let i = 0; i < 42; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
};