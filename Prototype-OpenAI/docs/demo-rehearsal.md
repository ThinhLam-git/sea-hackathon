# Kịch bản tự chạy demo Order Rescue · 3–4 phút

## Chuẩn bị

- Mở ứng dụng, đăng nhập theo cơ chế hiện có và chọn **Replay**.
- Dùng dữ liệu giả lập và phản hồi mẫu. Replay đọc assessment đã lưu; không phải phép đo độ chính xác của model thật.
- Nếu đang xem bản ghi policy cũ, chọn **Thử lại tình huống** để tạo lượt mới.
- Mở chi tiết kỹ thuật chỉ khi cần giải thích rule, nguồn bằng chứng hoặc phiên bản policy.

## 0:00–0:30 · Vấn đề và vai trò

“Order Rescue hỗ trợ Ops xem xét đơn giao thất bại. Agent tổng hợp bằng chứng, xác định điều còn thiếu và đề xuất bước tiếp theo. Policy kiểm tra đề xuất; người vận hành quyết định hành động cuối cùng.”

Chỉ vào ba phần: bằng chứng, câu hỏi làm rõ và đề xuất. Nhắc nhãn dữ liệu giả lập; demo không gửi tin nhắn hoặc điều phối giao hàng.

## 0:30–1:45 · DEMO-001: từ thiếu thông tin đến đề xuất giao lại

1. Chọn DEMO-001. Đọc ghi chú giao hàng và phần thông tin còn thiếu.
2. Chỉ vào **một câu hỏi làm rõ** đang hiển thị. Nội dung câu hỏi được chọn theo khoảng trống bằng chứng hiện tại, không nhất thiết trùng nguyên văn câu hỏi trong workbook.
3. Bấm **Dùng phản hồi mẫu**, đọc phản hồi trước khi bấm **Đánh giá phản hồi**.
4. Đối chiếu phần **Ban đầu / Sau phản hồi** và đề xuất giao lại tiêu chuẩn sau khi policy kiểm tra.

“Phản hồi mẫu có thể tự cung cấp nhiều dữ kiện. Demo minh họa cách cập nhật đề xuất khi có bằng chứng mới; chưa chứng minh một câu hỏi sẽ luôn thu thập đủ thông tin trong thực tế.”

Không đọc confidence như xác suất giao thành công. Không mô tả giao lại đã được thực hiện.

## 1:45–2:30 · DEMO-023: lỗi logistics chuyển Ops

1. Chọn DEMO-023.
2. Chỉ bằng chứng gián đoạn logistics và kết quả chuyển Ops xem xét.
3. Chỉ phần **Không cần hỏi người mua**: người mua không thể giải quyết gián đoạn đang tồn tại, nên luồng không hỏi thêm để cố mở khóa giao lại.

“Agent giúp tập hợp lý do để Ops xử lý đúng phạm vi. Confidence cao không vượt qua policy.”

## 2:30–3:15 · DEMO-005: im lặng không phải từ chối

1. Chọn DEMO-005; đọc câu hỏi ban đầu.
2. Bấm **Không phản hồi**.
3. Kiểm tra đề xuất cuối là chuyển Ops xem xét. Assessment ban đầu được giữ lại; không có assessment thứ hai và không hỏi tiếp.
4. Mở **Lịch sử** để thấy bước chốt kết quả.

“Đây là thao tác mô phỏng không có phản hồi, không phải chờ một bộ đếm thời gian thật. Hệ thống không suy ra người mua từ chối nhận hàng.”

## 3:15–3:45 · Kết thúc ở người vận hành

Chỉ nút **Sao chép đề xuất** và lý do đi kèm. Sao chép là chuẩn bị thông tin cho Ops, không phải duyệt hay thực thi hành động.

“Giá trị chúng tôi đang minh họa là giúp Ops nhìn bằng chứng, thông tin còn thiếu và lý do đề xuất trong cùng một luồng có lịch sử. Mức tiết kiệm thời gian, giảm hoàn và độ chính xác cần được kiểm chứng bằng nghiên cứu vận hành và đánh giá model riêng.”

## Phiếu kiểm tra sau buổi tập

- DEMO-001 thay đổi đề xuất sau phản hồi mẫu; lý do dựa trên nguồn đang hiển thị.
- DEMO-023 chuyển Ops và không mở câu hỏi buyer.
- DEMO-005 chốt ESCALATE_REVIEW, giữ assessment đầu và không gọi model thêm.
- Không có phát biểu về tích hợp Shopee/SPX thật, tỷ lệ thành công hoặc mức tiết kiệm đã đo được.
- Ghi người trình bày, thời lượng thực tế và lỗi gặp phải. Tài liệu này chưa xác nhận nhóm đã diễn tập.
