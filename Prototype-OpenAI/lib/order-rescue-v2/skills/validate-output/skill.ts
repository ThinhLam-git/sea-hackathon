import { stop, type PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=false;
export function run(s:PipelineState){
 const a=s.assessment!;
 for(const e of a.evidence){
  const source=s.source_index[e.source_ref];
  if(!source){stop(s,"AI:invalid_evidence_reference","AI dẫn nguồn không có trong dữ liệu hiện tại; chuyển Ops.","ELIGIBLE");break;}
  const expected=source.source_type==="COURIER_NOTE"?"UNVERIFIED_REPORT":source.source_type==="FAILED_DELIVERY"?"SOURCE_RECORD":["BUYER_MESSAGE","BUYER_REPLY"].includes(source.source_type)?"DIRECT_BUYER_STATEMENT":source.source_type==="OPS_CONTEXT"?"VERIFIED_OPS_SIGNAL":"UNVERIFIED_REPORT";
  if(e.verification!==expected){stop(s,"AI:invalid_verification","AI gán mức xác minh không khớp nguồn; chuyển Ops.","ELIGIBLE");break;}
  if(expected==="VERIFIED_OPS_SIGNAL"){
   const c=source.content,verified=c?.address_validation?.verification==="VERIFIED"||c?.disruption?.verification==="VERIFIED";
   if(!verified){stop(s,"AI:unverified_ops","Nguồn Ops chưa xác minh không thể hỗ trợ claim verified; chuyển Ops.","ELIGIBLE");break;}
  }
  if(/\b(?:guaranteed|guarantee delivery|refund completed|dispatched)\b|đã hoàn tiền|đã điều shipper/i.test(e.fact)){stop(s,"AI:unsupported_execution_claim","Kết quả chứa tuyên bố thực thi không được hỗ trợ; chuyển Ops.","ELIGIBLE");break;}
 }
 if(s.stage==="AFTER_REPLY"&&a.question_key!==s.run.question_wait_state?.question_key)stop(s,"AI:question_mismatch","Kết quả không khớp câu hỏi đã hỏi; chuyển Ops.","ELIGIBLE");
 if(s.halted){if(s.confidence_score){s.model_info.confidence_scoring={status:"invalidated",raw_result:s.confidence_score};s.confidence_score=undefined;}s.assessment=null;return s;}
 const confirmed=a.evidence.some(e=>["DIRECT_BUYER_STATEMENT","VERIFIED_OPS_SIGNAL"].includes(e.verification));
 const cap=a.hypothesis==="UNKNOWN_CAUSE"?"LOW":confirmed?"HIGH":"MEDIUM";
 const order=["LOW","MEDIUM","HIGH"];
 if(order.indexOf(a.confidence)>order.indexOf(cap)){s.issues.push(`confidence_capped:${a.confidence}->${cap}`);a.confidence=cap;}
 if(s.confidence_score){const limit={LOW:24,MEDIUM:74,HIGH:100}[a.confidence];s.confidence_score.score=Math.min(s.confidence_score.raw_score,limit);s.confidence_score.level=a.confidence;s.confidence_score.capped=s.confidence_score.score<s.confidence_score.raw_score;}
 return s;
}
