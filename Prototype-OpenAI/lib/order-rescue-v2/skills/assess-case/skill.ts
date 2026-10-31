import { Agent, Runner, OpenAIProvider } from "@openai/agents";
import OpenAI from "openai";
import replays from "../../../../fixtures/v2/replay.json";
import { Assessment, stop, type PipelineState } from "../../models";
import { PROMPT, PROMPT_VERSION } from "./prompt";
import { score, RUBRIC_VERSION } from "../../confidence";
import { CONFIDENCE_MODEL, ConfidenceError } from "../../../order-rescue/confidence";
import type { RuntimeConfig } from "../../../order-rescue/pipeline";
export const RUNS_WHEN_HALTED=false;
export const MODEL="gpt-5.4-mini";
export function createAgent(model=MODEL){return new Agent({name:"order-rescue-v2-assessor",instructions:PROMPT,model,outputType:Assessment,tools:[],handoffs:[],modelSettings:{store:false}});}
export async function run(s:PipelineState,config:RuntimeConfig={}){
 s.model_info={mode:s.mode,prompt_version:PROMPT_VERSION,stage:s.stage,runtime:"OpenAI Agents SDK",api:"Responses API"};
 try {
  if(s.mode==="REPLAY"){
   const entry=(replays.cases as Record<string,any>)[s.run.case.case_id]?.[s.stage];
   if(!entry)throw new Error("replay_missing");
   s.assessment=Assessment.parse(structuredClone(entry));s.model_info.replay_source=replays.source;
  }else{
   const key=config.apiKey??process.env.OPENAI_API_KEY;if(!key)throw new Error("model_unavailable");
   const model=config.model??MODEL,client=new OpenAI({apiKey:key,maxRetries:0,timeout:30000});
   const runner=new Runner({modelProvider:new OpenAIProvider({openAIClient:client,useResponses:true}),tracingDisabled:true,traceIncludeSensitiveData:false});
   const output=await runner.run(createAgent(model),JSON.stringify(s.snapshot),{maxTurns:1,signal:AbortSignal.timeout(35000)});
   s.assessment=Assessment.parse(output.finalOutput);s.model_info.model=model;
   s.model_info.confidence_scoring={status:"pending",model:CONFIDENCE_MODEL,rubric_version:RUBRIC_VERSION};
   s.confidence_score=await score(client,s.snapshot,s.assessment);s.assessment.confidence=s.confidence_score.level;
   s.model_info.confidence_scoring.status="scored";
  }
 }catch(e){
  const code=e instanceof ConfidenceError?e.code:e instanceof Error&&e.message==="replay_missing"?"replay_missing":"model_unavailable";
  if(e instanceof ConfidenceError)s.model_info.confidence_scoring={status:"failed",code,model:CONFIDENCE_MODEL};
  s.assessment=null;s.confidence_score=undefined;stop(s,`AI:${code}`,"Không có đánh giá AI đã xác thực; chuyển Ops, không dùng kết quả thay thế.","ELIGIBLE");
 }
 return s;
}
