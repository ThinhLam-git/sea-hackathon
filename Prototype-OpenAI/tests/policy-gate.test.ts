import { describe, expect, it } from "vitest";
import { run as runPolicy } from "../lib/order-rescue-v2/skills/policy-gate/skill";
import { loadCase } from "../lib/order-rescue-v2/fixtures";
import type { BuyerInterpretation } from "../lib/order-rescue-v2/agents/business-facts";

function retryState(caseId: string, facts: Partial<BuyerInterpretation>, text = "Buyer reply recorded.") {
  const raw=loadCase(caseId),ref=`${caseId}-REPLY`,reply={source_ref:ref,phase:"RUNTIME" as const,source_type:"BUYER_REPLY" as const,actor:"buyer_recorded_by_staff",occurred_at:raw.input.failed_event.as_of,content:{text,question_id:"q1",event_id:"event1"}};
  const unknown={state:"UNKNOWN" as const,citations:[]};
  const resolved:BuyerInterpretation={intent:unknown,availability:unknown,cod_readiness:unknown,address_change:unknown,after_deadline:unknown,...facts};
  return {run:{run_id:caseId,case:raw,input:raw.input,now:raw.input.failed_event.as_of,applied:[reply],question_wait_state:{question_id:"q1",question_key:"CONFIRM_INTENT",status:"ANSWERED",question_text:"Confirm.",asked_at:raw.input.failed_event.as_of}},mode:"LIVE_AI",stage:"AFTER_REPLY",trigger:ref,snapshot:{},source_index:{},assessment:{evidence:[{source_ref:ref,fact:"Buyer reply.",verification:"DIRECT_BUYER_STATEMENT"}],hypothesis:"AVAILABILITY_ISSUE",confidence:"MEDIUM",missing_info:[],question_key:"CONFIRM_INTENT",candidate_action:"STANDARD_REATTEMPT"},semantic_facts:resolved,result:null,rules:[],issues:[],model_info:{},halted:false,trace:[],decision:null,execution_id:"exec",policy_checked:false} as any;
}

describe("policy gate application", () => {
  it("does not rerun a policy result already recorded before an agent clarification tool", () => {
    const state: any = {
      policy_checked: true,
      halted: false,
      result: { eligibility: "ELIGIBLE", policy_gate: "PERMITTED", final_action: "CLARIFY", reason: "approved" },
      rules: ["ONE_QUESTION"],
    };
    expect(runPolicy(state)).toBe(state);
    expect(state.rules).toEqual(["ONE_QUESTION"]);
    expect(state.result.reason).toBe("approved");
  });

  it("does not retry on intent alone or conditional availability", () => {
    const state=retryState("DEMO-001",{intent:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I still want it"}]},availability:{state:"CONDITIONAL",citations:[{source_ref:"DEMO-001-REPLY",quote:"tomorrow nobody can receive"}]}});
    runPolicy(state);expect(state.result.final_action).toBe("ESCALATE_REVIEW");expect(state.rules).toContain("RETRY_REQUIREMENTS");
  });

  it("permits a clear arrangement at the registered address when required facts are direct", () => {
    const state=retryState("DEMO-001",{
      intent:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I still want it"}]},
      availability:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"tomorrow at the registered address"}]},
      address_change:{state:"NO",citations:[{source_ref:"DEMO-001-REPLY",quote:"same address"}]},
    });
    runPolicy(state);expect(state.result.final_action).toBe("STANDARD_REATTEMPT");expect(state.result.policy_gate).toBe("PERMITTED");
  });

  it("requires COD readiness and sends an actual address-change request to Ops", () => {
    const cod=retryState("DEMO-016",{intent:{state:"YES",citations:[{source_ref:"DEMO-016-REPLY",quote:"I still want it"}]},availability:{state:"YES",citations:[{source_ref:"DEMO-016-REPLY",quote:"tomorrow at home"}]}});
    runPolicy(cod);expect(cod.result.final_action).toBe("ESCALATE_REVIEW");expect(cod.rules).toContain("RETRY_REQUIREMENTS");
    const address=retryState("DEMO-001",{address_change:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"deliver to a different address"}]}});
    runPolicy(address);expect(address.result.final_action).toBe("ESCALATE_REVIEW");expect(address.rules).toContain("UNSUPPORTED_REQUEST");
  });

  it("keeps an active verified disruption in HOLD even when the buyer is ready", () => {
    const state=retryState("DEMO-026",{intent:{state:"YES",citations:[{source_ref:"DEMO-026-REPLY",quote:"I still want it"}]},availability:{state:"YES",citations:[{source_ref:"DEMO-026-REPLY",quote:"tomorrow at home"}]}});
    runPolicy(state);expect(state.result.final_action).toBe("HOLD_DISRUPTION");expect(state.rules).toContain("VERIFIED_DISRUPTION");
  });
});
