import { isDeepStrictEqual } from "node:util";
import { Simulator } from "./simulator";
import { scenarios } from "./evaluator";
let passed=0;
for(const fixture of scenarios){
 const sim=new Simulator(),[r]=await sim.start(fixture.case_id);
 const mode=fixture.simulation.response_mode;
 if(mode==="BUYER_REPLY")await sim.recordBuyerReply(r.run_id,fixture.simulation.buyer_reply!,crypto.randomUUID(),r.question_wait_state!.question_id);
 else if(mode==="USER_NO_REPLY")sim.noReply(r.run_id,crypto.randomUUID(),r.question_wait_state!.question_id);
 const expected=fixture.expected;
 const ok=isDeepStrictEqual(r.final_assessment,expected.final_assessment)&&r.final_policy_output?.final_action===expected.final_policy_output.final_action&&r.final_policy_output?.policy_gate===expected.final_policy_output.policy_gate&&r.final_assessment_source===expected.final_assessment_source&&Boolean(r.question_wait_state)===(mode!=="NOT_ASKED");
 if(ok)passed++;console.log(`${ok?"✓":"✗"} ${fixture.case_id} · ${r.final_policy_output?.final_action} · selected ${r.final_assessment_source}`);
}
console.log(`${passed}/30 supplied user-reviewed v2.5 scenarios match. This checks synthetic replay behavior, not model accuracy.`);
if(passed!==30)process.exitCode=1;
