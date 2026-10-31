import { assessWithHostedAgent, HostedAgentError, MODEL, type AgentAudit } from "../../hosted-agent";
import replays from "../../../../fixtures/v2/replay.json";
import { Assessment, stop, type PipelineState } from "../../models";
import { PROMPT_VERSION } from "./prompt";
import { score, RUBRIC_VERSION } from "../../confidence";
import { CONFIDENCE_MODEL, ConfidenceError } from "../../../order-rescue/confidence";
import type { RuntimeConfig } from "../../../server-runtime";
export const RUNS_WHEN_HALTED=false;
export { MODEL };
export async function run(s:PipelineState,config:RuntimeConfig={}){
 s.model_info={mode:s.mode,prompt_version:PROMPT_VERSION,stage:s.stage,runtime:s.mode==="REPLAY"?"Replay":"OpenAI hosted agent",api:s.mode==="REPLAY"?null:"Agents API"};
 try {
  if(s.mode==="REPLAY"){
   const entry=(replays.cases as Record<string,any>)[s.run.case.case_id]?.[s.stage];
   if(!entry)throw new Error("replay_missing");
   s.assessment=Assessment.parse(structuredClone(entry));s.model_info.replay_source=replays.source;
  }else{
   const key=config.apiKey??process.env.OPENAI_API_KEY;if(!key)throw new Error("model_unavailable");
   const model=config.model??MODEL;
   const audit:AgentAudit={status:"creating"};s.model_info.hosted_agent=audit;s.model_info.model=model;
   s.assessment=await assessWithHostedAgent(key,model,s.snapshot,audit,{run_id:s.run.run_id,stage:s.stage});
   s.model_info.confidence_scoring={status:"pending",model:CONFIDENCE_MODEL,rubric_version:RUBRIC_VERSION};
   s.confidence_score=await score(key,s.snapshot,s.assessment);s.assessment.confidence=s.confidence_score.level;
   s.model_info.confidence_scoring.status="scored";
  }
 }catch(e){
  const code=e instanceof ConfidenceError||e instanceof HostedAgentError?e.code:e instanceof Error&&e.message==="replay_missing"?"replay_missing":"model_unavailable";
  if(e instanceof ConfidenceError)s.model_info.confidence_scoring={status:"failed",code,model:CONFIDENCE_MODEL};
  s.assessment=null;s.confidence_score=undefined;stop(s,`AI:${code}`,"Không có đánh giá AI đã xác thực; chuyển Ops, không dùng kết quả thay thế.","ELIGIBLE");
 }
 return s;
}
