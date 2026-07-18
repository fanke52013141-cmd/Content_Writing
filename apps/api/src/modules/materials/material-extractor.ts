import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface DocumentExtraction {
  text: string;
  warnings: readonly string[];
}

export interface DocumentExtractor {
  extract(kind: 'docx' | 'pdf', content: Uint8Array): Promise<DocumentExtraction>;
}

export interface WebpageExtraction {
  finalUrl: string;
  title: string;
  siteName: string;
  text: string;
  rawHtml: Uint8Array;
  fetchedAt: Date;
}

export interface WebpageExtractor {
  extract(url: string): Promise<WebpageExtraction>;
}

export const DOCUMENT_EXTRACTOR = Symbol('DOCUMENT_EXTRACTOR');
export const WEBPAGE_EXTRACTOR = Symbol('WEBPAGE_EXTRACTOR');

export class MatureDocumentExtractor implements DocumentExtractor {
  async extract(kind: 'docx' | 'pdf', content: Uint8Array): Promise<DocumentExtraction> {
    if (kind === 'docx') {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(content) });
      return {
        text: result.value.trim(),
        warnings: result.messages.map((message) => message.message).filter(Boolean),
      };
    }

    const loadingTask = getDocument({
      data: new Uint8Array(content),
      useWorkerFetch: false,
    });
    const document = await loadingTask.promise;
    if (document.numPages > 200) throw new Error('PDF exceeds the 200-page V1 limit.');
    const pages: string[] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const text = await page.getTextContent();
        pages.push(
          text.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .trim(),
        );
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
    }
    return { text: pages.filter(Boolean).join('\n\n'), warnings: [] };
  }
}

type AddressResolver = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

const defaultResolver: AddressResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  const first = parts[0] ?? 0;
  const second = parts[1] ?? 0;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) !== 4 || isBlockedIpv4(mapped);
  }
  return false;
}

export class SafeWebpageExtractor implements WebpageExtractor {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly resolveAddresses: AddressResolver = defaultResolver,
  ) {}

  private async validateUrl(value: string): Promise<URL> {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Only credential-free HTTP(S) URLs are supported.');
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local')) {
      throw new Error('Local network URLs are not allowed.');
    }
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await this.resolveAddresses(hostname);
    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
      throw new Error('Private, local or reserved network targets are not allowed.');
    }
    return url;
  }

  private async readBody(response: Response): Promise<Uint8Array> {
    const maximumBytes = 5 * 1024 * 1024;
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > maximumBytes) throw new Error('Webpage exceeds the 5 MB V1 limit.');
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error('Webpage exceeds the 5 MB V1 limit.');
      }
      chunks.push(value);
    }
    const content = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      content.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return content;
  }

  async extract(value: string): Promise<WebpageExtraction> {
    let url = await this.validateUrl(value);
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      const response = await this.fetcher(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: { 'user-agent': 'Content-Writing-Local/0.1 (+local material import)' },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 5) throw new Error('Webpage redirect limit exceeded.');
        url = await this.validateUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Webpage returned HTTP ${response.status}.`);
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new Error('URL did not return an HTML webpage.');
      }
      const rawHtml = await this.readBody(response);
      const html = new TextDecoder('utf-8', { fatal: false }).decode(rawHtml);
      const dom = new JSDOM(html, { url: url.toString() });
      const article = new Readability(dom.window.document, {
        charThreshold: 50,
        maxElemsToParse: 100_000,
      }).parse();
      const fallbackText = dom.window.document.body?.textContent ?? '';
      const text = (article?.textContent ?? fallbackText).replace(/\n{3,}/gu, '\n\n').trim();
      dom.window.close();
      if (!text) throw new Error('No extractable webpage text was found.');
      return {
        finalUrl: url.toString(),
        title: article?.title?.trim() ?? '',
        siteName: article?.siteName?.trim() ?? '',
        text,
        rawHtml,
        fetchedAt: new Date(),
      };
    }
    throw new Error('Webpage extraction failed.');
  }
}
