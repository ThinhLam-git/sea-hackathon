import { normalize, ms, stop, type PipelineState } from "./models";
import { profile } from "./fixtures";
import { sourceText } from "../order-rescue/models";
export function check(s:PipelineState){
 const {input,now}=s.run,ctx=input.operational_context;
 if(!input.case_id||!Number.isInteger(input.attempts_used)||input.attempts_used<0||!input.failed_event?.status||!Number.isFinite(ms(now))){stop(s,"INPUT_INVALID","Dữ liệu đầu vào không hợp lệ; Ops cần kiểm tra.");return;}
 if(!["RECIPIENT_UNAVAILABLE","ADDRESS_ISSUE","CONTACT_FAILED","DELIVERY_FAILED_OTHER","REFUSED"].includes(input.failed_event.status)||!["COD","PREPAID"].includes(ctx.payment)){
  stop(s,"INPUT_ENUM_UNKNOWN","Trạng thái giao hoặc phương thức thanh toán thiếu hay chưa được hỗ trợ; chuyển Ops xác minh.");return;
 }
 if(ctx.pii_quarantined){stop(s,"PII_BLOCKED","Dữ liệu chưa được làm sạch; dừng đánh giá.","UNKNOWN","BLOCKED");return;}
 if(ctx.duplicate_trigger||ctx.latest_status==="DELIVERED"){stop(s,"STALE_TRIGGER","Sự kiện trùng hoặc không còn phù hợp; không tạo đánh giá mới.");return;}
 if(["STARTED","COMPLETED"].includes(input.return_state)){stop(s,"RETURN_BLOCKED","Đơn đã bắt đầu hoàn; chuyển Ops xem xét.","INELIGIBLE","BLOCKED");return;}
 if(input.return_state!=="NOT_STARTED"||!input.deadline||!Number.isFinite(ms(input.deadline))){stop(s,"LIFECYCLE_UNKNOWN","Thiếu trạng thái hoàn hoặc hạn xử lý đã xác minh; chuyển Ops.");return;}
 if(ms(now)>=ms(input.deadline)){stop(s,"DEADLINE_EXPIRED","Đã hết hạn xử lý; không đề xuất giao lại.","INELIGIBLE","BLOCKED");return;}
 if(input.attempts_used>=profile.maximum_attempts){stop(s,"ATTEMPTS_EXHAUSTED","Đã dùng hết số lần giao theo cấu hình demo.","INELIGIBLE","BLOCKED");return;}
 // Lifecycle flags above are authoritative input. Text checks only inspect evidence
 // available at this assessment time, matching prepare-input's projection.
 const raw=[...s.run.case.sources,...s.run.applied].filter(source=>ms(source.occurred_at)<=ms(now)).map(sourceText).join("\n");
 if(/(?:\+?84|0)[0-9 .-]{8,13}[0-9]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw)){stop(s,"PII_BLOCKED","Nguồn có thông tin liên hệ chưa được làm sạch; chuyển Ops.","UNKNOWN","BLOCKED");return;}
 const text=normalize(raw);
 if(/ignore (all |previous |system )*instructions|system prompt|api.?key|bo qua.*(quy tac|chi dan|huong dan)|bypass.*policy/.test(text)||ctx.untrusted_note_flag){stop(s,"UNTRUSTED_INSTRUCTION","Nguồn dữ liệu chứa chỉ dẫn không đáng tin; chuyển Ops.","ELIGIBLE");return;}
 s.result??={eligibility:"ELIGIBLE",policy_gate:"PERMITTED",final_action:"NO_ACTION",reason:""};
}
export function activeDisruption(s:PipelineState){const d=s.run.input.operational_context.disruption;return !!d&&d.verification==="VERIFIED"&&d.status==="ACTIVE"&&d.route_match===true&&d.time_match===true;}
/** Conservative source checks supplement model findings; they never authorize logistics execution. */
export function buyerFacts(s:PipelineState){
 const cited=new Set(s.assessment?.evidence.filter(e=>e.verification==="DIRECT_BUYER_STATEMENT").map(e=>e.source_ref));
 const text=normalize(s.run.applied.filter(x=>x.source_type==="BUYER_REPLY"&&x.source_ref.startsWith(`${s.run.case.case_id}-`)&&cited.has(x.source_ref)&&!!s.source_index[x.source_ref]&&ms(x.occurred_at)<=ms(s.run.now)).map(sourceText).join(" "));
 const availabilityClauses=text.split(/[.!?;]/).filter(clause=>/(?:ngay )?mai|ngay lam viec toi|hom nay|tomorrow|next working day/.test(clause));
 const uncertainAvailability=availabilityClauses.some(clause=>/neu |\bif\b|khong|chua chac|chua biet|\bnot\b|cannot|can't|may |might /.test(clause));
 const uncertainCod=/(?:mai|tomorrow|hien|now).{0,25}(?:chua|khong|not).{0,15}(?:du|enough|ready)|(?:chua|khong).{0,10}san sang|neu .*?(?:tien|cod)|if .*?(?:money|cash|cod)/.test(text);
 const tomorrow=/\bmai\b|tomorrow/.test(text);
 const proposedTime=Date.parse(s.run.now)+(tomorrow?24*60*60*1000:0);
 return {
  intent:/van muon nhan|toi muon nhan|toi dong y nhan|still want (?:to receive|the parcel)|i want to receive|i agree to receive/.test(text),
  declined:/khong (?:con )?muon nhan|khong con nhu cau|do not want|don.t want|refuse (?:the|this)/.test(text),
  availability:!uncertainAvailability&&availabilityClauses.some(clause=>/(?:o nha|co nguoi.*nhan|xuong cong.*nhan duoc|at home|someone.*receive)/.test(clause)),
  cod:!uncertainCod&&/mai du (?:tien|cod)|da du (?:cod|tien)|tien cod.*da chuan bi|cod.*san sang|enough (?:cash|money)|cod.*ready/.test(text),
  unsupported:/doi dia chi|doi dia diem|giao (?:qua|sang|den) (?:cho|dia chi) khac|chuyen.*dia chi|hoan tien|refund|dispatch|change.*address/.test(text),
  afterDeadline:/sau han|only after (?:the )?deadline/.test(text)||(tomorrow&&!!s.run.input.deadline&&proposedTime>=ms(s.run.input.deadline)),
 };
}
