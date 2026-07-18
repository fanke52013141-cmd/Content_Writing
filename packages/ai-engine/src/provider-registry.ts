import type { TextModelProvider } from '@content-writing/contracts';

export class ProviderRegistry {
  private readonly providers = new Map<string, TextModelProvider>();

  register(provider: TextModelProvider): void {
    if (this.providers.has(provider.key)) {
      throw new Error(`Model provider "${provider.key}" is already registered.`);
    }
    this.providers.set(provider.key, provider);
  }

  get(key: string): TextModelProvider {
    const provider = this.providers.get(key);
    if (!provider) throw new Error(`Model provider "${key}" is not registered.`);
    return provider;
  }

  list(): readonly string[] {
    return [...this.providers.keys()].sort();
  }
}
