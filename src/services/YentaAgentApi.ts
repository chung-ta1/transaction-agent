import { BaseApi } from "./BaseApi.js";
import type { AuthService } from "../auth/AuthService.js";
import { urlsFor, type Env } from "../config.js";

export interface AgentCandidate {
  yentaId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  displayName?: string;
  officeId?: string;
  teamId?: string;
  country?: string;
}

/**
 * Minimal yenta client for agent lookup by name/email. The precise search
 * endpoint in yenta is a paginated search; we expose a thin shape the agent
 * cares about.
 */
export class YentaAgentApi extends BaseApi {
  constructor(auth: AuthService) {
    super(auth, (env) => urlsFor(env).yenta);
  }

  async searchAgents(env: Env, query: {
    firstName?: string;
    lastName?: string;
    email?: string;
    query?: string;
  }): Promise<AgentCandidate[]> {
    const searchString = [query.firstName, query.lastName].filter(Boolean).join(" ").trim();
    const params: Record<string, string | number | boolean> = {
      pageNumber: 0,
      pageSize: 10,
      sortBy: "createdAt",
      sortDirection: "DESC",
    };
    if (searchString) params.searchText = searchString;
    if (query.email) params.email = query.email;
    if (query.query && !searchString) params.searchText = query.query;

    const raw = await this.request<unknown>(env, {
      method: "GET",
      url: `/api/v1/agents/search/active`,
      params,
    });

    return normalize(raw);
  }

  async getMyself(env: Env): Promise<AgentCandidate | undefined> {
    const raw = await this.request<unknown>(env, {
      method: "GET",
      url: `/api/v1/users/myself`,
    });
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    const id = (r.id ?? r.yentaId) as string | undefined;
    if (!id) return undefined;
    return {
      yentaId: id,
      firstName: asString(r.firstName),
      lastName: asString(r.lastName),
      email: asString(r.emailAddress ?? r.email),
      displayName: asString(r.displayName ?? r.fullName),
    };
  }
}

function normalize(raw: unknown): AgentCandidate[] {
  if (!raw || typeof raw !== "object") return [];
  // yenta paginated response exposes `results` or `content` depending on version.
  const obj = raw as Record<string, unknown>;
  const list = (obj.results ?? obj.content ?? obj.items ?? []) as unknown[];
  if (!Array.isArray(list)) return [];
  return list.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      yentaId: asString(e.id ?? e.yentaId) ?? "",
      firstName: asString(e.firstName),
      lastName: asString(e.lastName),
      email: asString(e.emailAddress ?? e.email),
      displayName: asString(e.displayName ?? e.fullName),
      officeId: asString(e.officeId),
      teamId: asString(e.teamId),
      country: asString(e.country),
    };
  }).filter((a) => a.yentaId);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
