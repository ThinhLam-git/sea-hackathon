# Nguồn dữ liệu v2.4 reconciled

## Contract hiện tại

Ngày 31/10/2026, Lucas chốt workbook reconciled và cho phép migration demo. Nguồn: `../../outputs/policy-reconciliation-v2.4/Order_Rescue_Minimal_Simulation_30_Cases_v2.4_reconciled.xlsx`. Giải thích: `../../reports/policy-reconciliation-v2.4-2026-10-31.md`.

Contract mới giữ sáu field assessment và bốn field policy. Policy version: `demo-two-assessment-v2.4-reconciled`. Các nhãn fixture là FINAL theo quyết định review, không phải kết quả kiểm thử model.

- 024/027 initial UNKNOWN_CAUSE/LOW.
- 023/025/026 NOT_ASKED và chuyển thẳng Ops review.
- Năm case không reply giữ assessment 1, nhưng final policy ESCALATE_REVIEW; giữ nguyên policy 1 lịch sử.
- 27 case có tối đa một câu hỏi tập trung.
- Deadline/timestamps thống nhất theo đồng hồ synthetic, có offset rõ.

## File và trách nhiệm

| File | Vai trò |
| --- | --- |
| `fixtures/v2/seed.json` | Raw inputs; mutable output slots chưa có kết quả |
| `fixtures/v2/test-cases.json` | Expected evaluator; không đưa vào prompt |
| `fixtures/v2/replay.json` | Assessment giả lập dùng riêng cho Replay |
| `fixtures/v2/controls.json` | Câu hỏi/response mô phỏng, chỉ release đúng phase |
| `fixtures/v2/provenance.json` | Version, nguồn và hash để đối chiếu |
| `fixtures/v2/archive/v2.2/` | Bản nguồn v2.2 trước migration, giữ nguyên để đối chiếu |

`node scripts/import-v2.mjs` validate cặp reconciled rồi regenerate các file dẫn xuất. Argument tùy chọn là thư mục chứa seed.json/test-cases.json đúng contract mới. Không trộn file v2.2 với nhãn workbook mới.

## Tách dữ liệu và bảo toàn lịch sử

Model chỉ nhận raw projection, nguồn hiện có và tương tác đã release. Không nhận expected, future reply, scenario description hoặc kết quả final tương lai. Seed/replay/evaluator là dữ liệu synthetic, không mô tả tích hợp vận hành thật.

Giữ version của run và lịch sử cũ; không viết lại assessment hoặc policy đã lưu. Finalization no-reply mới có final policy riêng. D1 vẫn lưu session/audit; không cần tạo hệ thống operational database mới chỉ để mirror chín bảng logical của seed.

Bộ 30 case chưa bao phủ toàn bộ lifecycle, lỗi model và tình huống adversarial. Các test ranh giới bổ sung và đánh giá live phải được báo riêng với kết quả thực tế.
