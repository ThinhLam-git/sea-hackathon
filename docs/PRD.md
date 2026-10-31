# Order Rescue — Product Requirements Document

Ngày cập nhật: 31/10/2026. Baseline trước triển khai: `phuc-dev`, commit `f10439f`; trạng thái dưới đây bao gồm thay đổi local chưa phát hành, repo `ThinhLam-git/sea-hackathon`.

Trạng thái: đã đồng bộ contract v2.5 theo workbook mới nhất đã được team xác nhận. Nguồn chuẩn: `Prototype-OpenAI/fixtures/source/Order_Rescue_Minimal_Simulation_30_Cases_v2.5.xlsx`. Kiểm tra v2.5: 143 tests/10 files PASS, 30/30 Replay khớp, đối chiếu workbook PASS, typecheck và build PASS. Các kết quả 133 tests/9 files và 10 request Live bên dưới thuộc baseline v2.4; không coi đó là xác minh Live v2.5. Không gọi thêm Live trong đợt này.

## 1. Sản phẩm và mục tiêu demo

Business rules chuẩn bổ sung: `Prototype-OpenAI/docs/Order_Rescue_Agent_Business_Rules_v2.5.md`. Đợt đồng bộ bổ sung đạt 145 tests/10 files và typecheck. Policy dùng được xác nhận buyer có nguồn tại T0, không bắt hỏi khi đã đủ facts; retry trái điều kiện bắt buộc bị BLOCKED và chuyển review. SQL chín bảng là model tham chiếu, chưa thay thế storage run/audit D1 của demo.

Order Rescue giúp nhân viên Ops tổng hợp bằng chứng của một lần giao thất bại, xác định điều còn thiếu và nhận đề xuất có kiểm soát để quyết định bước xử lý. Agent chỉ đề xuất; Ops/human quyết định và thực hiện.

Giám khảo phải có thể tự mở demo, chọn tình huống, hiểu vấn đề, xem agent làm rõ thông tin và hiểu vì sao đề xuất cuối được phép hoặc cần chuyển người xem xét.

Giá trị được minh họa: tập hợp bằng chứng, phân biệt báo cáo với xác nhận, phát hiện khoảng trống, hỏi đúng trọng tâm và ngăn đề xuất thiếu căn cứ. Chưa có dữ liệu chứng minh tiết kiệm thời gian, tăng tỷ lệ giao thành công hoặc giảm hoàn hàng. Pain point và hiệu quả thực tế vẫn là giả thuyết sản phẩm.

Dữ liệu giả lập, luật minh họa, kết quả mô phỏng phải luôn được nhận diện. Không có tích hợp Shopee/SPX/carrier thật; không dùng PII hay đơn hàng thật.

## 2. Người dùng và trách nhiệm

| Người dùng/owner | Trách nhiệm |
| --- | --- |
| Ops reviewer | Đọc bằng chứng, xem đề xuất và quyết định xử lý ngoài ứng dụng |
| Giám khảo | Tự trải nghiệm các tình huống minh họa và hiểu giới hạn sản phẩm |
| Lucas | Scope, trải nghiệm showcase, kịch bản và nghiệm thu demo |
| Hải | Quy tắc nghiệp vụ, nhãn expected và các tình huống ranh giới |
| Kha | Luồng agent và câu chuyện sản phẩm |
| Phúc | Prompt, tích hợp AI, chất lượng bằng chứng và đánh giá model |

## 3. Hiện trạng được xác nhận từ code

Ứng dụng hoạt động nằm trong `Prototype-OpenAI/`. PRD này thay thế mô tả Hono/VoltAgent/SQLite của nhánh cũ.

| Thành phần | Hiện trạng |
| --- | --- |
| Frontend | React, TypeScript, Vinext/Vite; ba cột Delivery details, Buyer response, Decision desk |
| Backend/hosting | API routes trên nền Cloudflare Workers/ChatGPT Sites; D1 lưu run và audit |
| AI assessment | OpenAI Agents SDK, một Responses turn không tools/handoffs; mặc định `gpt-5.4-mini` |
| Confidence | Decisions scoring sau assessment live; model mặc định theo cấu hình là `gpt-6-luna` |
| Replay | Đọc assessment dựng sẵn, vẫn đi qua validation và policy; không giả tạo điểm API |
| Dữ liệu | Bộ 30 case v2.5 ở `fixtures/v2`; bản gốc v2.2 lưu riêng trong `fixtures/v2/archive/v2.2`; bộ 25 case v0.5 giữ làm regression |
| Workflow | Bảy stage do code điều khiển; tối đa initial và after-reply assessment |
| Tương tác | Một câu hỏi; sample reply, custom reply qua Live GPT, hoặc manual no-reply |
| Handoff | Copy question, copy recommendation; không tự gửi hoặc thực hiện hành động |
| Lịch sử | Hai assessment slot, final selection, timeline và export JSONL |
| Hosted access | Có nhánh đăng nhập ChatGPT và ownership theo người dùng; cần kiểm thử lại trên deployment |
| Ngôn ngữ | UI hiện chủ yếu tiếng Anh, có nhãn mô phỏng tiếng Việt |

Nguồn đối chiếu: `app/page.tsx`, `lib/order-rescue-v2/pipeline.ts`, `simulator.ts`, `skills/assess-case/skill.ts`, `skills/policy-gate/skill.ts`, `tests/v2-contract.test.ts`, README và AGENTS của prototype.

Xác minh local do nhóm triển khai chạy: 133 tests thuộc 9 files PASS; Replay 30/30 đúng expected với 17 STANDARD_REATTEMPT và 13 ESCALATE_REVIEW. Đây là kiểm tra contract/fixture, không phải accuracy của model. Live smoke đã dùng hết 10 request được duyệt (5 Responses + 5 Decisions), đều HTTP 200; không có request mới ở no-reply. Case 001 sau reply có final đúng nhưng confidence MEDIUM khác nhãn HIGH; không coi smoke này là đánh giá accuracy. Production build PASS; 10 API/D1 local checks PASS (0 live requests); browser xác nhận 001 retry + refresh, 005 no-reply review và 023 review không hỏi. Typecheck PASS; auth và persistence hosted vẫn pending. Không có thêm request live được phép trong đợt này. Chi tiết: `reports/demo-readiness-2026-10-31.md`.

## 4. Phạm vi demo đích

### Bao gồm

- Chọn case synthetic; đọc dữ kiện, nguồn bằng chứng và điều kiện xử lý.
- Replay có thể tự trải nghiệm mà không cần gọi model; Live GPT được nhận diện riêng và báo sử dụng API credits.
- Assessment có nguồn, policy gate deterministic, giải thích ngắn và đề xuất cho Ops.
- Tối đa một câu hỏi tập trung khi thông tin buyer có thể đổi đề xuất.
- Finalization rõ ràng cho có reply, không reply và không cần hỏi.
- Lịch sử giữ nguyên; refresh, lỗi và sự kiện lặp không làm sai quyết định.
- Showcase gọn, có hướng dẫn bắt đầu và tình huống phù hợp cho giám khảo.

### Ngoài phạm vi

Gửi tin buyer; dispatch courier; sửa địa chỉ hoặc COD; refund, return, cancel, penalty; dữ liệu thật; tích hợp carrier; vận hành tự động; quản trị team/roles; dashboard KPI hiệu quả kinh doanh chưa đo.

## 5. Policy v2.5

Contract `2.5`, policy `demo-two-assessment-v2.5`, prompt `assess-v2.5.0`. Run v2.2/v2.4 được nhận diện phiên bản và chỉ đọc, không đổi ý nghĩa hoặc audit cũ. Không dùng golden v2.5 để chấm ngược run lịch sử.

Workbook v2.5 thay thế các đề xuất review trước chưa được đồng bộ. Case 008 vẫn HIGH trước/sau reply theo file đã xác nhận, khác kết luận MEDIUM ở chat trước. Case 006 cũng giữ nhãn trong file. Không tự thêm dữ kiện hoặc sửa nhãn theo đề xuất audit cũ.

missing_info liệt kê toàn bộ khoảng trống liên quan cứu đơn, kể cả khi final là review. 023/025/026 giữ CURRENT_BUYER_INTENT, RECEIVING_AVAILABILITY và LOGISTICS_VERIFICATION. Mã logistics bao gồm reassessment/xác nhận sự cố đã kết thúc. HOLD_DISRUPTION bị loại khỏi schema assessment mới, chỉ giữ kiểu tương thích để hiển thị lịch sử. Hai question_key là nhóm mục đích rộng, không phải hai câu hỏi cố định.

| ID | Yêu cầu | Trạng thái local |
| --- | --- | --- |
| P-01 | 024/027 initial `UNKNOWN_CAUSE/LOW` | Đã đồng bộ fixture, Replay và prompt |
| P-02 | Logistics không thuộc khả năng buyer giải quyết → `ESCALATE_REVIEW` ngay | Đã sửa gate; không cho buyer intent vượt blocker logistics |
| P-03 | 023/025/026 không hỏi, không reply, không assessment 2 | Đã áp dụng `NOT_ASKED`, controls và simulator |
| P-04 | Một câu hỏi tập trung | Composer suy câu hỏi từ assessment/question_key/missing_info; câu workbook là tham chiếu |
| P-05 | No-reply giữ assessment/policy 1 lịch sử, final policy review | Đã thêm finalization riêng; không inference hoặc assessment 2 |
| P-06 | Nhãn fixture FINAL | Đã cập nhật paired JSON/provenance, lưu riêng bản gốc v2.2 |
| P-07 | Thời gian synthetic nhất quán | Dùng `as_of` có offset; test cutoff nguồn và deadline; khác biệt thời điểm tương tác mô tả dưới đây |
| P-08 | Validate → policy → persist → công bố | Runtime/API giữ thứ tự; API/D1 local và browser refresh đã kiểm tra, hosted persistence chưa xác minh |

Câu hỏi runtime không lấy đáp án expected hoặc câu tham chiếu theo case ID làm input model. 007 ưu tiên làm rõ trở ngại khi nguyên nhân địa chỉ chưa rõ; 017/018 ưu tiên current intent khi buyer còn phân vân/chưa nhận biết đơn. Các câu hỏi đều một trọng tâm; không bắt buộc khớp từng chữ với câu tham chiếu. Replay trả lời dựng sẵn không chứng minh buyer thật sẽ trả lời đủ thông tin cho câu hỏi runtime.

Workbook dùng T0 15:00, câu hỏi 15:01 và reply/no-reply 15:02 ngày 24/10/2026 (+07:00). Simulator local hiện ghi question/reply tại đồng hồ run T0 15:00; nguồn ban đầu đều khả dụng tại `as_of`. Các mốc này là thời gian mô phỏng, không phải SLA hay latency thực. Cần đồng bộ thời gian tương tác nếu demo trình bày elapsed time.

`HOLD_DISRUPTION` có thể giữ trong enum để đọc dữ liệu cũ; không là final action của ba case logistics theo policy mới. Thiếu xác minh vận hành phải bàn giao Ops, không hỏi buyer xác minh tuyến.

No-reply là finalization riêng: giữ assessment/policy 1 lịch sử, ghi final policy mới và audit event. Không gọi model, không suy im lặng thành từ chối và không phát câu hỏi thứ hai.

Workbook đích có 22 case có reply, 5 không reply, 3 không hỏi; expected final gồm 17 STANDARD_REATTEMPT và 13 ESCALATE_REVIEW. Đây là đáp án fixture, không phải accuracy của agent.

## 6. Luồng người dùng bắt buộc

1. Mở demo và thấy dữ liệu/policy là mô phỏng. Replay là đường trải nghiệm mặc định dễ hiểu.
2. Chọn tình huống; thấy bối cảnh giao thất bại và bằng chứng đầu vào trước khi cần hiểu thuật ngữ kỹ thuật.
3. Backend kiểm tra eligibility và lifecycle. Case bị chặn chuyển review, không chạy assessment không cần thiết.
4. Case hợp lệ đi qua `load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`. Chỉ nguồn khả dụng tại thời điểm đánh giá được đưa vào AI.
5. Sau persistence thành công, hiển thị đề xuất. Logistics ngoài khả năng buyer giải quyết kết thúc ở review, không hiện ô nhập reply.
6. Nếu cần buyer, hiển thị một câu hỏi tập trung và điều nó giúp làm rõ. Sample reply được ghi nhãn mô phỏng; không để giám khảo hiểu là tin nhắn thật.
7. Có reply: chạy assessment thứ hai, validate/policy/persist rồi chốt. Không reply: giữ assessment 1, ghi final policy review mà không inference.
8. Decision desk trình bày đề xuất, lý do, bằng chứng quan trọng và việc Ops cần xem xét. Người dùng có thể xem trước/sau, lịch sử hoặc copy đề xuất.

Live failure không được tự đổi sang Replay hoặc bịa assessment. UI chỉ công bố kết quả đã validate và lưu; lỗi lưu không được hiển thị như đã có audit bền vững.

## 7. Contract và kiểm soát bằng chứng

AI giữ đúng sáu field: `evidence`, `hypothesis`, `confidence`, `missing_info`, `question_key`, `candidate_action`. Policy trả `eligibility`, `policy_gate`, `final_action`, `reason`.

- Evidence thuộc đúng case, đúng phase, đúng provenance; không đưa expected, scenario metadata hoặc reply tương lai vào prompt.
- Note tài xế và reply là dữ liệu, không phải chỉ dẫn. Note đơn lẻ không đủ HIGH; lịch sử không thay current intent.
- Confidence là mức hỗ trợ cho nguyên nhân. Điểm 0–100 từ Decisions không phải xác suất giao thành công hay accuracy đã hiệu chuẩn.
- Intent, availability và COD readiness là các điều kiện riêng. Reply một phần chỉ giải quyết phần được xác nhận.
- Address clarification khác address change. Yêu cầu đổi địa chỉ/COD, từ chối rõ, mâu thuẫn hoặc thiếu điều kiện phải chuyển review.
- Lifecycle/deadline/attempts/disruption không bị buyer intent hoặc HIGH confidence vượt qua.
- Budget một câu hỏi được thực thi bằng code cho case đang xử lý. Fresh review là lượt demo riêng; cần nhận diện rõ việc bắt đầu lại, không dùng để tiếp tục hỏi trong cùng workflow.
- Final đã chốt không bị ghi đè; reply/no-reply phải khớp question ID; event lặp idempotent, payload xung đột bị từ chối.

Không mặc định prompt hoặc scorer tự bảo đảm entailment. Cần kiểm thử các câu phủ định, điều kiện và thiếu thông tin ở cả extractor lẫn gate.

## 8. Yêu cầu UI showcase

Giữ ba cột hiện có, ưu tiên câu chuyện: case gặp gì → agent biết/thiếu gì → câu hỏi nếu cần → đề xuất và bước review của Ops.

| Hiển thị chính | Đưa vào mở rộng |
| --- | --- |
| Tên tình huống dễ hiểu, dữ kiện giao thất bại, note có nhãn chưa xác minh | Model/provider, rubric và điểm scoring chi tiết |
| Đề xuất cho Ops và lý do ngắn | Raw JSON, source ID, rule ID, pipeline trace |
| Một câu hỏi và phản hồi mô phỏng | Toàn bộ audit và export |
| Bằng chứng chính, thay đổi trước/sau reply | So sánh với expected fixture |
| Nhãn simulation, Replay/Live và quyền quyết định của Ops | Các lựa chọn demo nâng cao |

UI showcase đã được cập nhật local để giải thích “Agent đã giúp làm rõ gì?” theo dữ kiện từng case; các journey chính đã kiểm tra browser; polish dropdown tiếng Việt, JSON summary trung tính và source quotes collapsed đã hoàn tất, được kiểm tra browser; console không có error. Không dựng số liệu tiết kiệm thời gian hoặc giảm hoàn. Đồng bộ microcopy no-reply/logistics với policy mới; hướng dẫn không yêu cầu người dùng liên hệ buyer thật. Ưu tiên tiếng Việt nhất quán theo cách làm việc của team; nếu bản gửi giám khảo dùng tiếng Anh thì Lucas chốt một ngôn ngữ chính cho toàn bộ hành trình.

## 9. Backlog hoàn thiện demo theo thứ tự

| Ưu tiên | Việc | Owner | Trạng thái và việc còn lại |
| --- | --- | --- | --- |
| P0-1 | Baseline local | Phúc/kỹ thuật | 133 tests/9 files PASS, Replay 30/30, production build PASS; npm ci hoàn tất (722 packages), typecheck PASS |
| P0-2 | Contract v2.5 | Hải + Phúc | Đã triển khai seed/test/replay/controls/provenance, version và archive v2.2; review semantic câu hỏi còn mở |
| P0-3 | Gate, simulator, prompt, no-reply | Phúc + Kha | Đã triển khai và kiểm tra local; thêm regression cho nguồn future/khác case và prerequisites chỉ từ reply cited |
| P0-4 | UI showcase | Lucas + kỹ thuật | Browser 001/005/023 và desktop/mobile đã kiểm tra; polish dropdown Việt/JSON summary/source quotes collapsed hoàn tất; console không error |
| P0-5 | Kiểm thử tích hợp/an toàn | Phúc + Hải | Unit/regression và 10 API/D1 checks PASS; browser refresh PASS; auth/ownership trên hosted chưa xác minh |
| P1-1 | Live GPT giới hạn chi phí | Phúc + Hải | Đã smoke đúng 10/10 request được duyệt, đều HTTP 200; còn lệch confidence case 001; không gọi thêm. Token/latency có ghi nhận, chưa tính giá tiền |
| P1-2 | Rehearsal 3–4 phút | Lucas + cả team | Pending; người mới tự chạy và hiểu quyền quyết định của Ops |
| P1-3 | Phát hành showcase | Lucas + Phúc | Chưa publish; cần auth/quota/secrets/rollback và quyền publish trước phát hành |

Không cần làm lại UI từ đầu hoặc thêm integration thật trước khi giải quyết P0. Việc publish cần Lucas cho phép riêng; thay PRD không tự triển khai hay publish code.

## 10. Acceptance criteria cho bản demo mới

| ID | Tình huống kiểm thử | Kết quả bắt buộc |
| --- | --- | --- |
| AC-01 | Chạy 30 fixture reconciled | Đúng phase/final theo contract; 22 reply, 5 no-reply, 3 NOT_ASKED |
| AC-02 | 024/027 trước reply | UNKNOWN_CAUSE/LOW, không suy logistics từ note mơ hồ |
| AC-03 | 023/025/026 | Review ngay; không câu hỏi, reply, assessment 2 hoặc prompt gọi thêm để hỏi buyer |
| AC-04 | 005/010/014/018/022 no-reply | Assessment 1 giữ nguyên; final policy review; không inference; audit mới |
| AC-05 | Reply chỉ nói muốn nhận | Không tự xác nhận availability/COD; không hỏi lần hai |
| AC-06 | Buyer xác nhận đầy đủ và không blocker | Chỉ đề xuất giao lại; không thực hiện logistics |
| AC-07 | Expiry, attempt limit, return started/completed | Chặn retry kể cả buyer đồng ý; kiểm tra thời điểm sự kiện và ranh giới deadline |
| AC-08 | Nguồn sai case, future source, verification nâng cấp hoặc injection | Không chấp nhận bằng chứng không hợp lệ, không thực hiện chỉ dẫn trong dữ liệu |
| AC-09 | Duplicate, stale hoặc reply/no-reply đồng thời | Không tạo hai final; không gọi inference lặp không cần thiết; final cũ không đổi |
| AC-10 | Model/scorer/schema/persistence lỗi | Review hoặc lỗi rõ ràng; không fallback giả, không hiển thị kết quả chưa lưu là authoritative |
| AC-11 | Refresh và tài khoản khác | Run được phục hồi đúng; người khác không đọc/sửa run ngoài quyền |
| AC-12 | Giám khảo tự chạy Replay | Chọn case, đọc kết quả, dùng sample reply/no-reply và hiểu việc bàn giao Ops |
| AC-13 | Live mode và confidence | Phân biệt gọi API thật với Replay; điểm confidence không mô tả xác suất giao thành công |
| AC-14 | Workbook mới và dữ liệu lịch sử | Phiên bản phân biệt rõ; không sửa audit hoặc gán nhãn mới ngược vào run cũ |

`tests/v2-contract.test.ts` đã chuyển sang contract v2.5 cùng migration dữ liệu/policy; `tests/v24-safety.test.ts` bổ sung regression an toàn. 133 tests PASS không tự chứng minh các AC browser, hosted, Live GPT hoặc rehearsal đã hoàn tất.

## 11. Kịch bản showcase đề xuất

- 001: buyer bổ sung căn cứ; thấy đề xuất trước/sau thay đổi.
- 004 hoặc 013: intent chưa đủ availability; chuyển Ops, không cố giao lại.
- 023: logistics đã xác minh; chuyển Ops ngay và không hỏi buyer.
- 005: không phản hồi; không quy thành từ chối, chốt review.
- 009 hoặc 030: đổi địa chỉ/emoji; giữ ranh giới và không bịa xác nhận.

Dùng Replay để kể câu chuyện có thể lặp lại. Live GPT là phần riêng nếu đã qua kiểm tra và có ngân sách. Buổi rehearsal 3–4 phút vẫn là điều kiện nghiệm thu, không được coi là hoàn tất chỉ vì có UI.

## 12. Tài liệu liên quan và giới hạn

- Workbook chuẩn: `Prototype-OpenAI/fixtures/source/Order_Rescue_Minimal_Simulation_30_Cases_v2.5.xlsx`.
- Giải thích thay đổi: `reports/policy-reconciliation-v2.4-2026-10-31.md`.
- Runtime hiện tại: `Prototype-OpenAI/README.md`, `AGENTS.md`, `docs/DATA-SOURCES.md`.

Cặp JSON v2.5 đã đồng bộ vào runtime local và có provenance; bản gốc v2.2 được lưu riêng để đối chiếu. Nhãn FINAL chỉ xác nhận bộ đáp án synthetic được chốt, không chứng minh độ chính xác model hoặc operational readiness.

Các nhãn nghiệp vụ hiện theo v2.5 đã được team xác nhận. Bộ 30 fixture chưa thay thế các test ranh giới và thực nghiệm với Ops. Live API smoke trước đây thuộc v2.4; prompt/rubric v2.5 chưa được đánh giá Live. Hosted và vận hành thực chưa được nghiệm thu.
