# Nguồn dữ liệu v2.5

## Contract hiện tại

Ngày 31/10/2026, Lucas cung cấp workbook v2.5 đã được team xác nhận và yêu cầu đồng bộ ứng dụng. Nguồn được lưu nguyên byte tại `../fixtures/source/Order_Rescue_Minimal_Simulation_30_Cases_v2.5.xlsx` (đường dẫn tính từ tài liệu này). SHA-256: `1583b8203c2bcee44cf53ddebec79dae60cbf9d7b697a21dd3efdc72dc10261a`.

Workbook là nguồn chuẩn của lần cập nhật này. Các JSON/ERD/Validation Report bên ngoài được workbook nhắc đến nhưng không được cung cấp, nên chưa được kiểm chứng. JSON trong repo được đồng bộ từ workbook. File 008 vẫn HIGH ở hai phase; đây là nhãn mới nhất được áp dụng, thay cho kết luận MEDIUM trong review chat trước. Không tự sửa 006 hoặc các nhãn khác theo đề xuất audit cũ.

Contract mới giữ sáu field assessment và bốn field policy. Policy version: `demo-two-assessment-v2.5`. Các nhãn fixture là FINAL theo quyết định review, không phải kết quả kiểm thử model.

- 024/027 initial UNKNOWN_CAUSE/LOW.
- 023/025/026 NOT_ASKED và chuyển thẳng Ops review.
- missing_info của ba case logistics giữ cả CURRENT_BUYER_INTENT, RECEIVING_AVAILABILITY và LOGISTICS_VERIFICATION. Thông tin còn thiếu không bị bỏ chỉ vì next action là review.
- LOGISTICS_VERIFICATION gồm xác minh hoặc đánh giá lại điều kiện vận hành, kể cả xác nhận disruption đã kết thúc.
- HOLD_DISRUPTION chỉ còn để đọc lịch sử; không được tạo ở assessment mới.
- Hai question_key là nhóm rộng; mỗi câu hỏi chỉ hỏi một thông tin chính.
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
| `fixtures/v2/archive/v2.4/` | Bản v2.4 trước cập nhật v2.5, giữ nguyên byte |

`python scripts/import-workbook-v25.py fixtures/source/Order_Rescue_Minimal_Simulation_30_Cases_v2.5.xlsx` nhập workbook chuẩn; `node scripts/import-v2.mjs` validate cặp v2.5 rồi regenerate các file dẫn xuất. Chạy lại lệnh Python với `--check` để đối chiếu toàn bộ 30 hàng và kiểm tra 330 ô công thức final. Không trộn dữ liệu phiên bản cũ với nhãn workbook mới.

## Tách dữ liệu và bảo toàn lịch sử

Business rules đi kèm: [Order_Rescue_Agent_Business_Rules_v2.5.md](Order_Rescue_Agent_Business_Rules_v2.5.md), lưu nguyên bản team cung cấp. Đồng bộ bổ sung: facts buyer được lấy từ nguồn T0 hoặc reply đã release, có citation/provenance và cutoff; candidate retry vi phạm điều kiện bị BLOCKED và final chuyển review. Prompt hiện tại đã bao phủ sáu field, một câu hỏi tập trung, missing_info đầy đủ, logistics/no-reply và không đọc expected. SQL recipes mô tả model tham chiếu chín bảng; runtime D1 hiện lưu run/audit, chưa triển khai nguyên xi schema/SQL đó. Đây không phải tuyên bố tương thích vật lý với chín bảng. Phần nguồn lịch sử trong tài liệu gốc nhắc workbook v2.4; nguồn fixture active vẫn là workbook v2.5 team xác nhận.

Model chỉ nhận raw projection, nguồn hiện có và tương tác đã release. Không nhận expected, future reply, scenario description hoặc kết quả final tương lai. Seed/replay/evaluator là dữ liệu synthetic, không mô tả tích hợp vận hành thật.

Giữ version của run và lịch sử cũ; không viết lại assessment hoặc policy đã lưu. Finalization no-reply mới có final policy riêng. D1 vẫn lưu session/audit; không cần tạo hệ thống operational database mới chỉ để mirror chín bảng logical của seed.

Bộ 30 case chưa bao phủ toàn bộ lifecycle, lỗi model và tình huống adversarial. Các test ranh giới bổ sung và đánh giá live phải được báo riêng với kết quả thực tế.
