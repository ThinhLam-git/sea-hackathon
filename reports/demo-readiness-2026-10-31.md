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
