import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ModelCrypto {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHash('sha256').update(secret).digest();
  }
  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }
}
