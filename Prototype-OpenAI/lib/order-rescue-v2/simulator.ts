import type { RuntimeConfig } from "../server-runtime";
import { loadCase, caseIds } from "./fixtures";
import controls from "../../fixtures/v2/controls.json";
import { policyOnly, type Decision, type RunState, type RawCase, type PipelineState } from "./models";
import { runPipeline } from "./pipeline";
export class TransitionError extends Error {constructor(public code:"invalid_reply"|"not_waiting"|"question_mismatch"|"event_conflict"|"live_required"|"finalized"){super(code);}}
export class Simulator {
 runs=new Map<string,RunState>();decisions=new Map<string,Decision[]>();
 constructor(public mode:"REPLAY"|"LIVE_AI"="REPLAY",private runtime:RuntimeConfig={}){}
 listCases(){return caseIds.map(case_id=>{const c=loadCase(case_id);return {case_id,title:String(c.input.failed_event.status).replaceAll("_"," ").toLowerCase(),group:controls.find(c=>c.case_id===case_id)!.group};});}
 async start(id:string,override?:RawCase):Promise<[RunState,Decision]>{
  const c=override??loadCase(id),r:RunState={contract_version:"2.2",run_id:`${id}-${crypto.randomUUID().slice(0,8)}`,case:c,input:structuredClone(c.input),now:new Date(c.input.failed_event.as_of).toISOString(),applied:[],current_status:"NEW",question_wait_state:null,initial_assessment:null,initial_policy_output:null,after_reply_assessment:null,after_reply_policy_output:null,final_assessment_source:null,final_assessment:null,final_policy_output:null,final_event:null};
  this.runs.set(r.run_id,r);this.decisions.set(r.run_id,[]);
  const d=await this.assess(r,"INITIAL","START");r.initial_assessment=structuredClone(d.agent);r.initial_policy_output=policyOnly(d);
  if(d.question_text&&d.agent?.question_key){r.question_wait_state={question_id:`${r.run_id}-Q1`,question_key:d.agent.question_key,question_text:d.question_text,status:"PENDING",asked_at:r.now};r.current_status="WAITING_FOR_BUYER";}
  else this.finalize(r,1);
  return [r,d];
 }
 history(id:string){return this.decisions.get(id)!;}
 async recordBuyerReply(id:string,text:string,eventId:string,questionId:string,useLive=false):Promise<Decision|null>{
  const r=this.runs.get(id)!,reply=text.trim();
  if(!reply||reply.length>2000)throw new TransitionError("invalid_reply");
  if(r.final_event&&r.final_event.event_id===eventId&&r.question_wait_state?.question_id!==questionId)throw new TransitionError("event_conflict");
  if(r.final_event){if(r.final_event.event_id===eventId&&r.final_event.type==="BUYER_REPLY"&&r.final_event.text===reply)return null;if(r.final_event.event_id===eventId)throw new TransitionError("event_conflict");throw new TransitionError("finalized");}
  this.pending(r,questionId);
  const sample=controls.find(c=>c.case_id===r.case.case_id)!.buyer_reply;
  if(this.mode==="REPLAY"&&reply!==sample&&!useLive)throw new TransitionError("live_required");
  if(useLive)this.mode="LIVE_AI";
  r.question_wait_state!.status="ANSWERED";
  r.applied.push({source_ref:`${r.case.case_id}-REPLY`,phase:"RUNTIME",source_type:"BUYER_REPLY",actor:"buyer_recorded_by_staff",occurred_at:r.now,content:{text:reply,question_id:questionId,event_id:eventId}});
  const d=await this.assess(r,"AFTER_REPLY",`${r.case.case_id}-REPLY`);
  r.after_reply_assessment=structuredClone(d.agent);r.after_reply_policy_output=policyOnly(d);r.question_wait_state!.status="ANSWERED";
  r.final_event={event_id:eventId,type:"BUYER_REPLY",text:reply};this.finalize(r,2);return d;
 }
 noReply(id:string,eventId:string,questionId:string):Decision|null {
  const r=this.runs.get(id)!;
  if(r.final_event&&r.final_event.event_id===eventId&&r.question_wait_state?.question_id!==questionId)throw new TransitionError("event_conflict");
  if(r.final_event){if(r.final_event.event_id===eventId&&r.final_event.type==="USER_NO_REPLY")return null;if(r.final_event.event_id===eventId)throw new TransitionError("event_conflict");throw new TransitionError("finalized");}
  this.pending(r,questionId);r.question_wait_state!.status="NO_REPLY";r.final_event={event_id:eventId,type:"USER_NO_REPLY"};this.finalize(r,1);
  const initial=this.history(id)[0],d:Decision={...structuredClone(initial),decision_id:crypto.randomUUID(),trigger:"USER_NO_REPLY",record_status:"FINAL",question_text:null,skills_run:["audit-log"],model_info:{...structuredClone(initial.model_info),final_selection:{source:1,new_assessment:false,control:"USER_NO_REPLY"}}};
  this.decisions.get(id)!.push(d);return d;
 }
 private pending(r:RunState,questionId:string){if(r.current_status!=="WAITING_FOR_BUYER"||r.question_wait_state?.status!=="PENDING")throw new TransitionError("not_waiting");if(r.question_wait_state.question_id!==questionId)throw new TransitionError("question_mismatch");}
 private finalize(r:RunState,source:1|2){r.current_status="COMPLETED";r.final_assessment_source=source;r.final_assessment=structuredClone(source===1?r.initial_assessment:r.after_reply_assessment);r.final_policy_output=structuredClone(source===1?r.initial_policy_output:r.after_reply_policy_output);}
 private async assess(r:RunState,stage:PipelineState["stage"],trigger:string){
  const initial:PipelineState={run:structuredClone(r),mode:this.mode,stage,trigger,snapshot:null,source_index:{},assessment:null,result:null,rules:[],issues:[],model_info:{},halted:false,trace:[],decision:null,execution_id:crypto.randomUUID()};
  const result=await runPipeline(initial,this.runtime),decision=result.decision!;this.decisions.get(r.run_id)!.push(decision);return decision;
 }
}
