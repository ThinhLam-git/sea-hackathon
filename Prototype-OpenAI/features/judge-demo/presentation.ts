import type { RunView } from "@/lib/order-rescue-v2/view";
const ACTIONS: Record<string, {title:string;tone:string;label:string}> = {
 CLARIFY:{title:"Làm rõ trước khi đề xuất giao lại",tone:"clarify",label:"Cần bổ sung thông tin"},
 STANDARD_REATTEMPT:{title:"Đề xuất giao lại tiêu chuẩn",tone:"retry",label:"Đủ điều kiện đề xuất"},
 HOLD_DISRUPTION:{title:"Tạm giữ vì gián đoạn vận hành",tone:"hold",label:"Cần đánh giá lại vận hành"},
 ESCALATE_REVIEW:{title:"Chuyển Ops xem xét",tone:"review",label:"Cần người xử lý"},
 NO_ACTION:{title:"Chưa đề xuất hành động mới",tone:"clarify",label:"Chờ xem xét"},
};
export function decisionPresentation(run:RunView) {
 const latest=run.history.at(-1)!;
 if(run.question.no_reply)return {
  title:"Chưa có phản hồi — Ops cần xem xét",tone:"review",label:"Giữ đánh giá ban đầu",
  guide:"Đã chọn không có phản hồi. Giữ nguyên đánh giá ban đầu; không hỏi thêm hoặc gọi AI lần nữa.",
 };
 const action=ACTIONS[latest.final_action]??ACTIONS.ESCALATE_REVIEW;
 return {...action,guide:run.lifecycle==="WAITING_FOR_BUYER"
  ?"Ghi lại đúng phản hồi của người mua, rồi đánh giá. Nếu không có phản hồi, chọn “Không có phản hồi”."
  :"Đề xuất đã chốt để Ops xem xét. Demo không gửi tin hoặc thực hiện hành động giao hàng."};
}
export function submissionUsesLive(run:RunView,text:string) {
 const sample=run.events.find(e=>e.type==="BUYER_REPLY"&&e.available&&!e.applied);
 return run.mode==="LIVE_AI"||text.trim()!==sample?.text.trim();
}
