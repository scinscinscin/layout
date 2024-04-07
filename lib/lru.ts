/**
 * The interface that caches must adhere to.
 * A default implementation is provided as an LRU
 */
export interface Cache<K, V> {
  get(key: K): Promise<V | undefined>;
  set(key: K, value: V, opts: { timeoutInMs: number }): Promise<void>;
  delete(key: K): Promise<void>;
}

/**
 * A Cache implementation that evicts least recently used items and supports timeouts
 */
export class LRU<K, V> implements Cache<K, V> {
  private cache = new Map<K, V>();
  private timeoutMap: Map<K, NodeJS.Timeout> = new Map();

  constructor(private readonly max = 10) {}

  async get(key: K) {
    let item = this.cache.get(key);
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  async set(key: K, val: V, opts: { timeoutInMs: number }) {
    // reset key
    if (this.cache.has(key)) this.delete(key);
    // already reached max size, remove least recently used item
    else if (this.cache.size === this.max) this.delete(this.first());

    this.cache.set(key, val);
    const timeoutCouner = setTimeout(() => {
      this.cache.delete(key);
      this.timeoutMap.delete(key);
    }, opts.timeoutInMs);

    this.timeoutMap.set(key, timeoutCouner);
  }

  async delete(key: K) {
    const timeoutCounter = this.timeoutMap.get(key);
    if (timeoutCounter !== undefined) {
      clearTimeout(timeoutCounter);
    }

    this.timeoutMap.delete(key);
    this.cache.delete(key);
  }

  first() {
    return this.cache.keys().next().value;
  }
}
