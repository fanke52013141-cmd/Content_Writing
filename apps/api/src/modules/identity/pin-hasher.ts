import { promisify } from 'node:util';
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const scrypt = promisify(nodeScrypt);

@Injectable()
export class PinHasher {
  async hash(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = (await scrypt(pin, salt, 32)) as Buffer;
    return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
  }

  async verify(pin: string, encodedHash: string): Promise<boolean> {
    const [algorithm, saltValue, hashValue] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;

    const expected = Buffer.from(hashValue, 'base64url');
    const actual = (await scrypt(
      pin,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
    )) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
