export class BoundedTtlStore<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly maxEntries: number) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("BoundedTtlStore maxEntries must be a positive integer.");
    }
  }

  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, expiresAt: number, now = Date.now()) {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      for (const [candidate, entry] of this.entries) {
        if (entry.expiresAt <= now) this.entries.delete(candidate);
      }
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt });
  }

  delete(key: string) {
    return this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }
}
