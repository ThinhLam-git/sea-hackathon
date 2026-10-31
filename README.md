# Sea × OpenAI Codex Hackathon — Order Rescue

Order Rescue hỗ trợ Ops review giao thất bại bằng bằng chứng, một câu hỏi tập trung khi cần và đề xuất qua policy gate. Dữ liệu synthetic, policy minh họa, không thực hiện hành động logistics thật.

Ứng dụng hiện tại ở [Prototype-OpenAI](Prototype-OpenAI/README.md), dùng React/Vinext, OpenAI Agents SDK/Responses/Decisions và Cloudflare D1. Bản local đang được đồng bộ với policy v2.4 reconciled đã chốt ngày 31/10/2026; không đồng nghĩa bản hosted đã được cập nhật.

- [PRD và tiêu chí nghiệm thu](docs/PRD.md)
- [Giải thích cập nhật policy](reports/policy-reconciliation-v2.4-2026-10-31.md)
- [Nguồn dữ liệu và version](Prototype-OpenAI/docs/DATA-SOURCES.md)

```sh
cd Prototype-OpenAI
npm ci
npm test
npm run typecheck
npm run demo
npm run build
```

Xem README ứng dụng để tạo local database và chạy dev server. Replay không cần key. Live GPT dùng API credits; secrets chỉ cấu hình server-side.

Team: Lucas, Hải, Kha, Phúc. Nguyên tắc: chỉ trình diễn điều đã làm thật; phân biệt Replay, Live GPT và khả năng chưa xác minh. Không đưa ra claim accuracy, tiết kiệm hoặc giảm hoàn từ dữ liệu mô phỏng.
