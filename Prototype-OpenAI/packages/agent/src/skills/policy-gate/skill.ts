import { check, activeDisruption, buyerFacts } from "../../policy/guards";
import { type PipelineState, type PolicyOutput } from "../../models";
export const RUNS_WHEN_HALTED=true;
export function run(s:PipelineState){
 if(s.halted||s.policy_checked)return s;check(s);if(s.halted){s.policy_checked=true;return s;}
 const a=s.assessment!,facts=buyerFacts(s);
 function decide(action:PolicyOutput["final_action"],reason:string,rule:string,gate:PolicyOutput["policy_gate"]="PERMITTED"){
  s.result={eligibility:"ELIGIBLE",policy_gate:gate,final_action:action,reason};s.rules.push(rule);s.policy_checked=true;return s;
 }
 const review=(reason:string,rule:string)=>decide("ESCALATE_REVIEW",reason,rule,"ESCALATED");
 if(facts.address_change.state==="YES")return review("Yêu cầu đổi địa điểm hoặc hành động ngoài MVP; Ops cần xác minh, không tự thay đổi đơn.","UNSUPPORTED_REQUEST");
 if(facts.intent.state==="NO")return review("Buyer trực tiếp cho biết không muốn nhận; chuyển Ops, không tự hoàn đơn.","BUYER_DECLINED");
 if(facts.after_deadline.state==="YES")return review("Khả năng nhận được nêu sau hạn xử lý; cần Ops xem xét.","AVAILABILITY_AFTER_DEADLINE");
 if(s.run.input.operational_context.sources_conflict)return review("Có nguồn dữ liệu xung đột chưa được giải quyết; chuyển người duyệt.","SOURCE_CONFLICT");
 if(activeDisruption(s))return decide("HOLD_DISRUPTION","Gián đoạn đã được Ops xác minh còn hoạt động và khớp tuyến/thời điểm; giữ đề xuất HOLD để Ops đánh giá lại. Buyer reply không gỡ gián đoạn.","VERIFIED_DISRUPTION");
 if(a.hypothesis==="LOGISTICS_ISSUE"&&s.stage==="AFTER_REPLY")return review("Chưa có xác minh Ops phù hợp cho nguyên nhân logistics; buyer reply không thay thế được.","LOGISTICS_UNVERIFIED");
 if(s.stage==="INITIAL"){
  if(a.candidate_action==="CLARIFY"&&a.question_key&&a.missing_info.length)return decide("CLARIFY","Cho phép một câu hỏi mô phỏng để làm rõ thông tin có thể đổi hướng xử lý.","ONE_QUESTION");
  if(a.candidate_action==="HOLD_DISRUPTION")return review("Không có gián đoạn đã xác minh phù hợp để cho phép HOLD.","LOGISTICS_UNVERIFIED");
  if(a.candidate_action!=="STANDARD_REATTEMPT")return review("Thiếu thông tin hoặc đề xuất cần người duyệt; chuyển Ops.","ASSESSMENT_REVIEW");
 }
 if(a.candidate_action==="STANDARD_REATTEMPT"){
  const requiredConflict=facts.intent.state==="CONFLICTING"||facts.availability.state==="CONFLICTING"||facts.address_change.state==="CONFLICTING"||facts.after_deadline.state==="CONFLICTING"||s.run.input.operational_context.payment==="COD"&&facts.cod_readiness.state==="CONFLICTING";
  if(requiredConflict)return review("Thông tin người mua có xung đột chưa được giải quyết về ý định, khả năng nhận, thời điểm, địa điểm hoặc COD; chuyển Ops xác minh.","SEMANTIC_CONFLICT");
  const conditionalLocation=facts.address_change.state==="CONDITIONAL"||facts.after_deadline.state==="CONDITIONAL";
  if(conditionalLocation)return review("Địa điểm, cách nhận hoặc thời điểm còn phụ thuộc điều kiện; Ops cần xác minh trước khi đề xuất giao lại.","SEMANTIC_CONDITIONAL");
  const refs=new Set(a.evidence.filter(e=>e.verification==="DIRECT_BUYER_STATEMENT").map(e=>e.source_ref));
  const direct=s.run.applied.some(x=>x.source_type==="BUYER_REPLY"&&refs.has(x.source_ref));
  const cod=s.run.input.operational_context.payment==="COD";
  if(!direct||facts.intent.state!=="YES"||facts.availability.state!=="YES"||a.missing_info.length||cod&&facts.cod_readiness.state!=="YES")return review("Chưa đủ xác nhận trực tiếp về ý định, khả năng nhận, thông tin giao hoặc COD; chuyển Ops, không tự hỏi lần hai.","RETRY_REQUIREMENTS");
  return decide("STANDARD_REATTEMPT","Buyer trực tiếp xác nhận muốn nhận, có người nhận và đủ thông tin cần thiết; đề xuất giao lại tiêu chuẩn để Ops xem xét.","STANDARD_RETRY");
 }
 return review("Phản hồi chưa giải quyết đủ thông tin hoặc còn ranh giới chính sách; cần Ops xem xét. Không phát sinh câu hỏi thứ hai.","ASSESSMENT_REVIEW");
}
