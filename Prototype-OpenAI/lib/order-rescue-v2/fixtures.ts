/** Server-only raw-input projection. This module never imports the evaluator/test file. */
import seed from "../../fixtures/v2/seed.json";
import type { RawCase, Source } from "./models";
export const profile=seed.demo_policy_profile;
const rows=seed.seed_data;
export function loadCase(id:string):RawCase {
 const rescue=rows.order_rescue.find(r=>r.case_id===id);
 if(!rescue)throw new Error("Unknown v2 case");
 const order=rows.fact_order.find(r=>r.order_id===rescue.order_id)!;
 const event=rows.fact_delivery_event.find(r=>r.event_id===rescue.failed_event_id)!;
 if(event.order_id!==order.order_id)throw new Error("Seed relationship mismatch");
 const context=structuredClone(order.operational_context) as Record<string,any>;
 const t0=rows.fact_rescue_interaction.filter(i=>i.case_id===id&&i.available_phase==="T0");
 if(t0.length)context.buyer_messages_t0=t0.map(i=>({source_ref:i.interaction_id,text:i.message_text,occurred_at:i.occurred_at}));
 const sources:Source[]=[
  {source_ref:event.event_id,phase:"T0",source_type:"FAILED_DELIVERY",actor:event.source_actor,occurred_at:event.event_time,content:structuredClone(event.raw_payload)},
  {source_ref:`${id}-NOTE`,phase:"T0",source_type:"COURIER_NOTE",actor:"courier",occurred_at:event.event_time,content:{text:event.courier_note}},
  ...t0.map(i=>({source_ref:i.interaction_id,phase:"T0" as const,source_type:"BUYER_MESSAGE",actor:i.source_actor,occurred_at:i.occurred_at,content:{text:i.message_text}})),
 ];
 for(const [ref,index] of Object.entries(seed.source_ref_index))if(ref.startsWith(id+"-")&&index.source_type==="OPS_CONTEXT"){
  const keys=(index as {keys?:string[]}).keys??[];
  sources.push({source_ref:ref,phase:"T0",source_type:"OPS_CONTEXT",actor:index.source_actor,occurred_at:rescue.as_of,content:Object.fromEntries(keys.map(k=>[k,context[k]]))});
 }
 return {case_id:id,input:{case_id:id,failed_event:{status:event.event_status,time:event.event_time,courier_note:event.courier_note,reported_reason:event.reported_reason,as_of:rescue.as_of},attempts_used:rescue.attempts_used,return_state:rescue.return_state as any,deadline:rescue.deadline_at,buyer_history:[],operational_context:context},sources};
}
export const caseIds=rows.order_rescue.map(r=>r.case_id);
