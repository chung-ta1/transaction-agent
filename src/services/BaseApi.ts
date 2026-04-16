import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { AuthService } from "../auth/AuthService.js";
import type { Env } from "../config.js";

/**
 * Shared axios wrapper. Handles:
 *   - attaching Bearer token (fetched lazily from AuthService)
 *   - 401 retry: invalidate the cached token, reopen the browser, retry once
 *   - consistent error shape for tool callers
 */
export class BaseApi {
  private readonly clients = new Map<Env, AxiosInstance>();

  constructor(
    private readonly auth: AuthService,
    private readonly baseUrlFor: (env: Env) => string,
  ) {}

  protected client(env: Env): AxiosInstance {
    let existing = this.clients.get(env);
    if (existing) return existing;

    const instance = axios.create({
      baseURL: this.baseUrlFor(env),
      timeout: 30_000,
      validateStatus: () => true, // we inspect status ourselves
    });
    this.clients.set(env, instance);
    return instance;
  }

  /**
   * Make a request with auth + 401 retry. Throws ApiError on non-2xx.
   */
  protected async request<T>(env: Env, config: AxiosRequestConfig): Promise<T> {
    const first = await this.attempt<T>(env, config, false);
    if (first.status !== 401) {
      return this.unwrap<T>(first);
    }
    // 401 → invalidate, fetch fresh, retry exactly once.
    await this.auth.invalidate(env);
    const retry = await this.attempt<T>(env, config, true);
    return this.unwrap<T>(retry);
  }

  private async attempt<T>(
    env: Env,
    config: AxiosRequestConfig,
    isRetry: boolean,
  ): Promise<AxiosResponse<T>> {
    const bearer = await this.auth.getBearer(env);
    const headers = {
      ...(config.headers ?? {}),
      Authorization: `Bearer ${bearer}`,
    };
    try {
      return await this.client(env).request<T>({ ...config, headers });
    } catch (err) {
      if (isRetry) throw err;
      throw err;
    }
  }

  private unwrap<T>(res: AxiosResponse<T>): T {
    if (res.status >= 200 && res.status < 300) {
      return res.data;
    }
    throw new ApiError(res.status, messageOf(res), res.data);
  }
}

function messageOf(res: AxiosResponse): string {
  const body = res.data;
  if (body == null) return `HTTP ${res.status}`;
  if (typeof body === "string") return body;
  if (typeof body === "object") {
    const bodyObj = body as Record<string, unknown>;
    const m = (bodyObj.message ?? bodyObj.error ?? bodyObj.detail) as string | undefined;
    if (m) return m;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return `HTTP ${res.status}`;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
