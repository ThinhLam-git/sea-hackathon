import { Simulator } from "./simulator";
import { scenarios } from "./evaluator";
let passed=0;
for(const fixture of scenarios){
 const sim=new Simulator(),[r]=await sim.start(fixture.case_id),q=r.question_wait_state!.question_id;
 if(fixture.simulation.buyer_reply)await sim.recordBuyerReply(r.run_id,fixture.simulation.buyer_reply,crypto.randomUUID(),q);
 else sim.noReply(r.run_id,crypto.randomUUID(),q);
 const expected=fixture.expected,ok=JSON.stringify(r.final_assessment)===JSON.stringify(expected.final_assessment)&&r.final_policy_output?.final_action===expected.final_policy_output.final_action&&r.final_assessment_source===expected.final_assessment_source;
 if(ok)passed++;console.log(`${ok?'✓':'✗'} ${fixture.case_id} · ${r.final_policy_output?.final_action} · selected ${r.final_assessment_source}`);
}
console.log(`${passed}/30 supplied DRAFT v2.2 scenarios match. This checks synthetic behavior, not model accuracy.`);
if(passed!==30)process.exitCode=1;
