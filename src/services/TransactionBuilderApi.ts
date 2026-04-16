import FormData from "form-data";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { BaseApi } from "./BaseApi.js";
import type { AuthService } from "../auth/AuthService.js";
import { urlsFor, type Env } from "../config.js";
import type {
  AddParticipantRequest,
  AdditionalFees,
  AgentParticipantInfo,
  BuyerSeller,
  CommissionPayerInfo,
  CommissionSplit,
  FmlsInfo,
  LocationInfo,
  OwnerAgentInfo,
  PersonalDealInfo,
  PriceAndDates,
  TitleInfo,
} from "../types/schemas.js";

const BASE_PATH = "/api/v1/transaction-builder";

/**
 * Thin client over arrakis's TransactionBuilder REST surface. One method per
 * endpoint in the canonical 22-call sequence (see memory/transaction-rules.md
 * and plan). No business logic — tools call these.
 */
export class TransactionBuilderApi extends BaseApi {
  constructor(auth: AuthService) {
    super(auth, (env) => urlsFor(env).arrakis);
  }

  // ---------- create / fetch ----------
  initializeDraft(env: Env, type: "TRANSACTION" | "LISTING" = "TRANSACTION"): Promise<string> {
    return this.request<string>(env, {
      method: "POST",
      url: BASE_PATH,
      params: { type },
    });
  }

  getDraft(env: Env, id: string): Promise<unknown> {
    return this.request(env, { method: "GET", url: `${BASE_PATH}/${id}` });
  }

  // ---------- section writers ----------
  setTransactionOwner(env: Env, id: string, transactionOwnerId: string): Promise<unknown> {
    return this.request(env, {
      method: "PATCH",
      url: `${BASE_PATH}/${id}/transaction-owner`,
      headers: { "Content-Type": "application/json" },
      data: { transactionOwnerId },
    });
  }

  updateLocationInfo(env: Env, id: string, body: LocationInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/location-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  updatePriceAndDateInfo(env: Env, id: string, body: PriceAndDates): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/price-date-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  updateBuyerAndSellerInfo(env: Env, id: string, body: BuyerSeller): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/buyer-seller-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  updateOwnerAgentInfo(env: Env, id: string, body: OwnerAgentInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/owner-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  addCoAgent(env: Env, id: string, agent: AgentParticipantInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/co-agent`,
      headers: { "Content-Type": "application/json" },
      data: agent,
    });
  }

  /**
   * Internal referral (type=AGENT) takes JSON. External (type=EXTERNAL_ENTITY)
   * also works with JSON on this endpoint variant — the legacy multipart
   * `/referral-info` is deprecated.
   */
  addReferralInfo(env: Env, id: string, body: AddParticipantRequest): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/add-referral-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  async uploadReferralW9(env: Env, id: string, participantId: string, filePath: string): Promise<unknown> {
    const form = new FormData();
    form.append("file", await readFile(filePath), { filename: basename(filePath) });
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/referral-info/${participantId}/upload-w9`,
      headers: form.getHeaders(),
      data: form,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  /**
   * Multipart: creates a non-agent participant (OTHER_AGENT, TITLE, lawyers, ...).
   */
  async addOtherParticipant(
    env: Env,
    id: string,
    body: AddParticipantRequest,
  ): Promise<unknown> {
    const form = this.toFormData(body);
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/other-participants`,
      headers: form.getHeaders(),
      data: form,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  addTransactionCoordinator(env: Env, id: string, yentaId: string): Promise<unknown> {
    return this.request(env, {
      method: "POST",
      url: `${BASE_PATH}/${id}/transaction-coordinator/${yentaId}`,
    });
  }

  setOpcity(env: Env, id: string, opcity: boolean): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/opcity`,
      params: { opcity },
    });
  }

  updateCommissionSplits(env: Env, id: string, splits: CommissionSplit[]): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/commission-info`,
      headers: { "Content-Type": "application/json" },
      data: splits,
    });
  }

  updatePersonalDealInfo(env: Env, id: string, body: PersonalDealInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/personal-deal-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  updateAdditionalFees(env: Env, id: string, body: AdditionalFees): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/additional-fees-info`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  async setCommissionPayer(env: Env, id: string, body: CommissionPayerInfo): Promise<unknown> {
    const form = this.toFormData(body);
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/commission-payer`,
      headers: form.getHeaders(),
      data: form,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  updateTitleInfo(env: Env, id: string, body: TitleInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/title`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  updateFmlsInfo(env: Env, id: string, body: FmlsInfo): Promise<unknown> {
    return this.request(env, {
      method: "PUT",
      url: `${BASE_PATH}/${id}/fmls`,
      headers: { "Content-Type": "application/json" },
      data: body,
    });
  }

  /**
   * Flatten a record into FormData for Spring `@ModelAttribute` parsing.
   * Loads files from `w9FilePath` on the way in.
   */
  private async toFormDataAsync(body: Record<string, unknown>): Promise<FormData> {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      if (key === "w9FilePath" && typeof value === "string") {
        form.append("file", await readFile(value), { filename: basename(value) });
        continue;
      }
      form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    return form;
  }

  private toFormData(body: Record<string, unknown>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined || value === null) continue;
      if (key === "w9FilePath") continue; // handled separately via toFormDataAsync when needed
      form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    return form;
  }
}
