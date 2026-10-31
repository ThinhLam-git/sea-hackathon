import { Sparkles } from "lucide-react";
import type { Decision } from "@/lib/order-rescue/models";

export function ConfidenceCard({decision,mode,busy,onStartLive,liveAvailable}:{decision:Pick<Decision,"confidence_score"|"model_info">&{agent:{confidence:"LOW"|"MEDIUM"|"HIGH"}|null};mode:"REPLAY"|"LIVE_AI";busy:boolean;onStartLive:()=>void;liveAvailable:boolean}) {
  const score=decision.confidence_score;
  const assessmentMode=decision.model_info.mode??mode;
  const failed=["failed","invalidated"].includes(decision.model_info.confidence_scoring?.status);
  const canStartLive=liveAvailable&&!busy&&!!decision.agent&&!score;
  const levels={LOW:"Thấp",MEDIUM:"Trung bình",HIGH:"Cao"};
  const label=busy?"Đang cập nhật…":score?String(score.score):failed?"Chưa xác thực":!decision.agent?"Chưa đánh giá":assessmentMode==="REPLAY"?levels[decision.agent.confidence]:"Chưa có điểm";
  return <section className="confidence-card" aria-label="Mức hỗ trợ của bằng chứng">
    <div className="confidence-card-label"><Sparkles size={14}/><h3>Mức hỗ trợ của bằng chứng</h3></div>
    <div className={`confidence-value ${score&&!busy?score.level.toLowerCase():""}`}><strong>{label}</strong>{score&&!busy&&<><span>/100</span><em>{levels[score.level]}</em></>}</div>
    {score&&!busy?<><div className="confidence-track" role="meter" aria-label="Điểm hỗ trợ bằng chứng đã kiểm tra" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.score}><span style={{width:`${score.score}%`}}/></div><p>Mức hỗ trợ cho nguyên nhân; không phải xác suất giao thành công.</p>{score.capped&&<span className="score-capped">Đã giới hạn theo bằng chứng được xác thực.</span>}</>:<p>{busy?"Đang xem xét thông tin mới nhất.":failed?"Điểm chưa được xác thực. Cần Ops xem xét.":!decision.agent?"Quyết định này chưa có assessment AI đã xác thực.":assessmentMode==="REPLAY"?"Mức tin cậy dựng sẵn cho demo Replay; chưa phải kết quả đánh giá model thật.":"Assessment đã lưu chưa có điểm Decisions."}</p>}
    {decision.model_info.final_selection?.new_assessment===false&&<span className="score-source">Giữ đánh giá đầu · không gọi AI thêm</span>}
    {canStartLive&&<details><summary>Thử đánh giá bằng model thật</summary><button className="text-button score-live-button" onClick={onStartLive}>Bắt đầu Live GPT<SpinArrow/></button><span className="score-cost">Tạo lượt mới · sử dụng API credits</span></details>}
  </section>;
}
function SpinArrow(){return <span aria-hidden="true">↗</span>}
