# Judge demo — 31/10/2026

## Phạm vi đã triển khai

UI dành cho giám khảo chỉ trình diễn DEMO-001 và DEMO-023. Bố cục lấy cảm hứng từ ảnh Lucas cung cấp: tiến trình phía trên, ba vùng Case → Agent → Policy/Ops, hướng dẫn trạng thái ở dưới. Màu nền #f8f8f1, chữ #26375f, navy #283e87, đường phân cách #d9ddce; Segoe UI có hỗ trợ tiếng Việt. Màu xanh lá dành cho retry, màu đỏ nhạt dành cho review. Không thêm đồng hồ xử lý, KPI hoặc trạng thái giao thành công.

- 001: đọc note → xem một câu hỏi → xem reply mẫu → đánh giá → đề xuất giao lại, có trước/sau.
- 023: note và tín hiệu Ops verified → logistics → không hỏi buyer → chuyển Ops.
- Dữ liệu chính: ID case, ghi chú, attempts, return state, deadline mô phỏng; hypothesis, gap chính, một câu hỏi/reply; đề xuất và lý do policy, vai trò Ops.
- Thu gọn evidence đầy đủ, confidence, missing_info và lịch sử trong disclosures.
- Bỏ selector 30 case, Live GPT, nhập reply tùy ý, download JSON khỏi UI showcase. Backend và 30 fixture vẫn giữ nguyên.
- Đây là Replay, không gọi model thật; mọi nhãn mô phỏng vẫn hiển thị. Reload mở lượt mới; Chạy lại tạo lượt mới, không sửa audit cũ.

## Kiểm tra

- Typecheck: exit 0.
- Production build: Build complete, exit 0 (có cảnh báo plugin timing của framework).
- Browser: 001 sample → retry; 023 → review/no question; đổi case, chạy lại, sao chép đề xuất đã kiểm tra.
- Rendered audit: desktop 1440×1000 (91 elements), mobile 320×850 (82 elements), CLEAN; không có blocker/high/warn; có keyboard pass.
- Source finish lint: 0 blocker/high, 1 cảnh báo thẩm mỹ dấu chấm giữa metadata. Giữ vì đây là nhãn mô phỏng ngắn theo hướng tham khảo, không ảnh hưởng chức năng.
- State matrix: COMPLETE; loading/populated và luồng thao tác được quan sát. Error/failure được review từ code; chưa inject lỗi mạng hoặc kiểm tra đăng nhập hosted trong trình duyệt. Không coi matrix là chứng nhận accessibility đầy đủ.
- Không gọi thêm OpenAI live. Không đổi policy/data; không chạy lại toàn bộ unit suite cho thay đổi UI này.

## Cách thử

Mở localhost:5173; case 001 mặc định. Bấm Xem phản hồi mẫu, rồi Đánh giá phản hồi. Đọc đề xuất và phần Điều gì đã thay đổi. Chọn Tuyến giao bị ngập để xem nhánh không hỏi buyer. Mở lịch sử nếu cần đối chiếu.

Chưa publish lên link hosted, chưa commit/push phần UI mới. Cần xác minh sign-in/ownership trên hosting và rehearsal trước khi gửi link cho giám khảo.

## Tách module và publish

UI được tách vào `Prototype-OpenAI/features/judge-demo/`; `app/page.tsx` chỉ mount component. Typecheck và build sau tách đều exit 0. Target Site mới lưu ở `.openai/hosting.judge.json`, không thay project ID cũ. Quyền truy cập và kết quả deployment được báo riêng sau khi publish hoàn tất.
