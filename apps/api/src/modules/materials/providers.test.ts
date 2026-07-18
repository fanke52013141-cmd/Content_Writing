import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SafeWebpageExtractor } from './material-extractor.js';
import { LocalFileStorageProvider } from './storage.provider.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('local material providers', () => {
  it('stores files under the configured root and rejects traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-writing-storage-'));
    temporaryDirectories.push(root);
    const storage = new LocalFileStorageProvider(root);

    await storage.write('materials/id/source.txt', Buffer.from('本地素材'));
    expect((await storage.read('materials/id/source.txt')).toString('utf8')).toBe('本地素材');
    await expect(storage.write('../escape.txt', Buffer.from('blocked'))).rejects.toThrow('escapes');
  });

  it('extracts readable text from HTML without executing page scripts', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '<html><head><title>测试文章</title></head><body><article><h1>测试文章</h1><p>这是一段足够长的正文，用于验证网页素材抽取不会执行任何脚本。</p><script>globalThis.compromised=true</script></article></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        ),
      );
    const extractor = new SafeWebpageExtractor(fetcher, () =>
      Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
    );

    const result = await extractor.extract('https://example.com/article');

    expect(result.title).toContain('测试文章');
    expect(result.text).toContain('用于验证网页素材抽取');
    expect((globalThis as { compromised?: boolean }).compromised).not.toBe(true);
  });

  it('blocks private network targets before fetching', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const extractor = new SafeWebpageExtractor(fetcher, () =>
      Promise.resolve([{ address: '192.168.1.10', family: 4 }]),
    );

    await expect(extractor.extract('http://router.internal/admin')).rejects.toThrow(
      'Private, local or reserved',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
