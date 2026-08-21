import { describe, expect, it } from "vitest";
import { BoundedTtlStore } from "@/lib/security/boundedTtlStore";

describe("BoundedTtlStore", () => {
  it("expires entries and never grows past its configured bound", () => {
    const store = new BoundedTtlStore<number>(2);
    store.set("expired", 1, 5, 0);
    store.set("active", 2, 100, 0);

    store.set("next", 3, 100, 10);

    expect(store.size).toBe(2);
    expect(store.get("expired", 10)).toBeUndefined();
    expect(store.get("active", 10)).toBe(2);
    expect(store.get("next", 10)).toBe(3);
  });

  it("evicts the oldest live key when every slot is active", () => {
    const store = new BoundedTtlStore<number>(2);
    store.set("oldest", 1, 100, 0);
    store.set("newer", 2, 100, 0);
    store.set("newest", 3, 100, 0);

    expect(store.size).toBe(2);
    expect(store.get("oldest", 1)).toBeUndefined();
    expect(store.get("newer", 1)).toBe(2);
    expect(store.get("newest", 1)).toBe(3);
  });
});
