"use client";
import { useEffect, useRef, useState } from "react";
import { Package, Search, MessageCircle, ShieldCheck, UserRound, Check, ArrowRight, RotateCcw, LoaderCircle, Copy, Download, Sparkles } from "lucide-react";
import type { RunView } from "@/lib/order-rescue-v2/view";
import { decisionPresentation, submissionUsesLive } from "./presentation";
import { translate, type Language } from "./i18n";
import { policyReason } from "./policy-copy";
import AgentTrace from "./AgentTrace";
import "./judge.css";

type Mode="REPLAY"|"LIVE_AI";
type Config={live_available:boolean;model:string};
type Case={case_id:string;title:string;group:string};
const CASES=[
 {id:"DEMO-001",name:"Người mua đi làm",lesson:"Một phản hồi làm thay đổi đề xuất"},
 {id:"DEMO-023",name:"Tuyến giao bị ngập",lesson:"Phân biệt thông tin người mua và vận hành"},
];
const CAUSES:Record<string,string>={AVAILABILITY_ISSUE:"Chưa bố trí được người nhận",ADDRESS_ISSUE:"Thông tin điểm nhận chưa rõ",CONTACT_ISSUE:"Có trở ngại liên hệ",BUYER_INTENT_ISSUE:"Ý định nhận hàng chưa rõ",PAYMENT_ISSUE:"Có trở ngại thanh toán",LOGISTICS_ISSUE:"Gián đoạn vận hành giao hàng",UNKNOWN_CAUSE:"Chưa đủ dữ kiện xác định nguyên nhân"};
const GAPS:Record<string,string>={CURRENT_BUYER_INTENT:"Ý định nhận hàng",RECEIVING_AVAILABILITY:"Khả năng bố trí người nhận",ADDRESS_CLARIFICATION:"Thông tin điểm nhận",CONTACT_CLARIFICATION:"Kênh liên hệ",COD_READINESS:"Khả năng thanh toán COD",DELIVERY_ACCESS:"Lối tiếp cận điểm nhận",LOGISTICS_VERIFICATION:"Ops xác minh vận hành",CAUSE_CLARIFICATION:"Nguyên nhân giao thất bại"};
const LEVELS={LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao"};
const PROVENANCE:Record<string,string>={SOURCE_RECORD:"Sự kiện hệ thống",UNVERIFIED_REPORT:"Báo cáo chưa xác minh",DIRECT_BUYER_STATEMENT:"Người mua xác nhận",VERIFIED_OPS_SIGNAL:"Ops đã xác minh"};
class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
async function api<T>(path:string,body?:unknown):Promise<T>{
 const response=await fetch(`/api${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json();if(!response.ok)throw new ApiError(response.status,data&&typeof data==="object"&&"detail" in data?String(data.detail):"Chưa thể hoàn thành yêu cầu. Hãy thử lại.");return data as T;
}
function text(content:Record<string,unknown>){return typeof content.text==="string"?content.text:"";}
function exportHistory(run:RunView){const url=URL.createObjectURL(new Blob([run.history.map(d=>JSON.stringify(d)).join("\n")+"\n"],{type:"application/x-ndjson"}));const a=document.createElement("a");a.href=url;a.download=`${run.run_id}.jsonl`;a.click();URL.revokeObjectURL(url);}
const errorText=(e:unknown)=>e instanceof Error?e.message:"Chưa thể hoàn thành yêu cầu.";

export default function JudgeDemo(){
 const [language,setLanguage]=useState<Language>("vi");
 const [workspaceTab,setWorkspaceTab]=useState<"case"|"trace">("case");
 const t=(value:string)=>translate(value,language);
 useEffect(()=>{const saved=localStorage.getItem("order-rescue-language");if(saved==="vi"||saved==="en")setLanguage(saved);},[]);
 function changeLanguage(next:Language){setLanguage(next);localStorage.setItem("order-rescue-language",next);document.documentElement.lang=next;}
 useEffect(()=>{document.documentElement.lang=language;},[language]);
 const [run,setRun]=useState<RunView|null>(null),[config,setConfig]=useState<Config|null>(null),[cases,setCases]=useState<Case[]>([]);
 const [busy,setBusy]=useState(true),[error,setError]=useState(""),[replyText,setReplyText]=useState(""),[copied,setCopied]=useState("");
 const [boot,setBoot]=useState(0);
 const working=useRef(false);
 const pending=useRef<{runId:string;kind:"reply"|"no-reply";text:string;eventId:string}|null>(null);
 function save(result:RunView){setRun(result);setReplyText("");setCopied("");sessionStorage.setItem("order-rescue-run",result.run_id);}
 useEffect(()=>{let alive=true;setBusy(true);setError("");
  (async()=>{
   const [list,status]=await Promise.all([api<Case[]>("/cases"),api<Config>("/status")]);
   if(!alive)return;setCases(list);setConfig(status);
   const requested=new URLSearchParams(location.search).get("case"),saved=sessionStorage.getItem("order-rescue-run");
   if(saved&&!requested){try{const restored=await api<RunView>(`/runs/${saved}`);if(alive)save(restored);return;}catch(e){if(!(e instanceof ApiError)||![404,409].includes(e.status))throw e;sessionStorage.removeItem("order-rescue-run");}}
   if(!alive)return;
   const result=await api<RunView>("/runs",{case_id:list.some(c=>c.case_id===requested)?requested:"DEMO-001",mode:"REPLAY"});
   if(alive)save(result);
  })().catch(e=>{if(alive)setError(errorText(e));}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[boot]);
 async function perform(task:()=>Promise<RunView>){
  if(working.current)return;working.current=true;setBusy(true);setError("");setCopied("");
  try{save(await task());}catch(e){setError(errorText(e));}finally{working.current=false;setBusy(false);}
 }
 function start(id:string,mode:Mode=run?.mode??"REPLAY"){
  if(busy)return;pending.current=null;void perform(()=>api<RunView>("/runs",{case_id:id,mode}));
 }
 function submit(kind:"reply"|"no-reply"){
  if(!run||busy||run.lifecycle!=="WAITING_FOR_BUYER")return;
  const value=kind==="reply"?replyText.trim():"";if(kind==="reply"&&!value)return;
  if(pending.current?.runId!==run.run_id||pending.current.kind!==kind||pending.current.text!==value)
   pending.current={runId:run.run_id,kind,text:value,eventId:crypto.randomUUID()};
  const event=pending.current;
  void perform(()=>api<RunView>(`/runs/${run.run_id}/${kind}`,{event_id:event.eventId,question_id:run.question.question_id,
   ...(kind==="reply"?{text:value,use_live:submissionUsesLive(run,value)}:{})}));
 }
 async function copy(kind:"question"|"recommendation"){
  if(!run)return;const latest=run.history.at(-1)!,question=run.history.find(d=>d.question_text)?.question_text;
  const value=kind==="question"?question&&t(question):`Order Rescue · ${run.case_id}\n${t(decisionPresentation(run).title)}\n${policyReason(latest,language)}\n${t("Dữ liệu mô phỏng. Ops quyết định; chưa thực hiện hành động giao hàng.")}`;
  if(!value)return;try{await navigator.clipboard.writeText(value);setCopied(kind);}catch{setError(t("Chưa sao chép được. Bạn có thể chọn và sao chép nội dung hiển thị."));}
 }
 const latest=run?.history.at(-1),assessment=latest?.agent,score=latest?.confidence_score;
 const waiting=run?.lifecycle==="WAITING_FOR_BUYER",finished=run?.lifecycle==="COMPLETED";
 const question=run?.history.find(d=>d.question_text)?.question_text;
 const sample=run?.events.find(e=>e.type==="BUYER_REPLY"&&e.available&&!e.applied);
 const reply=run?.sources.findLast(s=>s.source_type==="BUYER_REPLY"),note=run?.sources.find(s=>s.source_type==="COURIER_NOTE");
 const disruption=run?.input.operational_context.disruption;
 const verifiedDisruption=disruption?.verification==="VERIFIED"&&disruption.status==="ACTIVE"&&disruption.route_match&&disruption.time_match;
 const activeCase=CASES.find(c=>c.id===run?.case_id),presentation=run?decisionPresentation(run):null;
 const liveReply=!!run&&(run.mode==="LIVE_AI"||!!replyText.trim()&&submissionUsesLive(run,replyText)),live=run?.mode==="LIVE_AI";
 const signIn=error.toLowerCase().includes("sign in with chatgpt");
 const step=busy?1:waiting?2:3;
 const steps=[{name:t("Giao thất bại"),icon:Package},{name:t("Agent đọc bằng chứng"),icon:Search},{name:t("Làm rõ nếu cần"),icon:MessageCircle},{name:t("Policy kiểm tra"),icon:ShieldCheck},{name:t("Ops quyết định"),icon:UserRound}];
 return <div className="judge-app">
  <header className="judge-header"><a href="/" className="judge-brand"><Package size={23}/>Order Rescue</a><span>{t("Demo mô phỏng · dữ liệu giả lập")}</span><button className="judge-language" aria-label={language==="vi"?"Switch to English":"Chuyển sang Tiếng Việt"} onClick={()=>changeLanguage(language==="vi"?"en":"vi")}>{language==="vi"?"English":"Tiếng Việt"}</button><div className="judge-mode" role="group" aria-label={t("Chế độ đánh giá")}><button aria-pressed={!live} disabled={busy} onClick={()=>run&&start(run.case_id,"REPLAY")}>Replay</button><button aria-pressed={live} disabled={busy||!config?.live_available} onClick={()=>run&&start(run.case_id,"LIVE_AI")}>Live Agent</button></div></header>
  <main className={`judge-main ${workspaceTab==="trace"?"is-trace":""}`}>
   <div className="judge-title"><div><h1>{t("Từ giao thất bại đến bước xử lý tiếp theo")}</h1><p>{t("Agent tổng hợp bằng chứng và đề xuất. Policy kiểm tra điều kiện. Ops quyết định.")}</p></div><button className="judge-reset" disabled={busy||!run} onClick={()=>run&&start(run.case_id)}><RotateCcw size={15}/>{t("Chạy lại")}</button></div>
   <nav className="judge-cases" aria-label={t("Tình huống nổi bật")}>{CASES.map((c,i)=><button key={c.id} aria-pressed={run?.case_id===c.id} disabled={busy} onClick={()=>start(c.id)}><span className="judge-case-index">{i+1}</span><span><strong>{t(c.name)}</strong><small>{t(c.lesson)}</small></span>{run?.case_id===c.id&&<Check size={18}/>}</button>)}</nav>
   <ol className="judge-steps" aria-label={t("Luồng hoạt động của agent")}>{steps.map((s,i)=>{const Icon=s.icon,skip=i===2&&finished&&!run?.question.asked;return <li key={s.name} className={skip?"skip":i<step?"done":i===step?"active":""} aria-current={i===step?"step":undefined}><span>{i<step&&!skip?<Check size={17}/>:<Icon size={17}/>}</span><strong>{s.name}</strong><small>{skip?t("Không cần hỏi"):i===4?t("Ops xem xét thực tế"):i===step?busy?t("Đang xử lý"):waiting?t("Chờ phản hồi"):t("Đã có đề xuất"):i<step?t("Đã hoàn tất"):""}</small></li>})}</ol>
   {error&&<div className="judge-error" role="alert"><p>{signIn?t("Đăng nhập ChatGPT để lưu lượt trải nghiệm của bạn."):t(error)}</p>{signIn?<a href="/signin-with-chatgpt?return_to=%2F" target="_top">{t("Đăng nhập ChatGPT")}</a>:<button disabled={busy} onClick={()=>run?void perform(()=>api<RunView>(`/runs/${run.run_id}`)):setBoot(v=>v+1)}>{run?t("Tải lại trạng thái"):t("Thử lại")}</button>}</div>}
   {!run?<div className="judge-loading" role="status">{busy?<><LoaderCircle className="spin"/>{t("Đang chuẩn bị tình huống…")}</>:t("Demo chưa tải được. Chọn Thử lại để tiếp tục.")}</div>:<>
    <div className="judge-workspace-tabs" role="tablist" aria-label={language==="vi"?"Góc nhìn workspace":"Workspace view"}><button id="case-tab" role="tab" aria-selected={workspaceTab==="case"} aria-controls="case-workspace" onClick={()=>setWorkspaceTab("case")}><Package size={14}/>{language==="vi"?"Xử lý case":"Case workspace"}</button><button id="trace-tab" role="tab" aria-selected={workspaceTab==="trace"} aria-controls="agent-trace-panel" onClick={()=>setWorkspaceTab("trace")}><Sparkles size={14}/>{language==="vi"?"Trace của agent":"Agent trace"}<small>{language==="vi"?"Quan sát":"Observe"}</small></button></div>
    {workspaceTab==="trace"?<div id="agent-trace-panel" role="tabpanel" aria-labelledby="trace-tab"><AgentTrace run={run} language={language} busy={busy}/></div>:<div id="case-workspace" role="tabpanel" aria-labelledby="case-tab"><div className="judge-board" aria-busy={busy}>
     <section className="judge-panel judge-case-panel" aria-labelledby="case-title"><header><Package size={17}/><h2 id="case-title">{t("Case giao thất bại")}</h2><span>{run.case_id}</span></header><div className="judge-panel-body">
      <h3>{t(activeCase?.name??run.title)}</h3><div className="judge-failed">{t("Lần giao chưa thành công")}</div>
      {note&&<blockquote className="judge-note"><span>{t("Ghi chú tài xế")}</span><p>{text(note.content)}</p><small>{t("Báo cáo chưa xác minh")}</small></blockquote>}
      {verifiedDisruption&&<div className="judge-ops-signal"><ShieldCheck size={17}/><div><strong>{t("Ops đã xác minh")}</strong><p>{t("Gián đoạn còn hiệu lực, đúng tuyến và thời điểm. Phản hồi người mua không gỡ được gián đoạn.")}</p></div></div>}
      <dl className="judge-facts"><div><dt>{t("Số lần đã giao")}</dt><dd>{run.input.attempts_used} / {run.limits.max_attempts}</dd></div><div><dt>{t("Trạng thái hoàn")}</dt><dd>{run.input.return_state==="NOT_STARTED"?t("Chưa bắt đầu"):t("Cần kiểm tra")}</dd></div><div><dt>{t("Hạn xử lý mô phỏng")}</dt><dd>{run.input.deadline?new Intl.DateTimeFormat(language==="vi"?"vi-VN":"en-GB",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Asia/Ho_Chi_Minh"}).format(new Date(run.input.deadline)):t("Chưa có thông tin")}</dd></div></dl>
      <details className="judge-details"><summary>{t("Bằng chứng agent đã sử dụng (")}{assessment?.evidence.length??0})</summary>{assessment?.evidence.map((e,i)=><article key={i}><strong>{t(PROVENANCE[e.verification])}</strong><p>{e.fact}</p><blockquote>{e.quote}</blockquote></article>)}</details>
      <p className="judge-footnote">{t("Không có dữ liệu khách hàng thật hoặc tích hợp hãng vận chuyển.")}</p>
     </div></section>
     <section className={`judge-panel judge-agent-panel ${waiting?"is-current":""}`} aria-labelledby="agent-title"><header><Search size={17}/><h2 id="agent-title">{t("Agent làm rõ")}</h2><span>{busy?t("Đang đánh giá"):waiting?t("Cần phản hồi"):t("Đã đánh giá")}</span></header><div className="judge-panel-body">
      <div className="judge-assessment"><span>{t("Nhận định từ bằng chứng")}</span><h3>{assessment?t(CAUSES[assessment.hypothesis]):t("Cần người xem xét")}</h3><small>{latest?.model_info.mode==="LIVE_AI"?"OpenAI hosted Agents API":t("Nhận định Replay dựng sẵn")}</small></div>
      {!!assessment?.missing_info.length&&<div className="judge-gaps"><span>{t("Còn thiếu")}</span><p>{assessment.missing_info.map(g=>t(GAPS[g]??g)).join(" · ")}</p></div>}
      {question?<div className="judge-question"><span><MessageCircle size={14}/>{waiting?t("Một câu hỏi làm rõ"):t("Câu hỏi đã ghi nhận · không hỏi thêm")}</span><p>{t(question)}</p>{waiting&&<button className="judge-text" disabled={busy} onClick={()=>void copy("question")}><Copy size={13}/>{copied==="question"?t("Đã sao chép"):t("Sao chép câu hỏi")}</button>}</div>:<div className="judge-no-contact"><ShieldCheck size={25}/><h3>{t("Không hỏi người mua")}</h3><p>{t("Đánh giá hiện tại không yêu cầu liên hệ. Ops xem xét đề xuất và bằng chứng.")}</p></div>}
      {waiting&&<div className="judge-interaction"><div className="judge-reply-heading"><label htmlFor="judge-reply">{t("Phản hồi của người mua")}</label>{sample&&<button className="judge-text" disabled={busy} onClick={()=>setReplyText(sample.text)}>{t("Dùng phản hồi mẫu")}</button>}</div><textarea id="judge-reply" value={replyText} maxLength={2000} disabled={busy} onChange={e=>setReplyText(e.target.value)} placeholder={t("Ghi lại nguyên văn phản hồi…")}/><button className="judge-primary" disabled={busy||!replyText.trim()||(liveReply&&!config?.live_available)} onClick={()=>submit("reply")}>{busy?<><LoaderCircle size={16} className="spin"/>{t("Đang đánh giá…")}</>:<>{liveReply?t("Đánh giá với Live Agent"):t("Đánh giá phản hồi")}<ArrowRight size={16}/></>}</button><button className="judge-secondary judge-no-reply" disabled={busy} onClick={()=>submit("no-reply")}>{t("Không có phản hồi")}</button><small>{liveReply?t("Live Agent + Decisions · dùng API credits."):t("Phản hồi mẫu dùng Replay · không gọi AI.")}{" "}{t("Không có phản hồi giữ đánh giá đầu, không gọi thêm AI.")}</small></div>}
      {reply&&<blockquote className="judge-buyer"><span>{t("Phản hồi đã ghi nhận")}</span><p>{text(reply.content)}</p><small><Check size={13}/>{t("Đã đánh giá lại · không hỏi thêm")}</small></blockquote>}
      {run.question.no_reply&&<div className="judge-no-contact"><h3>{t("Không có phản hồi")}</h3><p>{t("Giữ nguyên đánh giá ban đầu. Thông tin chưa rõ cần Ops xem xét.")}</p></div>}
      <section className="judge-confidence" aria-label={t("Mức hỗ trợ bằng chứng")}><span><Sparkles size={14}/>{t("Mức hỗ trợ bằng chứng")}</span><strong>{busy?t("Đang cập nhật…"):score?`${score.score}/100`:assessment?t(LEVELS[assessment.confidence]):t("Chưa có đánh giá hợp lệ")}</strong>{score&&!busy&&<div role="meter" aria-label={t("Điểm hỗ trợ bằng chứng")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.score} className="judge-confidence-track"><span style={{width:`${score.score}%`}}/></div>}<p>{score?`OpenAI Decisions · ${t(LEVELS[score.level])}${score.capped?t(" · đã giới hạn theo bằng chứng"):""}`:latest?.model_info.mode==="REPLAY"?t("Nhãn Replay dựng sẵn, không phải điểm API."):t("Không có điểm AI đã xác thực.")}{" "}{t("Không phải xác suất giao thành công.")}</p></section>
     </div></section>
     <aside className={`judge-panel judge-policy-panel ${finished?"is-current":""}`} aria-labelledby="policy-title"><header><ShieldCheck size={17}/><h2 id="policy-title">{t("Policy & đề xuất")}</h2><span>{waiting?t("Ban đầu"):t("Đã chốt")}</span></header><div className="judge-panel-body">
      <div className={`judge-outcome ${presentation!.tone}`}><span>{t(presentation!.label)}</span><h3>{t(presentation!.title)}</h3><p>{latest&&policyReason(latest,language)}</p>{language==="en"&&latest&&<details className="judge-original"><summary>{t("Ghi chú policy gốc")}</summary><p lang="vi">{latest.reason}</p></details>}</div>
      {reply&&<div className="judge-change"><span>{t("Điều gì đã thay đổi?")}</span><p>{t("Đã đánh giá lại từ phản hồi thực tế của người mua và kiểm tra policy. Xem lý do đề xuất cùng bằng chứng; phản hồi không tự động cho phép giao lại.")}</p></div>}
      <div className="judge-human"><UserRound size={20}/><div><strong>{t("Quyền quyết định thuộc Ops")}</strong><p>{waiting?t("Chờ thông tin cần thiết và kiểm tra điều kiện trước khi xử lý."):t("Xem xét đề xuất và chọn bước xử lý theo quy trình hiện tại.")}</p></div></div>
      {finished&&<button className="judge-secondary" disabled={busy} onClick={()=>void copy("recommendation")}>{copied==="recommendation"?<Check size={15}/>:<Copy size={15}/>} {copied==="recommendation"?t("Đã sao chép"):t("Sao chép đề xuất cho Ops")}</button>}
      <p className="judge-footnote">{t("Không tự điều phối, gửi tin, đổi địa chỉ, hoàn hàng hoặc refund.")}</p>
     </div></aside>
    </div>
    <div className="judge-guide" role="status">{busy?<LoaderCircle className="spin" size={20}/>:<ArrowRight size={20}/>}<p>{busy?t("Đang đánh giá bằng chứng và kiểm tra policy…"):t(presentation!.guide)}</p></div>
    </div>}
    <details className="judge-history"><summary>{t("Lịch sử đánh giá & cách hệ thống hoạt động")}</summary><p>{t("Hợp đồng v")}{run.contract_version} · {latest?.policy_version}{t(". Tối đa hai assessment; không có lượt thứ ba. Replay dùng nhãn DRAFT_NEEDS_USER_REVIEW, không chứng minh độ chính xác model.")}</p><ol>{run.history.map((d,i)=><li key={d.decision_id}><strong>{d.trigger==="USER_NO_REPLY"?t("Chọn kết quả ban đầu · không gọi AI"):i===0?t("Đánh giá ban đầu"):t("Đánh giá sau phản hồi")}</strong><span>{d.final_action} · {d.policy_gate} · {d.model_info.mode}</span><p>{policyReason(d,language)}</p>{d.model_info.hosted_agent&&<details><summary>{t("Phiên hosted agent")}</summary><pre>{JSON.stringify(d.model_info.hosted_agent,null,2)}</pre></details>}</li>)}</ol><details><summary>{t("Bảy bước xử lý cố định")}</summary><p>{run.pipeline.map(s=>s.name).join(" → ")}</p></details><button className="judge-text" onClick={()=>exportHistory(run)}><Download size={14}/>{t("Xuất lịch sử")}</button></details>
    <details className="judge-history"><summary>{t("Các tình huống khác & thông tin demo")}</summary><label className="judge-case-select">{t("Chọn trong 30 case")}<select aria-label={t("Chọn case demo")} value={run.case_id} disabled={busy} onChange={e=>start(e.target.value)}>{cases.map(c=><option key={c.case_id} value={c.case_id}>{c.case_id} · {t(CASES.find(x=>x.id===c.case_id)?.name??c.title)}</option>)}</select></label><p>{live?`Live Agent · ${config?.model??"GPT"}${t(" · sử dụng API credits.")}`:t("Replay miễn phí. Chọn Live Agent ở đầu trang để chạy agent và Decisions API thực tế.")}{" "}{t("Thời gian và kết quả thuộc tình huống giả lập. Mỗi tài khoản chỉ xem lượt của mình.")}</p></details>
   </>}
   <footer className="judge-footer"><span>{t("Sea × OpenAI Codex Hackathon")}</span><span>{t("Dữ liệu giả lập · Luật minh họa · Ops quyết định")}</span></footer>
  </main>
 </div>;
}
