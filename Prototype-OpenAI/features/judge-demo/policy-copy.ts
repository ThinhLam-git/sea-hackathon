import type {RunView} from "@/lib/order-rescue-v2/view";
import type {Language} from "./i18n";
type Decision=RunView["history"][number];
/** English explanations of code rules; raw Vietnamese policy notes remain available. */
const RULES:Record<string,string>={
 UNSUPPORTED_REQUEST:"The reply requests a location change or an action outside this MVP. Ops must verify it; no order changes are made.",
 BUYER_DECLINED:"The buyer directly declined the delivery. Refer to Ops; do not automatically return the parcel.",
 AVAILABILITY_AFTER_DEADLINE:"The stated receiving time is after the handling deadline. Ops review is required.",
 SOURCE_CONFLICT:"The available sources conflict. A person must resolve the discrepancy.",
 VERIFIED_DISRUPTION:"An active disruption has been verified for this route and time. Retain the hold for Ops review; a buyer reply cannot clear it.",
 LOGISTICS_UNVERIFIED:"The logistics issue needs a matching operational verification. A buyer reply does not replace it.",
 ONE_QUESTION:"One approved clarification question is permitted because the missing information could change handling.",
 ASSESSMENT_REVIEW:"The available information or proposed action needs human review. Do not ask a second question.",
 RETRY_REQUIREMENTS:"Direct confirmation of intent, availability, delivery information or relevant COD readiness is still insufficient. Ops must review it.",
 STANDARD_RETRY:"The buyer directly confirmed intent and receiving availability, and the required information passed policy checks. A standard retry is recommended for Ops review.",
};
export function policyReason(decision:Decision,language:Language){
 if(language==="vi")return decision.reason;
 if(decision.trigger==="USER_NO_REPLY")return "No reply was recorded. The initial assessment and policy outcome are retained without another AI call. Ops must review any unresolved information.";
 for(const rule of [...decision.rules].reverse())if(RULES[rule])return RULES[rule];
 return "The case requires Ops review under the current policy. Check the evidence, policy rules and original note before taking action.";
}
