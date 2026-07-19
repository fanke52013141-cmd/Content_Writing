import { createDecipheriv, createHash } from 'node:crypto';

export function decryptModelKey(encoded: string, secret: string): string {
  const [version, ivText, tagText, ciphertextText] = encoded.split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText)
    throw new Error('Unsupported model key ciphertext.');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
