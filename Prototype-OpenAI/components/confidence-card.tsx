import { Sparkles } from "lucide-react";
import type { Decision } from "@/lib/order-rescue/models";

export function ConfidenceCard({decision,mode,busy,onStartLive,liveAvailable}:{decision:Decision;mode:"REPLAY"|"LIVE_AI";busy:boolean;onStartLive:()=>void;liveAvailable:boolean}) {
  const score=decision.confidence_score;
  const assessmentMode=decision.model_info.mode??mode;
  const failed=["failed","invalidated"].includes(decision.model_info.confidence_scoring?.status);
  const canStartLive=liveAvailable&&!busy&&!!decision.agent&&!score;
  const label=busy?"Updating…":score?String(score.score):failed?"Unavailable":!decision.agent?"Not assessed":assessmentMode==="REPLAY"?decision.agent.confidence.toLowerCase():"Not scored";
  return <section className="confidence-card" aria-label="Evidence confidence">
    <div className="confidence-card-label"><Sparkles size={14}/><h3>Evidence confidence</h3></div>
    <div className={`confidence-value ${score&&!busy?score.level.toLowerCase():""}`}><strong>{label}</strong>{score&&!busy&&<><span>/100</span><em>{score.level.toLowerCase()}</em></>}</div>
    {score&&!busy?<><div className="confidence-track" role="meter" aria-label="Validated evidence support" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.score}><span style={{width:`${score.score}%`}}/></div><p>Evidence-support rating, not delivery-success probability.</p><span className="score-source">OpenAI Decisions · {score.model}</span>{score.capped&&<span className="score-capped">Limited by evidence validation.</span>}</>:<p>{busy?"Reviewing the latest case information.":failed?"Scoring could not be validated. The case has been sent for review.":!decision.agent?"No validated AI assessment is available for this decision.":assessmentMode==="REPLAY"?"Prepared demo confidence. Start a live assessment for a Decisions API score.":"This saved assessment has no Decisions score. Start a new live assessment to score it."}</p>}
    {canStartLive&&<button className="text-button score-live-button" onClick={onStartLive}>Start live assessment<SpinArrow/></button>}
    {canStartLive&&<span className="score-cost">Starts a new run · uses API credits</span>}
  </section>;
}
function SpinArrow(){return <span aria-hidden="true">↗</span>}
