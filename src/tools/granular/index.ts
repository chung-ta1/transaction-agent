import type { Tool } from "../Tool.js";
import { initializeDraft, setTransactionOwner } from "./init.js";
import { updateLocation, updatePriceAndDates } from "./location.js";
import {
  addCoAgent,
  addOtherSideAgent,
  addTransactionCoordinator,
  setOwnerAgentInfo,
  updateBuyerSeller,
} from "./participants.js";
import { addExternalReferral, addInternalReferral, uploadReferralW9 } from "./referral.js";
import {
  addCommissionPayerParticipant,
  setCommissionPayer,
  setCommissionSplits,
  setOpcity,
} from "./commission.js";
import {
  updateAdditionalFeesInfo,
  updateFmlsInfo,
  updatePersonalDealInfo,
  updateTitleInfo,
} from "./finalize.js";
import { getDraft } from "./read.js";
import { searchAgentByName } from "./search.js";
import { verifyDraftSplits } from "./verify_draft_splits.js";

export const granularTools: Tool[] = [
  // search
  searchAgentByName,
  // create / owner
  initializeDraft,
  setTransactionOwner,
  // location + price
  updateLocation,
  updatePriceAndDates,
  // participants
  updateBuyerSeller,
  setOwnerAgentInfo,
  addCoAgent,
  addOtherSideAgent,
  addTransactionCoordinator,
  // referral
  addInternalReferral,
  addExternalReferral,
  uploadReferralW9,
  // commission
  setOpcity,
  setCommissionSplits,
  verifyDraftSplits,
  addCommissionPayerParticipant,
  setCommissionPayer,
  // finalize
  updatePersonalDealInfo,
  updateAdditionalFeesInfo,
  updateTitleInfo,
  updateFmlsInfo,
  // read
  getDraft,
];
