# Judge demo UI

Module giao diện độc lập dành cho giám khảo, được mount từ `app/page.tsx`.

- `JudgeDemo.tsx`: hai hành trình Replay DEMO-001 và DEMO-023.
- `judge.css`: style được scope trong `.judge-app`.
- Dùng API `/api/runs` và `/api/runs/:id/reply`; type contract từ `lib/order-rescue-v2/view.ts`.
- Không chứa policy engine hoặc bản sao fixture; backend vẫn là nguồn xử lý duy nhất.
- Không gọi OpenAI live. Không cần secret riêng cho UI.

Đây là module riêng trong cùng deployment, không phải microservice riêng. Chạy và build từ `Prototype-OpenAI` bằng `npm run dev` và `npm run build`.

Muốn thay trang chủ, sửa adapter `app/page.tsx`; không cần di chuyển backend.

## Hosting riêng cho judge demo

Site ID: `appgprj_6ae5a2b9b66c819186bf3a21c969891c`.
URL dự kiến: https://order-rescue-judge-demo.flashybard1.chatgpt.site

Target được lưu tại `.openai/hosting.judge.json`. Manifest `.openai/hosting.json` cũ được giữ nguyên. Khi publish judge demo, dùng checkout riêng của source repository Site này, và dùng `hosting.judge.json` làm `.openai/hosting.json` trong checkout đó. Không copy secrets, .git, node_modules hoặc runtime D1 từ checkout phát triển. Site dùng D1 riêng và migrations đã có; Replay không cần API key.
