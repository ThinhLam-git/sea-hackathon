"use client";

import type { RunView } from "@/lib/order-rescue-v2/view";
import type { Language } from "./i18n";
import "./timeline.css";

type Decision = RunView["history"][number];
type Stage = NonNullable<Decision["execution_trace"]>[number];

const STAGE_TEXT: Record<string, [string, string]> = {
  "load-case": ["Đọc case", "Load case"],
  "prepare-input": ["Chuẩn bị đầu vào", "Prepare input"],
  "assess-case": ["Đánh giá", "Assess case"],
  "validate-output": ["Kiểm tra đầu ra", "Validate output"],
  "policy-gate": ["Cổng policy", "Policy gate"],
  "compose-recommendation": ["Soạn đề xuất", "Compose recommendation"],
  "audit-log": ["Ghi audit", "Write audit"],
  "select-initial": ["Chọn đánh giá ban đầu", "Select initial assessment"],
};
const STATUS: Record<string, [string, string]> = {
  completed: ["Hoàn tất", "Completed"],
  halted: ["Dừng tại đây", "Halted"],
  skipped: ["Đã bỏ qua", "Skipped"],
  failed: ["Thất bại", "Failed"],
  started: ["Đã bắt đầu", "Started"],
  pending: ["Đang chờ", "Pending"],
  scored: ["Đã chấm điểm", "Scored"],
};

function localTimestamp(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const base = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${base}.${ms} ICT`;
}

export default function TraceTimeline({
  decision, language, activeStage, onSelectStage,
}: {
  decision: Decision;
  language: Language;
  activeStage?: string;
  onSelectStage?: (name: string) => void;
}) {
  const vi = language === "vi";
  const label = (v: string, e: string) => vi ? v : e;
  const stages: Stage[] = decision.execution_trace ?? decision.skills_run.map((name) => ({
    name, kind: name === "assess-case" ? "agent" : name === "policy-gate" ? "policy" : "skill",
    status: "completed", started_at: "", duration_ms: 0,
    summary: label("Bản ghi cũ không lưu thời lượng bước.", "Legacy record; stage timing was not saved."),
  }));
  const measured = !!decision.execution_trace;
  const total = measured ? stages.reduce((sum, stage) => sum + stage.duration_ms, 0) : 0;
  const calls = Array.isArray(decision.model_info?.service_calls) ? decision.model_info.service_calls : [];
  const noReply = decision.trigger === "USER_NO_REPLY";
  const selection = decision.model_info?.final_selection;

  return <section className="trace-chrono" aria-label={label("Dòng thời gian thực thi", "Execution timeline")}>
    <header>
      <h3 className="trace-chrono-heading">{label("Dấu thời gian thực thi", "Execution trace")}</h3>
      <p className="trace-chrono-meta">
        {measured ? `${label("Tổng thời lượng đã ghi", "Recorded elapsed time")}: ${total} ms` : label("Timing không có trong bản ghi cũ", "Timing unavailable for this older record")}
        {noReply && ` · ${label("Không phản hồi · giữ đánh giá đầu", "No reply · initial assessment retained")}`}
      </p>
    </header>
    {stages.length ? <ol className="trace-chrono-list">
      {stages.map((stage, index) => {
        const width = measured ? Math.max(2, total > 0 ? stage.duration_ms / total * 100 : 0) : 0;
        const title = STAGE_TEXT[stage.name]?.[vi ? 0 : 1] ?? stage.name;
        const statusLabel = STATUS[stage.status]?.[vi ? 0 : 1] ?? stage.status;
        const isActive = activeStage === stage.name;
        return <li className="trace-chrono-event" data-status={stage.status} data-kind={stage.kind} key={`${stage.name}-${index}`}>
          <button type="button" className="trace-chrono-row" aria-pressed={isActive} onClick={() => onSelectStage?.(stage.name)}>
            <span className="trace-chrono-rail"><i className="trace-chrono-dot" /></span>
            <time className="trace-chrono-time">{measured ? localTimestamp(stage.started_at) : label("Thời gian chưa lưu", "Time not saved")}</time>
            <span className="trace-chrono-body">
              <strong className="trace-chrono-title">{title}</strong>
              <span className="trace-chrono-description">{stage.summary || statusLabel} · {statusLabel}</span>
              <span className="trace-chrono-duration">{measured ? `${stage.duration_ms} ms` : label("Không đo", "Unmeasured")}</span>
              {measured && <span className="trace-chrono-bar" aria-label={`${stage.duration_ms} ms`}><span style={{ width: `${width}%` }} /></span>}
              {stage.name === "assess-case" && calls.length > 0 && <span className="trace-chrono-calls">
                {calls.map((call: any, callIndex: number) => <span className="trace-chrono-call" data-status={call.status} key={`${call.service}-${call.operation}-${callIndex}`}>
                  <strong className="trace-chrono-call-title">{call.service}: {call.operation}</strong>
                  <span>{STATUS[call.status]?.[vi ? 0 : 1] ?? call.status}{call.duration_ms != null ? ` · ${call.duration_ms} ms` : ` · ${label("thời lượng chưa lưu", "timing not saved")}`}</span>
                  {call.started_at && <time>{localTimestamp(call.started_at)}</time>}
                </span>)}
              </span>}
            </span>
          </button>
        </li>;
      })}
    </ol> : <p className="trace-chrono-empty">{label("Bản ghi này không có bước thực thi đã lưu.", "No execution stages were saved for this record.")}</p>}
    {noReply && selection && <p className="trace-chrono-meta">{label("Audit lựa chọn cuối", "Final-selection audit")}: {selection.control ?? "USER_NO_REPLY"} · {label("không có assessment hoặc thao tác API mới", "no new assessment or API operation")}</p>}
  </section>;
}
