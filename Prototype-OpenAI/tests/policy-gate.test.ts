import { describe, expect, it } from "vitest";
import { run as runPolicy } from "../packages/agent/src/skills/policy-gate/skill";
import { loadCase } from "../apps/web/lib/application/v2-workflow-data";
import type { BuyerInterpretation } from "../packages/agent/src/semantics/business-facts";

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

  it("escalates an unresolved location conflict instead of treating it as a negative", () => {
    const state=retryState("DEMO-001",{
      intent:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I still want it"}]},
      availability:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"tomorrow I can receive it"}]},
      address_change:{state:"CONFLICTING",citations:[
        {source_ref:"DEMO-001-REPLY",quote:"the registered location is correct"},
        {source_ref:"DEMO-001-REPLY",quote:"please use the other location"},
      ]},
    });
    runPolicy(state);
    expect(state.result.final_action).toBe("ESCALATE_REVIEW");
    expect(state.result.policy_gate).toBe("ESCALATED");
    expect(state.result.reason).toMatch(/conflict|xung đột/i);
    expect(state.rules).toContain("SEMANTIC_CONFLICT");
  });

  it("keeps negation and conditional meaning in model-assessed states", () => {
    const state=retryState("DEMO-001",{
      intent:{state:"NO",citations:[{source_ref:"DEMO-001-REPLY",quote:"I do not want it"}]},
      availability:{state:"CONDITIONAL",citations:[{source_ref:"DEMO-001-REPLY",quote:"if my sister gets home, she can receive it"}]},
    },"I do not want it. If my sister gets home, she can receive it.");
    runPolicy(state);
    expect(state.result.final_action).toBe("ESCALATE_REVIEW");
    expect(state.rules).toContain("BUYER_DECLINED");
  });

  it("does not let an irrelevant unknown fact block a fully supported non-COD retry", () => {
    const state=retryState("DEMO-001",{
      intent:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I still want it"}]},
      availability:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"tomorrow I can receive it"}]},
    });
    runPolicy(state);
    expect(state.result.final_action).toBe("STANDARD_REATTEMPT");
    expect(state.result.policy_gate).toBe("PERMITTED");
  });

  it("does not permit retry when required payment readiness is conditional", () => {
    const state=retryState("DEMO-016",{
      intent:{state:"YES",citations:[{source_ref:"DEMO-016-REPLY",quote:"I still want it"}]},
      availability:{state:"YES",citations:[{source_ref:"DEMO-016-REPLY",quote:"tomorrow I can receive it"}]},
      cod_readiness:{state:"CONDITIONAL",citations:[{source_ref:"DEMO-016-REPLY",quote:"if I can get cash tomorrow"}]},
    },"I still want it. Tomorrow I can receive it if I can get cash.");
    runPolicy(state);
    expect(state.result.final_action).toBe("ESCALATE_REVIEW");
    expect(state.rules).toContain("RETRY_REQUIREMENTS");
  });

  it("does not permit retry when receipt time is conditional on the handling deadline", () => {
    const state=retryState("DEMO-001",{
      intent:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I still want it"}]},
      availability:{state:"YES",citations:[{source_ref:"DEMO-001-REPLY",quote:"I can receive it"}]},
      after_deadline:{state:"CONDITIONAL",citations:[{source_ref:"DEMO-001-REPLY",quote:"only after the handling deadline"}]},
    });
    runPolicy(state);
    expect(state.result.final_action).toBe("ESCALATE_REVIEW");
    expect(state.rules).toContain("SEMANTIC_CONDITIONAL");
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
