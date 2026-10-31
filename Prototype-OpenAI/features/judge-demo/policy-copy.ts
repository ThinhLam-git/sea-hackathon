import type {RunView} from "@/lib/order-rescue-v2/view";
import type {Language} from "./i18n";
type Decision=RunView["history"][number];
/** English explanations of code rules; raw Vietnamese policy notes remain available. */
const RULES:Record<string,string>={
 UNSUPPORTED_REQUEST:"The reply requests a location change or an action outside this MVP. Ops must verify it; no order changes are made.",
 BUYER_DECLINED:"The buyer directly declined the delivery. Refer to Ops; do not automatically return the parcel.",
 AVAILABILITY_AFTER_DEADLINE:"The stated receiving time is after the handling deadline. Ops review is required.",
 SOURCE_CONFLICT:"The available sources conflict. A person must resolve the discrepancy.",
 VERIFIED_DISRUPTION:"An active disruption has been verified for this route and time. Send the logistics issue to Ops without a buyer question; a buyer reply cannot clear it.",
 LOGISTICS_UNVERIFIED:"The logistics issue needs a matching operational verification. A buyer reply does not replace it.",
 ONE_QUESTION:"One approved clarification question is permitted because the missing information could change handling.",
 ASSESSMENT_REVIEW:"The available information or proposed action needs human review. Do not ask a second question.",
 RETRY_REQUIREMENTS:"Direct confirmation of intent, availability, delivery information or relevant COD readiness is still insufficient. Ops must review it.",
 STANDARD_RETRY:"The buyer directly confirmed intent and receiving availability, and the required information passed policy checks. A standard retry is recommended for Ops review.",
};
export function policyReason(decision:Decision,language:Language){
 if(language==="vi")return decision.reason;
 if(decision.trigger==="USER_NO_REPLY")return "No reply was recorded. The initial assessment is retained without another AI call. Final policy sends unresolved information to Ops review.";
 if(decision.rules.includes("ASSESSMENT_REVIEW")&&decision.agent?.missing_info.length){
  const names:Record<string,string>={CURRENT_BUYER_INTENT:"current intent to receive the order",RECEIVING_AVAILABILITY:"recipient availability",ADDRESS_CLARIFICATION:"delivery location details",CONTACT_CLARIFICATION:"contact channel details",COD_READINESS:"COD readiness",DELIVERY_ACCESS:"delivery access",LOGISTICS_VERIFICATION:"operations verification",CAUSE_CLARIFICATION:"the cause of the failed attempt"};
  return `The buyer reply still leaves ${decision.agent.missing_info.map(x=>names[x]??x).join(", ")} unconfirmed. Refer to Ops; do not ask a second question.`;
 }
 for(const rule of [...decision.rules].reverse())if(RULES[rule])return RULES[rule];
 return "The case requires Ops review under the current policy. Check the evidence, policy rules and original note before taking action.";
}
