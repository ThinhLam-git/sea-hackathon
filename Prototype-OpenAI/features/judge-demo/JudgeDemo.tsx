"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Search, MessageCircle, ShieldCheck, UserRound, Check, ArrowRight, RotateCcw, LoaderCircle, FileText, Copy } from "lucide-react";
import type { RunView } from "@/lib/order-rescue-v2/view";
import "./judge.css";

const CASES = [
 {id:"DEMO-001",name:"Người mua đi làm",lesson:"Một phản hồi làm thay đổi đề xuất",short:"Làm rõ để giao lại"},
 {id:"DEMO-023",name:"Tuyến giao bị ngập",lesson:"Biết khi nào cần chuyển người xử lý",short:"Nhận diện giới hạn"},
];
const CAUSES:Record<string,string>={AVAILABILITY_ISSUE:"Chưa bố trí được người nhận",ADDRESS_ISSUE:"Thông tin điểm nhận chưa rõ",CONTACT_ISSUE:"Có trở ngại liên hệ",BUYER_INTENT_ISSUE:"Ý định nhận hàng chưa rõ",PAYMENT_ISSUE:"Có trở ngại thanh toán",LOGISTICS_ISSUE:"Gián đoạn vận hành giao hàng",UNKNOWN_CAUSE:"Chưa đủ dữ kiện xác định nguyên nhân"};
const GAPS:Record<string,string>={CURRENT_BUYER_INTENT:"Ý định nhận hàng",RECEIVING_AVAILABILITY:"Khả năng bố trí người nhận",ADDRESS_CLARIFICATION:"Thông tin điểm nhận",CONTACT_CLARIFICATION:"Kênh liên hệ",COD_READINESS:"Khả năng thanh toán COD",DELIVERY_ACCESS:"Lối tiếp cận điểm nhận",LOGISTICS_VERIFICATION:"Ops xác minh / đánh giá lại vận hành",CAUSE_CLARIFICATION:"Nguyên nhân giao thất bại"};
const LEVELS={LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao"};
const PROVENANCE:Record<string,string>={SOURCE_RECORD:"Sự kiện hệ thống",UNVERIFIED_REPORT:"Báo cáo chưa xác minh",DIRECT_BUYER_STATEMENT:"Người mua xác nhận",VERIFIED_OPS_SIGNAL:"Ops đã xác minh"};
async function api<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(`/api${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data:unknown=await response.json();if(!response.ok){const detail=data&&typeof data==="object"&&"detail" in data?String(data.detail):"Chưa thể tải demo. Hãy thử lại.";throw new Error(detail);}return data as T;
}
function text(content:Record<string,unknown>){return typeof content.text==="string"?content.text:"";}
export default function JudgeDemo(){
 const [run,setRun]=useState<RunView|null>(null),[caseId,setCaseId]=useState("DEMO-001"),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [sampleShown,setSampleShown]=useState(false),[copied,setCopied]=useState(false);
 const request=useRef<{runId:string;eventId:string}|null>(null);
 const alive=useRef(true);
 async function start(id:string){setCaseId(id);setBusy(true);setError("");setSampleShown(false);setCopied(false);setRun(null);request.current=null;
  try{const result=await api<RunView>("/runs",{case_id:id,mode:"REPLAY"});if(alive.current)setRun(result);}catch(e){if(alive.current)setError(e instanceof Error?e.message:"Không thể tải demo.");}finally{if(alive.current)setBusy(false);}}
 useEffect(()=>{alive.current=true;void start("DEMO-001");return()=>{alive.current=false;};},[]);
 const latest=run?.history.at(-1),assessment=latest?.agent;
 const waiting=run?.lifecycle==="WAITING_FOR_BUYER",finished=run?.lifecycle==="COMPLETED";
 const retry=latest?.final_action==="STANDARD_REATTEMPT";
 const question=run?.history.find(d=>d.question_text)?.question_text;
 const sample=run?.events.find(e=>e.type==="BUYER_REPLY"&&e.available&&!e.applied);
 const reply=run?.sources.findLast(s=>s.source_type==="BUYER_REPLY");
 const note=run?.sources.find(s=>s.source_type==="COURIER_NOTE");
 const disruption=run?.input.operational_context.disruption;
 const verifiedDisruption=disruption?.verification==="VERIFIED"&&disruption.status==="ACTIVE"&&disruption.route_match&&disruption.time_match;
 const activeCase=CASES.find(c=>c.id===caseId)!;
 const step=busy?1:waiting?2:3;
 const steps=[{name:"Giao thất bại",icon:Package},{name:"Agent đọc bằng chứng",icon:Search},{name:"Làm rõ nếu cần",icon:MessageCircle},{name:"Policy kiểm tra",icon:ShieldCheck},{name:"Ops quyết định",icon:UserRound}];
 async function respond(){if(!run||!sample||busy)return;setBusy(true);setError("");
  if(request.current?.runId!==run.run_id)request.current={runId:run.run_id,eventId:crypto.randomUUID()};
  try{setRun(await api<RunView>(`/runs/${run.run_id}/reply`,{text:sample.text,event_id:request.current.eventId,question_id:run.question.question_id,use_live:false}));}catch(e){setError(e instanceof Error?e.message:"Chưa lưu được phản hồi. Thử lại để tiếp tục.");}finally{setBusy(false);}}
 async function copy(){if(!latest||!run)return;try{await navigator.clipboard.writeText(`Order Rescue · ${run.case_id}\n${retry?"Đề xuất giao lại tiêu chuẩn":"Chuyển Ops xem xét"}\n${latest.reason}\nDữ liệu mô phỏng. Ops quyết định; chưa thực hiện hành động giao hàng.`);setCopied(true);}catch{setError("Trình duyệt chưa cho phép sao chép. Nội dung đề xuất vẫn hiển thị để bạn chọn và sao chép.");}}
 const signIn=error.toLowerCase().includes("sign in with chatgpt");
 const guide=busy?"Đang đọc dữ liệu và kiểm tra policy…":waiting?sampleShown?"Phản hồi mẫu đã sẵn sàng. Bấm “Đánh giá phản hồi” để xem đề xuất thay đổi.":"Agent cần làm rõ khả năng nhận hàng. Bấm “Xem phản hồi mẫu” để thử vai người mua.":retry?"Đề xuất đã chuyển từ làm rõ sang giao lại. Ops xem xét và quyết định bước xử lý thực tế.":"Gián đoạn thuộc vận hành. Agent chuyển Ops ngay, không hỏi người mua để gỡ một vấn đề họ không kiểm soát.";
 return <div className="judge-app">
  <header className="judge-header"><a href="/" className="judge-brand"><Package size={23}/>Order Rescue</a><span>Demo mô phỏng · dữ liệu giả lập</span><span className="judge-mode">Replay · không gọi AI live</span></header>
  <main className="judge-main">
   <div className="judge-title"><div><h1>Từ giao thất bại đến bước xử lý tiếp theo</h1><p>Agent tổng hợp bằng chứng và đề xuất. Policy kiểm tra điều kiện. Ops quyết định.</p></div><button className="judge-reset" disabled={busy} onClick={()=>start(caseId)}><RotateCcw size={15}/>Chạy lại</button></div>
   <nav className="judge-cases" aria-label="Hai tình huống demo">{CASES.map((c,i)=><button key={c.id} aria-pressed={caseId===c.id} disabled={busy} onClick={()=>start(c.id)}><span className="judge-case-index">{i+1}</span><span><strong>{c.name}</strong><small>{c.lesson}</small></span>{caseId===c.id&&<Check size={18}/>}</button>)}</nav>
   <ol className="judge-steps" aria-label="Luồng hoạt động của agent">{steps.map((s,i)=>{const Icon=s.icon,skip=i===2&&finished&&!run?.question.asked;return <li key={s.name} className={skip?"skip":i<step?"done":i===step?"active":""} aria-current={i===step?"step":undefined}><span>{i<step&&!skip?<Check size={17}/>:<Icon size={17}/>}</span><strong>{s.name}</strong><small>{skip?"Không cần hỏi":i===4?"Ngoài phạm vi demo":i===step?busy?"Đang xử lý":waiting?"Chờ bạn thử":"Đã có đề xuất":i<step?"Đã hoàn tất":""}</small></li>})}</ol>
   {error&&<div className="judge-error" role="alert"><p>{signIn?"Đăng nhập ChatGPT để bắt đầu demo và lưu lượt trải nghiệm của bạn.":error}</p>{signIn?<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Đăng nhập ChatGPT</a>:<button disabled={busy} onClick={()=>waiting?respond():start(caseId)}>Thử lại</button>}</div>}
   {!run?<div className="judge-loading" role="status">{busy?<><LoaderCircle className="spin"/>Đang chuẩn bị tình huống…</>:"Demo chưa tải được. Chọn Thử lại để tiếp tục."}</div>:<>
    <div className="judge-board" aria-busy={busy}>
     <section className="judge-panel judge-case-panel" aria-labelledby="case-title"><header><Package size={17}/><h2 id="case-title">Case giao thất bại</h2><span>{run.case_id}</span></header><div className="judge-panel-body">
      <h3>{activeCase.name}</h3><div className="judge-failed">Lần giao chưa thành công</div>
      {note&&<blockquote className="judge-note"><span>Ghi chú tài xế</span><p>{text(note.content)}</p><small>Báo cáo chưa xác minh</small></blockquote>}
      {verifiedDisruption&&<div className="judge-ops-signal"><ShieldCheck size={17}/><div><strong>Ops đã xác minh</strong><p>Gián đoạn còn hiệu lực, đúng tuyến và thời điểm. Cần đánh giá lại điều kiện vận hành.</p></div></div>}
      <dl className="judge-facts"><div><dt>Số lần đã giao</dt><dd>{run.input.attempts_used} / {run.limits.max_attempts}</dd></div><div><dt>Trạng thái hoàn</dt><dd>{run.input.return_state==="NOT_STARTED"?"Chưa bắt đầu":"Cần kiểm tra"}</dd></div><div><dt>Hạn xử lý mô phỏng</dt><dd>{new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(run.input.deadline!))}</dd></div></dl>
      <details className="judge-details"><summary>Bằng chứng agent đã sử dụng ({assessment?.evidence.length??0})</summary>{assessment?.evidence.map((e,i)=><article key={i}><strong>{PROVENANCE[e.verification]}</strong><p>{e.fact.startsWith("{")?"Tín hiệu vận hành có nguồn, dùng để kiểm tra đề xuất.":e.fact}</p><blockquote>{e.quote}</blockquote></article>)}</details>
      <p className="judge-footnote">Không có dữ liệu khách hàng thật hoặc tích hợp hãng vận chuyển.</p>
     </div></section>
     <section className={`judge-panel judge-agent-panel ${waiting?"is-current":""}`} aria-labelledby="agent-title"><header><Search size={17}/><h2 id="agent-title">Agent làm rõ</h2><span>{waiting?"Cần phản hồi":"Đã đánh giá"}</span></header><div className="judge-panel-body">
      <div className="judge-assessment"><span>Nhận định từ bằng chứng</span><h3>{assessment?CAUSES[assessment.hypothesis]:"Cần người xem xét"}</h3><small>Nhận định Replay dựng sẵn</small></div>
      {waiting&&assessment&&<div className="judge-gaps"><span>Còn thiếu</span><p>{assessment.missing_info.map(g=>GAPS[g]??g).join(" · ")}</p></div>}
      {question?<div className="judge-question"><span><MessageCircle size={14}/>Một câu hỏi làm rõ</span><p>{question}</p></div>:<div className="judge-no-contact"><ShieldCheck size={25}/><h3>Không hỏi người mua</h3><p>Tuyến giao cần Ops xử lý. Phản hồi của buyer không thể gỡ gián đoạn vận hành.</p></div>}
      {waiting&&sample&&<div className="judge-interaction">{!sampleShown?<button className="judge-primary" disabled={busy} onClick={()=>setSampleShown(true)}>Xem phản hồi mẫu<ArrowRight size={16}/></button>:<><blockquote className="judge-buyer"><span>Người mua · mô phỏng</span><p>{sample.text}</p></blockquote><button className="judge-primary" disabled={busy} onClick={respond}>{busy?<><LoaderCircle size={16} className="spin"/>Đang đánh giá…</>:<>Đánh giá phản hồi<ArrowRight size={16}/></>}</button></>}<small>Chỉ mô phỏng. Không gửi tin thật.</small></div>}
      {reply&&<blockquote className="judge-buyer"><span>Phản hồi mô phỏng đã ghi nhận</span><p>{text(reply.content)}</p><small><Check size={13}/>Đã đánh giá lại · không hỏi thêm</small></blockquote>}
      <details className="judge-details"><summary>Mức hỗ trợ & thông tin còn thiếu</summary><p>Mức hỗ trợ nguyên nhân: <strong>{assessment?LEVELS[assessment.confidence]:"Chưa đánh giá"}</strong>. Đây là nhãn mô phỏng, không phải xác suất giao thành công.</p><p>{assessment?.missing_info.length?`Còn thiếu: ${assessment.missing_info.map(g=>GAPS[g]??g).join(", ")}.`:"Không còn khoảng trống liên quan trong assessment này."}</p></details>
     </div></section>
     <section className={`judge-panel judge-policy-panel ${finished?"is-current":""}`} aria-labelledby="policy-title"><header><ShieldCheck size={17}/><h2 id="policy-title">Policy & đề xuất</h2><span>{waiting?"Ban đầu":"Đã chốt"}</span></header><div className="judge-panel-body">
      <div className={`judge-outcome ${retry?"retry":waiting?"clarify":"review"}`}><span>{waiting?"Cần bổ sung thông tin":retry?"Đủ điều kiện đề xuất":"Cần người xử lý"}</span><h3>{waiting?"Làm rõ trước khi đề xuất giao lại":retry?"Đề xuất giao lại tiêu chuẩn":"Chuyển Ops xem xét"}</h3><p>{latest?.reason}</p></div>
      {reply&&<div className="judge-change"><span>Điều gì đã thay đổi?</span><p><strong>Trước:</strong> cần xác nhận khả năng nhận.</p><p><strong>Sau:</strong> người mua xác nhận muốn nhận và có người ở nhà ngày mai.</p></div>}
      <div className="judge-human"><UserRound size={20}/><div><strong>Quyền quyết định thuộc Ops</strong><p>{waiting?"Chưa đủ dữ kiện để khuyến nghị giao lại.":retry?"Xem xét đề xuất giao lại theo quy trình hiện tại.":"Xác minh điều kiện vận hành và chọn bước xử lý phù hợp."}</p></div></div>
      {finished&&<button className="judge-secondary" onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?"Đã sao chép":"Sao chép đề xuất cho Ops"}</button>}
      <p className="judge-footnote">Không tự điều phối, đổi địa chỉ, hoàn hàng hoặc refund.</p>
     </div></section>
    </div>
    <div className="judge-guide" role="status">{busy?<LoaderCircle className="spin" size={20}/>:<ArrowRight size={20}/>}<p>{guide}</p></div>
    <section className="judge-takeaway"><h2>{retry?"Agent giúp biến dữ kiện mới thành đề xuất có căn cứ.":waiting?"Ops cần một đề xuất có căn cứ, không chỉ một nhãn lỗi.":"Biết dừng đúng chỗ cũng là một phần của agent."}</h2><p>{retry?"Giữ lại bằng chứng ban đầu, đánh giá phản hồi và kiểm tra điều kiện trước khi khuyến nghị.":waiting?"Agent nối ghi chú giao hàng với thông tin còn thiếu. Policy giữ đề xuất trong phạm vi được phép.":"Phân biệt vấn đề người mua có thể làm rõ với vấn đề vận hành cần con người giải quyết."}</p><small>Giá trị minh họa; chưa đo mức tiết kiệm thời gian hoặc giảm hoàn hàng thực tế.</small></section>
    <details className="judge-history"><summary>Xem lịch sử đánh giá & cách demo hoạt động</summary><p>Replay dùng assessment dựng sẵn từ bộ v2.5 team đã xác nhận; backend vẫn validate và áp dụng policy. Không phải kết quả model chạy trực tiếp.</p><ol>{run.history.map((d,i)=><li key={d.decision_id}><strong>{i===0?"Đánh giá ban đầu":"Đánh giá sau phản hồi"}</strong><span>{d.final_action} · {d.policy_gate}</span><p>{d.reason}</p></li>)}</ol><p>Policy: {latest?.policy_version}. Các đánh giá cũ được giữ nguyên. Kết thúc demo là chốt khuyến nghị, không phải giao hàng thành công.</p></details>
   </>}
   <footer className="judge-footer"><span>Sea × OpenAI Codex Hackathon</span><span>Dữ liệu giả lập · Luật minh họa · Ops quyết định</span></footer>
  </main>
 </div>;
}
