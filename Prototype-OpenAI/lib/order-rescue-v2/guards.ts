import { normalize, ms, stop, type PipelineState } from "./models";
import { profile } from "./fixtures";
import { sourceText } from "../order-rescue/models";
export function check(s:PipelineState){
 const {input,now}=s.run,ctx=input.operational_context;
 if(!input.case_id||!Number.isInteger(input.attempts_used)||input.attempts_used<0||!input.failed_event?.status||!Number.isFinite(ms(now))){stop(s,"INPUT_INVALID","Dữ liệu đầu vào không hợp lệ; Ops cần kiểm tra.");return;}
 if(ctx.pii_quarantined){stop(s,"PII_BLOCKED","Dữ liệu chưa được làm sạch; dừng đánh giá.","UNKNOWN","BLOCKED");return;}
 if(ctx.duplicate_trigger||ctx.latest_status==="DELIVERED"){stop(s,"STALE_TRIGGER","Sự kiện trùng hoặc không còn phù hợp; không tạo đánh giá mới.");return;}
 if(["STARTED","COMPLETED"].includes(input.return_state)){stop(s,"RETURN_BLOCKED","Đơn đã bắt đầu hoàn; chuyển Ops xem xét.","INELIGIBLE","BLOCKED");return;}
 if(input.return_state!=="NOT_STARTED"||!input.deadline||!Number.isFinite(ms(input.deadline))){stop(s,"LIFECYCLE_UNKNOWN","Thiếu trạng thái hoàn hoặc hạn xử lý đã xác minh; chuyển Ops.");return;}
 if(ms(now)>=ms(input.deadline)){stop(s,"DEADLINE_EXPIRED","Đã hết hạn xử lý; không đề xuất giao lại.","INELIGIBLE","BLOCKED");return;}
 if(input.attempts_used>=profile.maximum_attempts){stop(s,"ATTEMPTS_EXHAUSTED","Đã dùng hết số lần giao theo cấu hình demo.","INELIGIBLE","BLOCKED");return;}
 const raw=[...s.run.case.sources,...s.run.applied].map(sourceText).join("\n");
 if(/(?:\+?84|0)[0-9 .-]{8,13}[0-9]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)){stop(s,"PII_BLOCKED","Nguồn có thông tin liên hệ chưa được làm sạch; chuyển Ops.","UNKNOWN","BLOCKED");return;}
 const text=normalize(raw);
 if(/ignore (all |previous |system )*instructions|system prompt|api.?key|bo qua.*(quy tac|chi dan|huong dan)|bypass.*policy/.test(text)||ctx.untrusted_note_flag){stop(s,"UNTRUSTED_INSTRUCTION","Nguồn dữ liệu chứa chỉ dẫn không đáng tin; chuyển Ops.","ELIGIBLE");return;}
 s.result??={eligibility:"ELIGIBLE",policy_gate:"PERMITTED",final_action:"NO_ACTION",reason:""};
}
export function activeDisruption(s:PipelineState){const d=s.run.input.operational_context.disruption;return !!d&&d.verification==="VERIFIED"&&d.status==="ACTIVE"&&d.route_match===true&&d.time_match===true;}
/** Conservative source checks supplement model findings; they never authorize logistics execution. */
export function buyerFacts(s:PipelineState){
 const text=normalize(s.run.applied.filter(x=>x.source_type==="BUYER_REPLY").map(sourceText).join(" "));
 return {
  declined:/khong (?:con )?muon nhan|khong con nhu cau|do not want|don.t want|refuse (?:the|this)/.test(text),
  unsupported:/doi dia chi|doi dia diem|giao (?:qua|sang|den) (?:cho|dia chi) khac|chuyen.*dia chi|hoan tien|refund|dispatch|change.*address/.test(text),
  afterDeadline:/sau han|only after (?:the )?deadline/.test(text),
 };
}
