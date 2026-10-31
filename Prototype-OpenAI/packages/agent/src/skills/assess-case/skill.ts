import { Agent, Runner, OpenAIProvider } from "@openai/agents";
import { Assessment, stop, type PipelineState } from "../../models";
import { PROMPT, PROMPT_VERSION } from "./prompt";
import { score, RUBRIC_VERSION } from "../../decisions/confidence";
import { CONFIDENCE_MODEL, ConfidenceError } from "../../decisions/confidence-contract";
import type { RuntimeConfig } from "../../ports/runtime";
import { runAgentAssessment } from "../../runtime/agent-runtime";
import { classifyAgentFailure } from "../../decisions/request";
import { hashJson } from "../../runtime/recovery";
export const RUNS_WHEN_HALTED=false;
export const MODEL="gpt-6-sol";
export const LEGACY_MODEL="gpt-5.4-mini";
export function createAgent(model=MODEL){return new Agent({name:"order-rescue-v2-assessor",instructions:PROMPT,model,outputType:Assessment,tools:[],handoffs:[],modelSettings:{store:false}});}
export async function run(s:PipelineState,config:RuntimeConfig={}){
 s.model_info={mode:s.mode,prompt_version:PROMPT_VERSION,stage:s.stage,runtime:"OpenAI Agents SDK",api:"Responses API"};
 try {
  if(s.mode==="REPLAY"){
   const replay=config.replayAssessment?.(s.run.case.case_id,s.stage);
   const entry=replay?.assessment;
   if(!entry)throw new Error("replay_missing");
   s.assessment=Assessment.parse(structuredClone(entry));s.model_info.replay_source=replay?.source;
  }else{
   const client=config.openAIClient;if(!client)throw new Error("model_unavailable");
   if(config.agentRuntime==="AGENTS_API"){
    const model=config.model??MODEL;
    s.model_info={mode:s.mode,prompt_version:PROMPT_VERSION,stage:s.stage,runtime:"OpenAI Agents API",api:"Agents API sessions"};
    await runAgentAssessment(s,client,{
     model,sessionId:s.run.agent_session_id,
     timeoutMs:config.agentTimeoutMs,
     signal:config.assessmentSignal,
     maxToolCalls:config.maxAgentToolCalls,
     ...(config.agentSessions?{sessions:config.agentSessions}:{}),
     ...(config.onAgentSessionCreated?{onSessionCreated:(sessionId,environmentId)=>config.onAgentSessionCreated!(s.run.run_id,sessionId,environmentId)}:{}),
     ...(config.onAgentTurnStarted?{onTurnStarted:(turnId)=>config.onAgentTurnStarted!(s.run.run_id,turnId)}:{}),
     ...(config.onAgentToolResult?{onToolResult:(entry)=>config.onAgentToolResult!(s.run.run_id,entry)}:{}),
     ...(config.onAgentRemoteCancel?{onRemoteCancel:(status)=>config.onAgentRemoteCancel!(s.run.run_id,status)}:{}),
    });
   }else{
    const model=config.model??LEGACY_MODEL;
    const runner=new Runner({modelProvider:new OpenAIProvider({openAIClient:client,useResponses:true}),tracingDisabled:true,traceIncludeSensitiveData:false});
    const timeout=AbortSignal.timeout(35000),signal=config.assessmentSignal?AbortSignal.any([config.assessmentSignal,timeout]):timeout;
    const output=await runner.run(createAgent(model),JSON.stringify(s.snapshot),{maxTurns:1,signal});
    s.assessment=Assessment.parse(output.finalOutput);s.model_info.model=model;
    s.model_info.confidence_scoring={status:"pending",model:CONFIDENCE_MODEL,rubric_version:RUBRIC_VERSION};
    const snapshotHash=await hashJson(s.snapshot),requestContext={execution_id:s.execution_id,snapshot_hash:snapshotHash,phase:s.stage,signal:config.assessmentSignal,
     onAttempt:async(entry:import("../../models").AgentToolLedgerEntry)=>{s.run.agent_tool_ledger??=[];const index=s.run.agent_tool_ledger.findIndex(item=>item.attempt_id===entry.attempt_id);if(index<0)s.run.agent_tool_ledger.push(entry);else s.run.agent_tool_ledger[index]=entry;await config.onAgentToolResult?.(s.run.run_id,entry);}};
    s.confidence_score=await score(client,s.snapshot,s.assessment,requestContext);s.assessment.confidence=s.confidence_score.level;
    s.model_info.confidence_scoring.status="scored";
   }
  }
 }catch(e){
  if(config.assessmentSignal?.aborted)throw e;
  const code=e instanceof ConfidenceError?e.code:e instanceof Error&&e.message==="replay_missing"?"replay_missing":"model_unavailable";
  if(e instanceof ConfidenceError)s.model_info.confidence_scoring={status:"failed",code,model:CONFIDENCE_MODEL};
  if(s.mode==="LIVE_AI"&&config.agentRuntime==="AGENTS_API"){
   s.assessment=null;s.confidence_score=undefined;
   s.agent_execution={model:config.model??MODEL,session_id:s.agent_session_id??"",turn_id:s.agent_turn_id??null,environment_id:s.agent_environment_id??null,tool_calls:[],event_ids:[],usage:null,decision_requests:s.agent_decisions?3:0,skill_names:[],status:"FAILED"};
   s.model_info={...s.model_info,runtime:"OpenAI Agents API",api:"Agents API sessions",agent_execution:s.agent_execution};
   s.run.agent_session_status="FAILED";
   const category=classifyAgentFailure(e);
   s.agent_execution.failure_category=category;
   stop(s,`AI:agents_api_${category}`,"Agent assessment could not be validated; Ops review is required.","UNKNOWN","ESCALATED");
  }else{
   s.assessment=null;s.confidence_score=undefined;stop(s,`AI:${code}`,"Không có đánh giá AI đã xác thực; chuyển Ops, không dùng kết quả thay thế.","ELIGIBLE");
  }
 }
 if(s.mode==="LIVE_AI"&&config.agentRuntime==="AGENTS_API"&&s.assessment)s.run.agent_session_status="IDLE";
 return s;
}
