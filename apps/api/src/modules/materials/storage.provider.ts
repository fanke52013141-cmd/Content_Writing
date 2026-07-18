import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

export interface StorageProvider {
  write(storageKey: string, content: Uint8Array): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export class LocalFileStorageProvider implements StorageProvider {
  private readonly absoluteRoot: string;

  constructor(root: string) {
    this.absoluteRoot = resolve(root);
  }

  private resolveKey(storageKey: string): string {
    if (!storageKey || storageKey.includes('\\')) throw new Error('Invalid storage key.');
    const target = resolve(this.absoluteRoot, storageKey);
    const childPath = relative(this.absoluteRoot, target);
    if (
      childPath.startsWith(`..${sep}`) ||
      childPath === '..' ||
      resolve(target) === this.absoluteRoot
    ) {
      throw new Error('Storage key escapes the configured root.');
    }
    return target;
  }

  async write(storageKey: string, content: Uint8Array): Promise<void> {
    const target = this.resolveKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: 'wx' });
  }

  read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveKey(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolveKey(storageKey), { force: true });
  }
}

export class InMemoryStorageProvider implements StorageProvider {
  readonly files = new Map<string, Buffer>();

  write(storageKey: string, content: Uint8Array): Promise<void> {
    if (this.files.has(storageKey)) return Promise.reject(new Error('Storage key already exists.'));
    this.files.set(storageKey, Buffer.from(content));
    return Promise.resolve();
  }

  read(storageKey: string): Promise<Buffer> {
    const content = this.files.get(storageKey);
    return content
      ? Promise.resolve(Buffer.from(content))
      : Promise.reject(new Error('Stored file not found.'));
  }

  delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
    return Promise.resolve();
  }
}
