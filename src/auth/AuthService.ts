import { TokenCache, type CachedToken } from "./TokenCache.js";
import { runBrowserLogin } from "./BrowserLoginServer.js";
import type { Env } from "../config.js";

/**
 * Orchestrates: check cache → if miss, open the browser-login helper → cache
 * the result. Callers ask for a bearer for an env; this class handles the rest.
 *
 * On 401, callers invoke `invalidate(env)` and retry — the next `getBearer`
 * will re-open the browser, the OS password manager auto-fills, user presses
 * Enter, and we're back.
 */
export class AuthService {
  private readonly cache: TokenCache;
  private readonly inFlight = new Map<Env, Promise<CachedToken>>();

  constructor(cache?: TokenCache) {
    this.cache = cache ?? new TokenCache();
  }

  async getBearer(env: Env, prefillEmail?: string): Promise<string> {
    const token = await this.getCachedOrLogin(env, prefillEmail);
    return token.accessToken;
  }

  /**
   * Called by API clients on a 401. Drops the cached token; the next
   * `getBearer` call will trigger a fresh browser login.
   */
  async invalidate(env: Env): Promise<void> {
    await this.cache.clear(env);
  }

  private async getCachedOrLogin(env: Env, prefillEmail?: string): Promise<CachedToken> {
    const cached = await this.cache.get(env);
    if (cached) return cached;

    // De-dupe concurrent login requests for the same env.
    const pending = this.inFlight.get(env);
    if (pending) return pending;

    const login = runBrowserLogin(env, prefillEmail)
      .then(async (result) => {
        const token: CachedToken = {
          accessToken: result.accessToken,
          email: result.email,
        };
        await this.cache.set(env, token);
        return token;
      })
      .finally(() => {
        this.inFlight.delete(env);
      });

    this.inFlight.set(env, login);
    return login;
  }
}
