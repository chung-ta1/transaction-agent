import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force keychain off regardless of host platform so these tests are deterministic.
const ORIGINAL_ENV = process.env.TRANSACTION_AGENT_NO_KEYCHAIN;

beforeEach(() => {
  process.env.TRANSACTION_AGENT_NO_KEYCHAIN = "1";
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.TRANSACTION_AGENT_NO_KEYCHAIN;
  else process.env.TRANSACTION_AGENT_NO_KEYCHAIN = ORIGINAL_ENV;
});

describe("TokenCache (in-memory only)", () => {
  it("round-trips a token for one env", async () => {
    const { TokenCache } = await import("../../src/auth/TokenCache.js");
    const cache = new TokenCache();
    await cache.set("team1", { accessToken: "abc.def.ghi", email: "me@real.com" });
    await expect(cache.get("team1")).resolves.toEqual({
      accessToken: "abc.def.ghi",
      email: "me@real.com",
    });
  });

  it("keeps tokens per-env separate", async () => {
    const { TokenCache } = await import("../../src/auth/TokenCache.js");
    const cache = new TokenCache();
    await cache.set("team1", { accessToken: "t1" });
    await cache.set("play", { accessToken: "p1" });
    await expect(cache.get("team1")).resolves.toEqual({ accessToken: "t1" });
    await expect(cache.get("play")).resolves.toEqual({ accessToken: "p1" });
  });

  it("returns undefined for an env that was never set", async () => {
    const { TokenCache } = await import("../../src/auth/TokenCache.js");
    const cache = new TokenCache();
    await expect(cache.get("stage")).resolves.toBeUndefined();
  });

  it("clear() removes an env's token", async () => {
    const { TokenCache } = await import("../../src/auth/TokenCache.js");
    const cache = new TokenCache();
    await cache.set("team1", { accessToken: "t1" });
    await cache.clear("team1");
    await expect(cache.get("team1")).resolves.toBeUndefined();
  });
});
