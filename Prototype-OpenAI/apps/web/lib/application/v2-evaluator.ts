/** Presenter/evaluator data only. Never import this into prepare-input or the live assessor. */
import tests from "../../../../fixtures/v2/test-cases.json";
export const scenarios=tests.test_cases;
export const expectedFor=(id:string)=>scenarios.find(c=>c.case_id===id)!;
export function comparison(id:string,actual:any){
 const expected=expectedFor(id).expected;
 if(actual.final_assessment_source===2&&!expected.after_reply_assessment)return [];
 const selected=actual.final_assessment_source===2?expected.after_reply_assessment:expected.initial_assessment;
 const policy=actual.final_assessment_source===2?expected.after_reply_policy_output:expected.initial_policy_output;
 return [
  ...["hypothesis","confidence","candidate_action"].map(field=>({field,expected:(selected as any)?.[field],actual:actual.agent?.[field],ok:actual.agent?.[field]===(selected as any)?.[field]})),
  ...["eligibility","policy_gate","final_action"].map(field=>({field,expected:(policy as any)?.[field],actual:actual[field],ok:actual[field]===(policy as any)?.[field]})),
 ];
}
