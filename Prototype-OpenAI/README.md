# Order Rescue — Demo v2.4 reconciled

30 tình huống synthetic, policy minh họa và đề xuất để Ops/human review. Agent không gửi tin nhắn, dispatch, sửa địa chỉ/COD, hoàn hàng hoặc refund.

## Trải nghiệm

1. Chọn tình huống và đọc dữ kiện giao thất bại.
2. Xem nhận định và bằng chứng. Logistics ngoài khả năng buyer giải quyết chuyển thẳng Ops review.
3. Nếu cần, trả lời một câu hỏi tập trung bằng phản hồi mẫu (Replay) hoặc nội dung tự nhập (Live GPT).
4. Không phản hồi: giữ assessment ban đầu, chốt final policy review, không gọi model thêm.
5. Xem thay đổi trước/sau, lý do và lịch sử; copy đề xuất cho người review.

Replay là dữ liệu assessment dựng sẵn qua validation/policy; không phải kết quả model thật. Live GPT gọi Responses và Decisions, dùng API credits. Confidence đo mức hỗ trợ cho nguyên nhân, không phải xác suất giao thành công.

## Stack và nguồn dữ liệu

React/Vinext/TypeScript, Cloudflare Workers/D1, OpenAI Agents SDK + Responses + Decisions. Runtime hiện tại: `lib/order-rescue-v2/`. Giữ nguyên `lib/order-rescue/` làm regression cho 25 case v0.5.

Nguồn đích là workbook v2.4 reconciled trong `../outputs/policy-reconciliation-v2.4/`. Nhãn FINAL biểu thị expected đã chốt; không chứng minh accuracy. Bộ mới có 22 reply, 5 no-reply, 3 NOT_ASKED; expected final 17 retry và 13 review. Nguồn v2.2 được lưu tại `fixtures/v2/archive/v2.2/`.

Xem [nguồn dữ liệu](docs/DATA-SOURCES.md), [PRD](../docs/PRD.md) và [giải thích policy](../reports/policy-reconciliation-v2.4-2026-10-31.md).

## Chạy local

Node.js 22.13+ và npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_warstar.sql
npm run dev
```

Mở URL Local được in ra, thường là `http://127.0.0.1:5173`. Replay không cần API key. Local dùng danh tính presenter; hosted yêu cầu ChatGPT sign-in và phân quyền run theo user.

Nếu dùng Live GPT, cấu hình `.env` ignored, không đưa key vào chat/Git/browser:

```dotenv
OPENAI_API_KEY=your-own-key
ORDER_RESCUE_MODEL=gpt-5.4-mini
```

Một assessment live có thể dùng hai API request (assessment và scoring). Không tự đổi sang Replay khi live lỗi.

## Kiểm tra và regenerate

```sh
npm test
npm run typecheck
npm run demo
npm run demo:legacy
npm run build
node scripts/import-v2.mjs
```

Importer không argument regenerate từ cặp reconciled đang check-in. Nếu truyền thư mục, thư mục phải chứa `seed.json` và `test-cases.json` đúng contract reconciled; không nhập nhầm bộ v2.2 cũ.

## Giới hạn và phát hành

Luồng cố định: load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log. Kết quả chỉ được công bố sau persistence. Một câu hỏi, tối đa hai assessments; finalization no-reply là audit decision riêng, không sửa assessment/policy ban đầu.

Không dùng nhãn FINAL hoặc Replay match làm chỉ số model. Cần kiểm thử live có giới hạn, auth/ownership, lỗi, refresh và rehearsal trước khi tuyên bố sẵn sàng demo. Giữ `.openai/hosting.json`, secrets ở runtime và lịch sử cũ. Publish chỉ khi Lucas cho phép; pull hoặc sửa local không tự cập nhật bản hosted.
