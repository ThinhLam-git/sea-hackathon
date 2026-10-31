# Order Rescue — mức sẵn sàng demo, 31/10/2026

Runtime v2.4 reconciled đã qua kiểm tra local và smoke API có giới hạn. Typecheck, production build, API/D1 local và các browser journey chính đã PASS. Hosted và rehearsal chưa nghiệm thu; chưa phát hành.

## Bằng chứng xác minh

Các lệnh chạy trong `Prototype-OpenAI/`. Summary dưới đây do root/runtime agent chạy và cung cấp trong cùng phiên; không suy kết quả từ việc có test.

- Vitest toàn bộ suite, exit 0:

```text
Test Files 9 passed (9)
Tests 133 passed (133)
Duration 7.73s
```

- `node --import tsx lib/order-rescue-v2/cli.ts`, exit 0:

```text
30/30 FINAL v2.4 reconciled scenarios match. This checks synthetic behavior, not model accuracy.
```

30 case gồm 22 có reply, 5 no-reply, 3 NOT_ASKED; final 17 STANDARD_REATTEMPT và 13 ESCALATE_REVIEW. Đây là Replay từ assessment dựng sẵn đi qua validation/policy, không là accuracy của model.

- Legacy Replay, exit 0:

```text
25/25 case khớp golden (sheet v0.5) · chế độ REPLAY
```

## Live API smoke

Kết quả sanitized: [live-smoke-2026-10-31.json](live-smoke-2026-10-31.json). Bắt đầu `2026-10-31T06:32:23.331Z`; chỉ dữ liệu synthetic. Dùng đúng giới hạn 10 request được duyệt: 5 Responses và 5 Decisions, cả 10 HTTP 200. Không có thêm request live được phép; không tự chạy lại để làm kết quả đẹp hơn.

| Phase | Kết quả quan sát | Confidence / lưu ý |
| --- | --- | --- |
| 001 initial | PERMITTED / CLARIFY, một câu hỏi | AVAILABILITY_ISSUE / MEDIUM |
| 001 reply | PERMITTED / STANDARD_REATTEMPT, không hỏi thêm | MEDIUM khác expected HIGH; final action đúng không đồng nghĩa cả sáu field đúng |
| 023 initial | ESCALATED / ESCALATE_REVIEW, không hỏi | LOGISTICS_ISSUE / HIGH |
| 024 initial | PERMITTED / CLARIFY | UNKNOWN_CAUSE / LOW |
| 005 initial | PERMITTED / CLARIFY | AVAILABILITY_ISSUE / MEDIUM |
| 005 no-reply | ESCALATED / ESCALATE_REVIEW, giữ assessment 1 | Không phát sinh request mạng mới |

Usage API ghi nhận: 12,793 input tokens, 770 output tokens, tổng 13,563 tokens trên 10 calls. Latency từng call có trong JSON. Chưa tính chi phí tiền; token và latency không phải số đo hiệu quả vận hành.

Smoke nhỏ này xác nhận đường API thật và một số nhánh chính, không đủ để tuyên bố accuracy, chất lượng toàn bộ 30 case hay readiness sản xuất. Hải/Phúc cần review lệch confidence 001 trước khi dùng claim chất lượng.

## Build, API/D1 và browser local

`npm run build`, exit 0, output:

```text
Build complete. Run `vinext start` to start the production server.
```

Khởi tạo D1 local: 3 commands thành công. `node work/api-smoke.mjs`, exit 0:

```text
10 API/D1 checks PASS; 0 live requests
```

Artifact: [api-smoke-2026-10-31.json](api-smoke-2026-10-31.json). Các check bao gồm reply 001 → retry; duplicate giữ audit; conflicting final trả 409 không sửa lịch sử; no-reply 005 giữ assessment 1, không assessment 2; duplicate/reload; 023/025/026 review không hỏi; sai question bị từ chối; unknown case 404.

Browser thực qua CUA đã xác nhận: 001 sample reply → retry, refresh giữ kết quả; 005 no-reply → review và hai mục lịch sử; 023 review ngay không câu hỏi. Kiểm tra desktop 1440px và mobile 390px; mobile document/viewport đo bằng nhau 375=375, không horizontal overflow. Screenshot sau polish: [desktop](demo-logistics-desktop.jpg), [mobile](demo-logistics-mobile.jpg). Polish cuối đã được kiểm tra browser: dropdown tiếng Việt, JSON summary trung tính, source quotes mặc định thu gọn và mở ra hiện nguyên văn. Console error list rỗng. Production build chạy lại sau polish, exit 0 với thông báo Build complete.

## Còn phải hoàn tất

- Cài dependencies và typecheck đã hoàn tất; các việc còn lại dưới đây cần nghiệm thu của team/hosted.
- Auth/ownership và persistence trên hosted chưa kiểm tra; kết quả D1 local không chứng minh hosted readiness.
- Hải/Kha review focus câu hỏi runtime khác tham chiếu workbook ở 007/013/014/015/017/018. Replay sample reply cố định chưa kiểm chứng tính hữu ích câu hỏi với buyer thật.
- Runtime hiện ghi question/reply tại T0; workbook dùng mốc synthetic T0+1/+2 phút. Không dùng các mốc này để claim thời gian xử lý.
- Lucas/cả team rehearsal 3–4 phút, cho người mới tự chạy và xác nhận họ hiểu agent hỗ trợ gì, Ops vẫn quyết định.
- Chưa publish; cần hoàn tất kiểm tra và quyền phát hành trước khi gửi link hosted cho giám khảo.

## Kiểm tra cuối

Lệnh npm ci --prefer-offline --fetch-timeout=60000 --fetch-retries=1 hoàn tất exit 0, output thực tế: added 722 packages in 16m.

Lệnh node node_modules/typescript/bin/tsc --noEmit hoàn tất exit 0, không có lỗi hoặc output. Tương đương script npm run typecheck.

Git diff --check exit 0; env, node_modules, dist và dữ liệu .wrangler được Git ignore. Không push/publish.

## Rà soát nghiệp vụ tiếp theo — 31/10/2026

- **DEMO-001 — Lucas đã chốt:** giữ expected HIGH sau reply. Buyer trực tiếp xác nhận đúng nguyên nhân, phù hợp dữ kiện hiện có và không có mâu thuẫn chưa giải quyết thì expected confidence HIGH. Confidence đo bằng chứng hỗ trợ nguyên nhân, không phải xác suất giao lại thành công. Fixture hiện đã HIGH nên không cần đổi nhãn; kết quả Live MEDIUM được giữ nguyên trong báo cáo, không sửa lịch sử hoặc ép nâng điểm. Việc làm rõ rubric/prompt và đánh giá lại Live chưa thực hiện.
- **DEMO-004 — Lucas đã chốt:** giữ MEDIUM + ESCALATE_REVIEW. Reply “Tôi vẫn muốn nhận.” chỉ xác nhận intent, không xác nhận nguyên nhân vắng mặt hoặc khả năng bố trí người nhận. Giữ AVAILABILITY_ISSUE như giả thuyết chưa xác nhận, missing_info RECEIVING_AVAILABILITY; không hỏi lần hai. Fixture hiện đã đúng nên không cần đổi nhãn.
- **DEMO-008 — Lucas đã chốt:** confidence MEDIUM trước và sau reply; final STANDARD_REATTEMPT giữ nguyên. Ops chỉ xác minh thiếu landmark, chưa xác minh đây là nguyên nhân giao thất bại. Quyết định đã ghi nhận; fixture/replay/workbook/prompt chưa đồng bộ trong lượt rà soát nghiệp vụ này.

### Rà soát toàn bộ 30 case theo nguyên tắc mới

Đối chiếu seed, expected, replay, control và hàm chọn câu hỏi thực tế. Đây là review nghiệp vụ tĩnh, không phải eval model mới; không gọi thêm API. Các mục đề xuất chưa được áp dụng vào code/dataset. Không thay đổi các dữ liệu presentation ngoài phạm vi.

| Case | Kết luận | Lý do / điểm cần xử lý |
| --- | --- | --- |
| 001 | Giữ, đã chốt | Buyer trực tiếp xác nhận đi làm là nguyên nhân; HIGH sau reply, đủ điều kiện retry. |
| 002 | Giữ | Buyer nói thiếu block nên shipper không tìm ra; chuyển ADDRESS/HIGH, bổ sung mốc cùng nơi nhận. |
| 003 | Giữ | Buyer T0 đã xác nhận ở cơ quan nên không ai nhận; HIGH ban đầu có nguồn trực tiếp. |
| 004 | Giữ, đã chốt | Reply chỉ xác nhận intent; MEDIUM + review do chưa có availability. |
| 005 | Giữ | Không reply; giữ assessment đầu, final review, không suy từ chối. |
| 006 | Cần chốt confidence | Reply xác nhận thiếu mốc và bổ sung mốc, chưa xác nhận nó gây lần thất bại. Đề xuất after MEDIUM như nguyên tắc 008; giữ retry. |
| 007 | Cần sửa trọng tâm hỏi | Runtime hỏi landmark dù cause chưa rõ; workbook hỏi trở ngại. Đề xuất ưu tiên hỏi nguyên nhân khi có CAUSE_CLARIFICATION. Reply cơ quan đóng cửa hỗ trợ HIGH; final retry hợp lý. |
| 008 | Quyết định mới đã chốt | MEDIUM cả hai phase, giữ retry; chưa đồng bộ dữ liệu. |
| 009 | Giữ | Yêu cầu giao chỗ khác vượt phạm vi; LOW/review, không đổi địa chỉ. |
| 010 | Giữ | Note thiếu mốc MEDIUM; no-reply final review. |
| 011 | Giữ | Không bịa contact logs; reply đang họp/không có người nhận xác nhận availability cause. |
| 012 | Giữ | Buyer trực tiếp xác nhận mất sóng, đã dùng lại được; HIGH/retry khi đủ điều kiện. |
| 013 | Giữ | Reply chỉ muốn nhận, thiếu cause/availability; LOW/review. Câu hỏi cause của runtime hợp lý dù khác workbook. |
| 014 | Giữ | Cause chưa rõ, hỏi cause là hợp lý; no-reply LOW/review. Không yêu cầu khớp câu intent tham chiếu từng chữ. |
| 015 | Giữ | Hỏi nguyên nhân giúp phân biệt refusal thật; reply xác nhận không còn nhu cầu; HIGH/review, không tự hoàn. |
| 016 | Giữ | Buyer giải thích thiếu COD nên xin lùi; PAYMENT/HIGH sau reply, đủ intent/COD/availability để retry. Note chưa đồng ý nhận không nhất thiết mâu thuẫn với lý do thiếu COD. |
| 017 | Cần sửa trọng tâm hỏi | T0 chưa biết đơn quà; hiện cần xác nhận đồng ý nhận, nhưng runtime hỏi availability. HIGH và final retry của reply mẫu vẫn hợp lý. |
| 018 | Cần sửa trọng tâm hỏi | Buyer đang phân vân; hỏi intent trước thay vì availability. MEDIUM/no-reply review giữ nguyên. |
| 019 | Giữ | Buyer xác nhận thiếu tiền lúc trước và đủ COD/availability hiện tại; HIGH/retry. |
| 020 | Giữ | Note mơ hồ UNKNOWN/LOW; buyer nêu shipper nhầm cổng, đủ COD và cung cấp mốc cùng khu; ADDRESS/HIGH/retry. |
| 021 | Giữ | T0 buyer đã xác nhận thiếu COD là nguyên nhân; HIGH không chỉ dựa note. |
| 022 | Giữ | Note COD MEDIUM; không reply final review. |
| 023 | Giữ outcome; làm rõ thông tin còn thiếu | Ops đã verified disruption đúng tuyến/thời gian; HIGH/review/no question đúng. LOGISTICS_VERIFICATION dễ bị hiểu thành chưa xác minh sự cố, trong khi thực tế cần Ops đánh giá điều kiện xử lý tiếp. |
| 024 | Giữ theo quyết định trước | Note đường đông UNKNOWN/LOW; buyer xác nhận cả nhà đi vắng, đủ intent/availability → HIGH/retry. |
| 025 | Giữ | Tuyến tạm ngừng chỉ từ note chưa verified; MEDIUM/review để Ops xác minh, không hỏi buyer. |
| 026 | Giữ outcome; làm rõ thông tin còn thiếu | Ops đã verified capacity pause, HIGH/review/no question đúng. Cùng vấn đề diễn đạt LOGISTICS_VERIFICATION như 023. |
| 027 | Giữ theo quyết định trước | Note cao điểm UNKNOWN/LOW; reply xác nhận thiếu COD là nguyên nhân, đã đủ tiền/availability → HIGH/retry. |
| 028 | Giữ | Buyer nói thiếu mốc nên không tìm được cổng; quan hệ nguyên nhân rõ hơn 006/008; HIGH/retry. |
| 029 | Giữ | Buyer xác nhận tắt SIM nên không nhận liên hệ, đã bật lại và có khả năng nhận; HIGH/retry. |
| 030 | Giữ | Emoji là nguồn trực tiếp nhưng không xác nhận nội dung cụ thể; UNKNOWN/LOW, các gap giữ nguyên, review. |

Tổng hợp: 23 case giữ nguyên không đề xuất sửa; 008 có thay đổi đã được Lucas chốt; 6 case cần xử lý/review theo 4 nhóm: 006 confidence, 007 câu hỏi cause, 017/018 câu hỏi intent, 023/026 diễn đạt nhu cầu review vận hành. Không có đề xuất đổi final action của 30 case trong lượt rà soát này.

Không dùng sample reply có nhiều thông tin để chứng minh một câu hỏi thực tế sẽ thu được tất cả thông tin. Khi buyer chỉ trả lời một phần, policy phải giữ nguyên yêu cầu còn thiếu và chuyển review sau khi hết một câu hỏi.

## Cập nhật theo workbook v2.5 đã được team xác nhận

### Bổ sung business rules v2.5

Đã lưu nguyên bản `Prototype-OpenAI/docs/Order_Rescue_Agent_Business_Rules_v2.5.md` và đối chiếu với prompt/runtime. Bổ sung xử lý nguồn buyer T0 cho policy (chỉ nguồn đã khả dụng, được cite và có registry), không bắt có reply mới khi đã đủ facts. Candidate retry vi phạm điều kiện bắt buộc được ghi BLOCKED thay vì ESCALATED, final vẫn review. Thêm test T0 đủ điều kiện, nguồn T0 tương lai không được dùng và retry trái disruption active. Kết quả: 145 tests/10 files PASS, typecheck exit 0; không gọi Live. Không đổi nhãn 30 fixture. Prompt đã có các quy tắc tương ứng nên không sửa câu chữ chỉ để tăng version. SQL recipes/chín bảng vẫn là thiết kế tham chiếu; chưa migrate storage D1 theo schema vật lý đó. Chưa chạy lại browser/build sau hai thay đổi policy bổ sung này.

Phần này thay thế các đề xuất chưa đồng bộ ở bảng rà soát phía trên. Nguồn chuẩn là `Prototype-OpenAI/fixtures/source/Order_Rescue_Minimal_Simulation_30_Cases_v2.5.xlsx`, giữ nguyên file gốc; SHA256 `1583b8203c2bcee44cf53ddebec79dae60cbf9d7b697a21dd3efdc72dc10261a`. Các JSON/ERD bên ngoài được workbook nhắc tới không được cung cấp nên chưa đối chiếu độc lập.

- Đồng bộ 30 case, Replay, expected, policy `demo-two-assessment-v2.5` và prompt `assess-v2.5.0`. Không đổi final outcome: 17 retry, 13 review.
- Case 008 giữ HIGH/HIGH theo nguồn xác nhận mới nhất, thay thế quyết định MEDIUM trước đó; case 006 giữ nhãn workbook, không áp dụng đề xuất giảm confidence.
- Case 023/025/026 giữ đầy đủ CURRENT_BUYER_INTENT, RECEIVING_AVAILABILITY, LOGISTICS_VERIFICATION dù chuyển review ngay. Logistics verification bao gồm đánh giá lại điều kiện vận hành, không chỉ xác minh sự cố ban đầu.
- Câu hỏi runtime tập trung: 007 hỏi trở ngại tại điểm nhận, 017/018 hỏi intent. Mỗi lượt chỉ hỏi một thông tin; không hỏi tiếp sau reply/no-reply.
- HOLD_DISRUPTION không hợp lệ cho assessment mới; lịch sử cũ vẫn đọc được. Run v2.2/v2.4 chỉ đọc, không áp nhãn expected mới lên audit cũ. Lưu nguyên fixtures v2.4 trong archive.
- Importer Python tái tạo dữ liệu từ workbook và kiểm tra 330 ô công thức final. `--check` đối chiếu cả 30 hàng; chuẩn hóa xuống dòng evidence và ghi rõ thời gian sự kiện mô phỏng trong provenance.

Kết quả kiểm tra ngày 31/10/2026:

```text
Workbook --check: Verified all 30 workbook rows
Test Files 10 passed (10)
Tests 143 passed (143)
30/30 FINAL v2.5 scenarios match
npm run typecheck: exit 0
npm run build: Build complete, exit 0
10 API/D1 checks PASS; 0 live requests
```

Test đầu trong sandbox bị EPERM ở file tạm; chạy lại ngoài sandbox đạt. API smoke đầu chưa kết nối được server; khởi động server và chạy lại đạt. Chưa chạy lại kiểm tra trình duyệt hoặc Live GPT cho v2.5. Kết quả Replay chứng minh tính nhất quán dữ liệu/luồng mô phỏng, không phải accuracy của model. Thay đổi đang local trên lucas-dev, chưa commit/push trong đợt cập nhật này.
