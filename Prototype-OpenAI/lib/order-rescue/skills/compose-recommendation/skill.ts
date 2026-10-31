import type { PipelineState } from "../../models.js";

export const RUNS_WHEN_HALTED = true;

const HEADLINES: Record<string, string> = {
  "STANDARD_REATTEMPT": "Đề xuất giao lại theo quy trình thông thường (nhân viên xác nhận)",
  "CLARIFY": "Hỏi người mua một câu (mô phỏng), chờ trả lời",
  "HOLD_DISRUPTION": "Tạm giữ do gián đoạn đã xác minh, chờ đánh giá lại",
  "NO_ACTION": "Đang chờ người mua trả lời",
  "ESCALATE_REVIEW": "Chuyển nhân viên xem xét",
  "NO_CHANGE": "Sự kiện trùng lặp: không tạo quyết định mới"
};

export const RULE_TEXT: Record<string, string> = {
  "R01": "Đơn đã bắt đầu hoặc đã hoàn; phản hồi muộn không đảo trạng thái hoàn.",
  "R02": "Thiếu hạn xử lý hoặc trạng thái hoàn; nhân viên xác minh trước khi gọi AI.",
  "R03": "Hết hạn xử lý hoặc người mua chỉ nhận được sau hạn xử lý; nhân viên quyết định ngoại lệ.",
  "R04": "Đã hết số lượt giao (giả định demo: 3).",
  "R05": "Người mua trực tiếp xác nhận muốn nhận và có người nhận; còn hạn xử lý và lượt giao.",
  "R05:intent": "Chưa có xác nhận trực tiếp người mua còn muốn nhận.",
  "R05:availability": "Chưa có xác nhận có người nhận trong thời hạn.",
  "R05:location": "Vị trí giao chưa được làm rõ.",
  "R05:disruption": "Tuyến vẫn đang gián đoạn.",
  "R06": "Liên quan thay đổi địa chỉ, ngoài phạm vi prototype; hệ thống không tự sửa địa chỉ.",
  "R08": "Trạng thái từ chối chưa có xác nhận trực tiếp từ người mua; nhân viên kiểm tra.",
  "R09": "Ghi chú shipper mâu thuẫn với lời người mua; không đủ cơ sở tự giao lại.",
  "R10": "Chỉ tạm giữ khi gián đoạn đã xác minh, khớp tuyến/thời điểm và có giờ đánh giá lại.",
  "R12": "Chưa đủ thông tin để quyết định, nên hỏi người mua một câu trước (chỉ hỏi một lần).",
  "R13": "Hết thời gian chờ mà chưa có trả lời; không coi là từ chối.",
  "R15": "Dữ liệu chứa PII đã bị cách ly; không đưa vào AI.",
  "R19": "Ghi chú chứa chỉ dẫn thao túng agent; không làm theo, chuyển nhân viên.",
  "R20": "Sự kiện trùng lặp hoặc lỗi thời so với trạng thái mới nhất.",
  "R21": "Seller không xác nhận ý định thay người mua; yêu cầu từ seller chuyển nhân viên.",
  "R22": "Thông tin liên hệ người nhận cần nhân viên xác minh trước khi hỏi người mua.",
  "WAIT": "Đã hỏi người mua, đang trong thời gian chờ trả lời.",
  "AGENT_ESCALATE": "Agent đề xuất chuyển nhân viên vì chưa đủ cơ sở xử lý tự động."
};

const AI_ERRORS: Record<string, string> = {
  "model_unavailable": "Không gọi được AI.",
  "model_refused_or_empty": "AI không trả kết quả.",
  "invalid_model_output": "Kết quả AI sai định dạng.",
  "replay_missing": "Không có output AI đã lưu cho tình huống này.",
  "replay_version_mismatch": "Output AI đã lưu thuộc phiên bản prompt/luật khác.",
  "invalid_evidence_reference": "AI dẫn một nguồn không tồn tại.",
  "unsupported_claim": "AI trích dẫn không khớp với nguồn.",
  "missing_question_key": "AI đề xuất hỏi nhưng không chọn câu hỏi được duyệt.",
  "prohibited_wording": "Kết quả AI có câu chữ bị cấm (đổ lỗi, hứa hẹn)."
};

export function ruleText(code: string): string {
  if (code.startsWith("AI:")) return (AI_ERRORS[code.slice(3)] ?? code) + " Chuyển nhân viên.";
  return RULE_TEXT[code] ?? code;
}

export function run(state: PipelineState): PipelineState {
  const res = state.result!, a = state.assessment, r = state.run;
  const questionText = a && res.final_action === "CLARIFY" && a.question_key ? state.policy.question_templates[a.question_key] : null;
  state.decision = {
    decision_id: `${r.run_id}:${state.trigger}`,
    run_id: r.run_id,
    case_id: r.case.case_id,
    trigger: state.trigger,
    decided_at: r.now,
    record_status: res.record_status,
    eligibility: res.eligibility,
    policy_gate: res.policy_gate,
    final_action: res.final_action,
    reason: res.rules.map(ruleText).join(" "),
    headline: HEADLINES[res.final_action ?? "NO_CHANGE"],
    rules: res.rules,
    agent: a,
    question_text: questionText,
    reassess_at: res.reassess_at,
    validation_issues: state.validation_issues,
    skills_run: [],
    model_info: state.model_info,
    policy_version: state.policy.policy_version,
    labels: ["Dữ liệu giả lập", "Luật minh họa", "Kết quả mô phỏng",
      state.mode === "REPLAY" ? "REPLAY · output AI soạn sẵn" : "LIVE_AI"],
  };
  return state;
}
