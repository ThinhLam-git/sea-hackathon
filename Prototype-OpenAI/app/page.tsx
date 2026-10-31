"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ArrowRight, Check, ChevronDown, Clock3, Download, FileText, HelpCircle, LoaderCircle, MessageCircle, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { RunView } from "@/lib/order-rescue/view";

type Case = { case_id: string; title: string; group: string };
type Config = { live_available: boolean; model: string };
const SCENARIOS = [
  {id:"OR-001", name:"Buyer at work", hint:"A reply can rescue the delivery"},
  {id:"OR-009", name:"No reply", hint:"Wait, then ask operations"},
  {id:"OR-038", name:"Flooded route", hint:"Hold until the disruption clears"},
  {id:"OR-023", name:"New address", hint:"Address changes need a person"},
  {id:"OR-051", name:"Unsafe note", hint:"Stop instructions hidden in data"},
];
const ACTIONS: Record<string,{title:string;description:string;tone:string;label:string}> = {
 CLARIFY:{title:"Ask the buyer.", description:"One answer can help operations choose the next step.",tone:"amber",label:"Waiting for a reply"},
 STANDARD_REATTEMPT:{title:"Recommend another attempt.", description:"The buyer has confirmed they want the parcel and someone can receive it. Operations can review a standard retry.",tone:"green",label:"Retry recommended"},
 HOLD_DISRUPTION:{title:"Hold and reassess.", description:"A verified disruption affects this route. Wait for an operational update before recommending another attempt.",tone:"blue",label:"Temporary hold"},
 ESCALATE_REVIEW:{title:"Let operations review this.", description:"The case needs a person to check the evidence or authorize the next step.",tone:"red",label:"Human review"},
 NO_ACTION:{title:"Wait for the buyer’s reply.",description:"The response window is still open. The buyer will not be asked a second question.",tone:"amber",label:"Waiting"},
 NO_CHANGE:{title:"No new decision is needed.",description:"This event is already handled or the case has reached its final state.",tone:"gray",label:"No change"},
};
const CAUSES:Record<string,string>={TEMP_AVAILABILITY_CONFLICT:"Temporary unavailability",UNCLEAR_LANDMARK:"Unclear location",UNVERIFIED_REFUSAL:"Unverified refusal",PAYMENT_NOT_READY:"Payment not ready",SERVICE_DISRUPTION:"Service disruption",UNKNOWN_CAUSE:"Not enough evidence"};
const SOURCES:Record<string,string>={COURIER_NOTE:"Courier note",BUYER_REPLY:"Buyer reply",BUYER_HISTORY:"Buyer history",FAILED_DELIVERY:"Delivery event",DISRUPTION_SIGNAL:"Disruption signal",SELLER_REPLY:"Seller reply",QUESTION_TIMEOUT:"Reply timeout",DISRUPTION_RESOLVED:"Disruption resolved"};
const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value)):"Unknown";
const time=(value:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
const sourceText=(value:unknown):string=>typeof value==="string"?value:value&&typeof value==="object"&&"text" in value?String(value.text):JSON.stringify(value,null,2);
async function api<T>(path:string,body?:object):Promise<T>{
 const response=await fetch(`/api${path}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await response.json() as any;if(!response.ok)throw new Error(data.detail??"The request could not be completed.");return data;
}
function download(run:RunView){const url=URL.createObjectURL(new Blob([run.history.map(d=>JSON.stringify(d)).join("\n")+"\n"],{type:"application/x-ndjson"}));const link=document.createElement("a");link.href=url;link.download=`${run.run_id}.jsonl`;link.click();URL.revokeObjectURL(url);}

export default function Home(){
 const [cases,setCases]=useState<Case[]>([]),[config,setConfig]=useState<Config|null>(null),[run,setRun]=useState<RunView|null>(null);
 const [mode,setMode]=useState<"REPLAY"|"LIVE_AI">("REPLAY"),[tab,setTab]=useState("Decision"),[selected,setSelected]=useState(-1);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[help,setHelp]=useState(false),[copied,setCopied]=useState(false);
 useEffect(()=>{let active=true;Promise.all([api<Case[]>("/cases"),api<Config>("/status")]).then(async([list,status])=>{
  if(!active)return;setCases(list);setConfig(status);
  const params=new URLSearchParams(location.search),saved=sessionStorage.getItem("order-rescue-run");
  if(saved&&!params.get("case")){try{const restored=await api<RunView>(`/runs/${saved}`);if(active){setRun(restored);setMode(restored.mode);}return;}catch{sessionStorage.removeItem("order-rescue-run");}}
  const result=await api<RunView>("/runs",{case_id:params.get("case")??"OR-001",mode:"REPLAY"});
  if(active){setRun(result);sessionStorage.setItem("order-rescue-run",result.run_id);}
 }).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[]);
 async function perform(fn:()=>Promise<RunView>){setCopied(false);setBusy(true);setError("");try{const result=await fn();setRun(result);setSelected(-1);sessionStorage.setItem("order-rescue-run",result.run_id);}catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
 function start(id:string,nextMode=mode){setTab("Decision");return perform(()=>api<RunView>("/runs",{case_id:id,mode:nextMode}));}
 function changeMode(next:"REPLAY"|"LIVE_AI"){setMode(next);if(run)start(run.case_id,next);}
 const decision=run?.history[selected<0?run.history.length-1:selected];
 const action=ACTIONS[decision?.final_action??"NO_CHANGE"]??ACTIONS.NO_CHANGE;
 const scenario=SCENARIOS.find(s=>s.id===run?.case_id);
 const historical=!!run&&selected>=0&&selected<run.history.length-1;
 const events=run?.events.filter(e=>!e.applied&&e.available&&!["NO_REPLY_OBSERVED","QUESTION_TIMEOUT"].includes(e.type))??[];
 const canContinue=decision?.final_action!=="ESCALATE_REVIEW";
 const pendingReply=!!run&&run.question.asked>0&&!run.question.replied&&!run.question.timed_out;
 const primaryTimer=canContinue&&pendingReply&&!events.length;
 const handoff=!canContinue||(!events.length&&!pendingReply);
 async function copyRecommendation(){if(!run||!decision)return;try{await navigator.clipboard.writeText(`Case: ${run.case_id}\nRecommendation: ${action.label}\nReason: ${decision.reason}\nRules: ${decision.rules.join(", ")}\nOperations review required. Synthetic demo data.`);setCopied(true);}catch{setError("Copy is unavailable in this browser. You can export the record from History.");}}
 const applied=run?.events.filter(e=>e.applied)??[];
 return <div className="app-shell">
  <header className="app-header"><a href="/" className="brand" aria-label="Order Rescue home"><span className="brand-icon"><ArrowUpRight size={23}/></span>Order Rescue<span className="prototype-tag">Prototype</span></a><div className="header-controls"><span className="workspace-name">Operations workspace</span><button className="icon-button" aria-label="How to use this prototype" onClick={()=>setHelp(true)}><HelpCircle size={19}/></button></div></header>
  <main className="main">
   <div className="intro"><div><h1>Delivery review</h1><p>Review the evidence. Choose the next step.</p></div><label className="case-selector"><span>DELIVERY CASE</span><select aria-label="Choose delivery case" value={run?.case_id??"OR-001"} disabled={busy} onChange={e=>start(e.target.value)}>{cases.map(c=><option key={c.case_id} value={c.case_id}>{c.case_id} · {SCENARIOS.find(s=>s.id===c.case_id)?.name??c.title}</option>)}</select><ChevronDown size={14}/></label></div>
   {error&&<div className="error" role="alert"><span>{error} {error.includes("sign in")&&<a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in</a>}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
   {!run||!decision?<div className="loading"><LoaderCircle className="spin" size={24}/><p>{error?"The workspace is waiting for a connection.":"Preparing the demo…"}</p></div>:<>
    <div className="case-heading"><div><span className="case-id">{run.case_id}</span><h2>{scenario?.name??run.input.failed_event.reported_reason??"Delivery case"}</h2><span className="case-context">Attempt {run.input.attempts_used}/3 · Deadline {date(run.input.deadline)}</span></div><button className="text-button reset" disabled={busy} onClick={()=>start(run.case_id)} aria-label="Reset scenario"><RotateCcw size={14}/>Start over</button></div>
    <section className="workspace-card" aria-busy={busy}>
     <nav className="view-tabs" aria-label="Case views" role="tablist">{["Decision","Evidence","History"].map(label=><button role="tab" aria-selected={tab===label} className={tab===label?"active":""} key={label} onClick={()=>setTab(label)}>{label}{label==="History"&&run.history.length>1&&<span>{run.history.length}</span>}</button>)}</nav>
     {historical&&<div className="history-notice"><span>Earlier decision · {date(decision.decided_at)}</span><button onClick={()=>setSelected(-1)}>Back to latest <ArrowRight size={13}/></button></div>}
     <div aria-live="polite" className="sr-only">{action.label}. {run.history.length} decisions recorded.</div>
     {tab==="Decision"&&<div className="decision-view">
      <div className="recommendation"><span className={`outcome-label ${action.tone}`}><span/>{action.label}</span><h3>{action.title}</h3>{decision.final_action!=="CLARIFY"&&<p>{action.description}</p>}</div>
      {decision.question_text&&<div className="question"><span className="label"><MessageCircle size={14}/>Question for the buyer</span><p>“{decision.question_text}”</p></div>}
      <details className="why"><summary>Why this recommendation?<ChevronDown size={13}/></summary><p>{decision.reason}</p>{decision.agent&&<p className="muted">Likely cause: {CAUSES[decision.agent.hypothesis]} · Confidence: {decision.agent.confidence.toLowerCase()}</p>}</details>
      {!historical&&<div className="next-step"><div className="next-step-heading"><span className="label">{handoff?"HAND OFF TO OPERATIONS":"NEXT STEP"}</span><span className="simulation-clock"><Clock3 size={12}/>{time(run.now)} ICT · simulated</span></div>
       {canContinue&&events.map(event=><div className="event" key={event.source_ref}><button className={event.available?"primary-button":"secondary-button"} disabled={busy||!event.available} onClick={()=>perform(()=>api<RunView>(`/runs/${run.run_id}/events`,{source_ref:event.source_ref}))}>{event.type==="BUYER_REPLY"?"Apply buyer reply":event.type==="QUESTION_TIMEOUT"?"Simulate reply timeout":event.type==="NO_REPLY_OBSERVED"?"Simulate no reply":SOURCES[event.type]??"Apply prepared event"}<ArrowRight size={16}/></button>{event.type==="BUYER_REPLY"&&<p className="event-preview">{event.text}</p>}{!event.available&&<p className="event-note">Available after the buyer question is asked.</p>}</div>)}
       {primaryTimer&&<div className="event"><button className="primary-button" disabled={busy} onClick={()=>perform(()=>api<RunView>(`/runs/${run.run_id}/advance`,{minutes:240}))}>Advance 4 hours<Clock3 size={16}/></button><p className="event-preview">Simulate the buyer not replying before the response window ends.</p></div>}
       {handoff&&<div className="handoff-actions"><button className="primary-button" disabled={busy} onClick={copyRecommendation}>{copied?"Copied":"Copy recommendation"}{copied?<Check size={16}/>:<ArrowRight size={16}/>}</button><button className="text-button" onClick={()=>setTab("Evidence")}>Review supporting evidence<ArrowUpRight size={13}/></button></div>}
       {!!applied.length&&<p className="event-applied"><Check size={14}/> {applied.length===1?"Prepared event applied":"Prepared events applied"}. The recommendation above uses the latest evidence.</p>}
       {!events.length&&!applied.length&&!pendingReply&&<p className="event-note">This scenario needs no follow-up event. Review the recommendation or choose another scenario.</p>}
       {canContinue&&!primaryTimer&&<div className="time-controls"><button className="text-button" disabled={busy} onClick={()=>perform(()=>api<RunView>(`/runs/${run.run_id}/advance`,{minutes:240}))}><Clock3 size={14}/>Advance 4 hours</button>{run.question.asked>0&&!run.question.replied&&<span>{run.question.timed_out?"No reply. Timeout recorded.":`Reply window ends ${time(run.question.deadline!)}.`}</span>}</div>}
      </div>}
      <div className="human-control"><ShieldCheck size={15}/><span>Review before acting. This prototype uses simulated messages and delivery events.</span></div>
     </div>}
     {tab==="Evidence"&&<div className="detail-view"><div className="detail-heading"><h3>What supports this decision?</h3><p>Facts extracted from the information available at this point.</p></div>{decision.agent&&<div className="evidence-summary"><span>{CAUSES[decision.agent.hypothesis]}</span><span>{decision.agent.confidence.toLowerCase()} confidence</span></div>}{decision.agent?.evidence.map((e,i)=><article className="evidence" key={i}><div><span><FileText size={13}/>{SOURCES[run.sources.find(s=>s.source_ref===e.source_ref)?.source_type??""]??"Source"}</span><small>{e.verified?"Verified source":"Reported, not verified"}</small></div><p>{e.fact}</p><blockquote>{e.quote}</blockquote><code>{e.source_ref}</code></article>)}{!decision.agent&&<p className="empty">The policy stopped this case before AI assessment. Open the technical details below for the rule and reason.</p>}</div>}
     {tab==="History"&&<div className="detail-view"><div className="detail-heading history-heading"><div><h3>How the decision changed</h3><p>Every new event adds a decision. Earlier decisions stay in the record.</p></div><button className="icon-button" title="Export history as JSONL" aria-label="Export history" onClick={()=>download(run)}><Download size={17}/></button></div><div className="timeline">{run.history.map((entry,i)=><button className={entry.decision_id===decision.decision_id?"current":""} key={entry.decision_id} onClick={()=>{setSelected(i);setTab("Decision")}}><span className="timeline-dot"/><span><strong>{ACTIONS[entry.final_action??"NO_CHANGE"]?.label??"No change"}</strong><small>{entry.trigger==="START"?"Initial assessment":"New information"} · {time(entry.decided_at)} ICT</small></span>{i===run.history.length-1&&<em>Latest</em>}<ArrowUpRight size={15}/></button>)}</div></div>}
    </section>
    <details className="demo-options"><summary>Demo options<ChevronDown size={14}/></summary><div><p>Use Replay for a predictable walkthrough, or Live GPT for a real model assessment.</p><div className="mode-switch" aria-label="Assessment mode"><button className={mode==="REPLAY"?"selected":""} disabled={busy} onClick={()=>mode!=="REPLAY"&&changeMode("REPLAY")}>Replay</button><button className={mode==="LIVE_AI"?"selected":""} disabled={busy||!config?.live_available} title="Uses API credits" onClick={()=>mode!=="LIVE_AI"&&changeMode("LIVE_AI")}><Sparkles size={13}/>Live GPT</button></div><div className="scenario-tabs" aria-label="Quick demo scenarios">{SCENARIOS.map(s=><button className={run.case_id===s.id?"active":""} key={s.id} disabled={busy} onClick={()=>start(s.id)}>{s.name}</button>)}</div><p className="demo-note">Changing modes or choosing a scenario starts a fresh run.</p></div></details>
    <details className="technical"><summary>Technical details<ChevronDown size={14}/></summary><div className="technical-body"><p className="technical-intro">The same seven-stage pipeline and v0.5 demo policy. The model runs only at the assessment stage.</p><div className="pipeline">{run.pipeline.map((step,i)=><div className={`${decision.skills_run.includes(step.name)?"ran":"skipped"} ${step.name==="assess-case"?"ai":""}`} key={step.name}><span>{i+1}</span><strong>{step.name.replaceAll("-"," ")}</strong><small>{decision.skills_run.includes(step.name)?"Completed":"Skipped"}</small></div>)}</div><dl className="policy-output"><div><dt>Eligibility</dt><dd>{decision.eligibility??"—"}</dd></div><div><dt>Policy gate</dt><dd>{decision.policy_gate??"—"}</dd></div><div><dt>Final action</dt><dd>{decision.final_action??"NO_CHANGE"}</dd></div><div><dt>Rules</dt><dd>{decision.rules.join(", ")}</dd></div></dl><p>{decision.reason}</p><div className="case-inputs"><span>Attempts: {run.input.attempts_used}/3</span><span>Deadline: {date(run.input.deadline)}</span><span>Record: {decision.record_status}</span></div><details className="subdetails"><summary>Current raw sources ({run.sources.length})</summary>{run.sources.map(s=><div key={s.source_ref}><strong>{s.source_ref}</strong><pre>{sourceText(s.content)}</pre></div>)}</details><details className="subdetails"><summary>Compare with expected demo answer</summary><p>Replay seeds are hand-authored. A match checks the code path, not model accuracy. Live results can differ.</p><table><thead><tr><th>Field</th><th>Expected</th><th>Latest</th></tr></thead><tbody>{run.golden.map(row=><tr key={row.field}><td>{row.field}</td><td>{String(row.expected??"—")}</td><td>{String(row.actual??"—")}{row.ok?" ✓":""}</td></tr>)}</tbody></table></details>{!!decision.validation_issues.length&&<details className="subdetails"><summary>Validation adjustments</summary>{decision.validation_issues.map(v=><p key={v}>{v}</p>)}</details>}<button className="text-button" onClick={()=>download(run)}><Download size={13}/>Export decision history</button></div></details>
    <p className="mode-caption">{run.mode==="REPLAY"?"Replay · prepared AI output, full validation and policy checks.":`Live GPT · ${decision.model_info.model??config?.model??"GPT"} · uses API credits.`}</p>
   </>}
   <footer><span>Dữ liệu giả lập · Luật minh họa · Kết quả mô phỏng</span><span>Built with OpenAI</span></footer>
  </main>
  {busy&&<div className="busy-toast" role="status"><LoaderCircle size={17} className="spin"/>{mode==="LIVE_AI"?"GPT is reviewing the evidence…":"Updating the recommendation…"}</div>}
  {help&&<div className="modal-shade" onClick={()=>setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><button className="icon-button close" aria-label="Close help" onClick={()=>setHelp(false)}><X size={20}/></button><span className="eyebrow">A QUICK WALKTHROUGH</span><h2 id="help-title">One case. One next step.</h2><ol><li>Open <strong>Demo options</strong> and choose <strong>Replay</strong> for a predictable demo.</li><li>Choose <strong>OR-001 · Buyer at work</strong> and click <strong>Apply buyer reply</strong>.</li><li>Watch the recommendation change. Open <strong>Evidence</strong> or <strong>History</strong> to see why.</li></ol><p>Try <strong>OR-009 → Advance 4 hours</strong> to explore a timeout. Live GPT uses your API credits.</p><button className="primary-button" onClick={()=>setHelp(false)}>Got it<ArrowRight size={16}/></button></section></div>}
 </div>;
}
