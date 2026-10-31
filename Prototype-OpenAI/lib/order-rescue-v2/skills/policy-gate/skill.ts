import { check, activeDisruption, buyerFacts } from "../../guards";
import { type PipelineState, type PolicyOutput } from "../../models";
export const RUNS_WHEN_HALTED=true;
export function run(s:PipelineState){
 if(s.halted)return s;check(s);if(s.halted)return s;
 const a=s.assessment!,facts=buyerFacts(s);
 function decide(action:PolicyOutput["final_action"],reason:string,rule:string,gate:PolicyOutput["policy_gate"]="PERMITTED"){
  s.result={eligibility:"ELIGIBLE",policy_gate:gate,final_action:action,reason};s.rules.push(rule);return s;
 }
 const review=(reason:string,rule:string)=>decide("ESCALATE_REVIEW",reason,rule,"ESCALATED");
 if(facts.unsupported)return review("Yêu cầu đổi địa điểm hoặc hành động ngoài MVP; Ops cần xác minh, không tự thay đổi đơn.","UNSUPPORTED_REQUEST");
 if(facts.declined)return review("Buyer trực tiếp cho biết không muốn nhận; chuyển Ops, không tự hoàn đơn.","BUYER_DECLINED");
 if(facts.afterDeadline)return review("Khả năng nhận được nêu sau hạn xử lý; cần Ops xem xét.","AVAILABILITY_AFTER_DEADLINE");
 if(s.run.input.operational_context.sources_conflict)return review("Có nguồn dữ liệu xung đột chưa được giải quyết; chuyển người duyệt.","SOURCE_CONFLICT");
 if(activeDisruption(s))return review("Gián đoạn vận hành đã xác minh còn active; chuyển Ops đánh giá lại, không hỏi buyer vì buyer không thể gỡ điều kiện này.","LOGISTICS_TO_OPS");
 if(a.hypothesis==="LOGISTICS_ISSUE"||a.missing_info.includes("LOGISTICS_VERIFICATION"))return review("Tình trạng logistics cần Ops xác minh; chuyển Ops ngay, không hỏi buyer xác minh vận hành.","LOGISTICS_UNVERIFIED");
 if(s.stage==="INITIAL"){
  if(a.candidate_action==="CLARIFY"&&a.question_key&&a.missing_info.length)return decide("CLARIFY","Cho phép một câu hỏi mô phỏng để làm rõ thông tin có thể đổi hướng xử lý.","ONE_QUESTION");
  if(a.candidate_action==="HOLD_DISRUPTION")return review("Không có gián đoạn đã xác minh phù hợp để cho phép HOLD.","LOGISTICS_UNVERIFIED");
  if(a.candidate_action!=="STANDARD_REATTEMPT")return review("Thiếu thông tin hoặc đề xuất cần người duyệt; chuyển Ops.","ASSESSMENT_REVIEW");
 }
 if(a.candidate_action==="STANDARD_REATTEMPT"){
  const refs=new Set(a.evidence.filter(e=>e.verification==="DIRECT_BUYER_STATEMENT").map(e=>e.source_ref));
  const direct=s.run.applied.some(x=>x.source_type==="BUYER_REPLY"&&refs.has(x.source_ref));
  const cod=s.run.input.operational_context.payment==="COD";
  if(!direct||!facts.intent||!facts.availability||a.missing_info.length||cod&&!facts.cod)return review("Chưa đủ xác nhận trực tiếp về ý định, khả năng nhận, thông tin giao hoặc COD; chuyển Ops, không tự hỏi lần hai.","RETRY_REQUIREMENTS");
  return decide("STANDARD_REATTEMPT","Buyer trực tiếp xác nhận muốn nhận, có người nhận và đủ thông tin cần thiết; đề xuất giao lại tiêu chuẩn để Ops xem xét.","STANDARD_RETRY");
 }
 return review("Phản hồi chưa giải quyết đủ thông tin hoặc còn ranh giới chính sách; cần Ops xem xét. Không phát sinh câu hỏi thứ hai.","ASSESSMENT_REVIEW");
}
