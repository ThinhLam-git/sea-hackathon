# Order Rescue — Giải thích cập nhật bộ 30 case v2.4

Ngày cập nhật: 31/10/2026 (giờ Việt Nam).

## 1. Mục đích và phạm vi

Đồng bộ bộ case với các quyết định Lucas đã chốt sau audit, làm cơ sở cho team cập nhật system prompt và workflow tiếp theo.

- [Workbook gốc](C:/Users/team3/Downloads/Order_Rescue_Minimal_Simulation_30_Cases_v2.4.xlsx).
- [Workbook đã cập nhật](C:/Users/team3/.codex/visualizations/2026/10/31/01a1901f-3991-7e61-80c8-84e7decc9ab2/outputs/policy-reconciliation/Order_Rescue_Minimal_Simulation_30_Cases_v2.4_reconciled.xlsx).

File gốc được giữ nguyên. Bản cập nhật giữ 6 sheet và 30 case. Các đường dẫn trên là đường dẫn cục bộ trên máy tạo báo cáo; khi chia sẻ, cần gửi kèm workbook đã cập nhật.

Agent tổng hợp bằng chứng và đưa ra đề xuất để Ops/human review. Policy gate giới hạn đề xuất; con người quyết định và thực hiện bước tiếp theo. Dữ liệu và policy trong workbook đều là mô phỏng/minh họa.

## 2. Các quyết định đã áp dụng

| Nội dung | Trước cập nhật | Sau cập nhật | Lý do |
| --- | --- | --- | --- |
| Case 024/027 | Hypothesis ban đầu là `LOGISTICS_ISSUE`; confidence lần lượt MEDIUM/LOW | Cả hai là `UNKNOWN_CAUSE / LOW` | Note “đường đông”, “cao điểm” chưa đủ chứng minh nguyên nhân logistics. |
| Case 023/025/026 | Vẫn có câu hỏi buyer; 023/026 đề xuất HOLD, 025 hỏi trước khi chuyển review | Chuyển thẳng `ESCALATE_REVIEW`, không hỏi buyer | Trở ngại thuộc vận hành; buyer không thể xác minh hoặc gỡ điều kiện này. |
| Câu hỏi | Nhiều câu ghép nguyên nhân, intent, availability và COD | Tối đa một câu hỏi tập trung vào một khoảng trống | Giữ đúng yêu cầu một key question, tránh biến một lượt hỏi thành bảng hỏi. |
| Case 005/010/014/018/022 không reply | Final policy là `PERMITTED + CLARIFY` | Final policy là `ESCALATED + ESCALATE_REVIEW` | Quyền hỏi đã dùng hết; cần bàn giao Ops thay vì để kết quả cuối tiếp tục gợi ý hỏi. |
| Trạng thái nhãn | Các dòng ghi FINAL nhưng hướng dẫn vẫn nói cần review | Đồng bộ nhãn fixture là `FINAL` | Tránh hai cách hiểu trái nhau trong cùng workbook. |
| Thứ tự xử lý | Sơ đồ có thể được hiểu là lưu/hỏi trước khi validate | Validate → policy → persist → hiển thị/phát câu hỏi | Không sử dụng output chưa được kiểm tra làm kết quả có thẩm quyền. |

## 3. Chi tiết thay đổi theo nhóm

### 3.1. Không suy nguyên nhân logistics từ note mơ hồ

Trong `03 SCENARIOS`, cập nhật nhóm scenario và assessment ban đầu của:

- `DEMO-024`, dòng 30: `UNKNOWN_CAUSE / LOW`.
- `DEMO-027`, dòng 33: `UNKNOWN_CAUSE / LOW`.

Assessment sau reply vẫn có thể đổi hypothesis nếu buyer cung cấp bằng chứng cụ thể: case 024 chuyển sang availability; case 027 chuyển sang payment. Confidence không tăng chỉ vì buyer nói muốn nhận hàng.

### 3.2. Logistics không thuộc khả năng buyer giải quyết

Áp dụng cho `DEMO-023`, `DEMO-025`, `DEMO-026`:

- Candidate action và policy action ban đầu chuyển thành `ESCALATE_REVIEW`; policy gate là `ESCALATED`.
- `question_key`, câu hỏi và buyer reply để null/trống.
- `response_mode` chuyển thành `NOT_ASKED`.
- Assessment 2 và policy 2 đều null/trống; final chọn assessment 1.
- Bỏ các bản ghi hỏi/reply/no-reply tương ứng khỏi dữ liệu raw events của bản workbook mới; giữ nguyên bố cục và các dòng hiện có.
- Checklist chuyển sang `LOGISTICS_VERIFICATION`: Ops cần xác minh trạng thái hoặc đánh giá lại việc khôi phục vận hành. Với tín hiệu đã verified, điều này không phủ nhận xác minh ban đầu.

`NOT_ASKED` khác `USER_NO_REPLY`: trường hợp đầu không hỏi; trường hợp sau đã hỏi nhưng không có phản hồi.

Enum `HOLD_DISRUPTION` được giữ để tương thích danh mục, nhưng không còn là final action của các case logistics này. Đây là thay đổi policy của bộ mô phỏng, chưa phải thay đổi đã triển khai trong ứng dụng.

### 3.3. Một câu hỏi tập trung

Rút gọn câu hỏi ở 27 case còn được hỏi. Ba case logistics ở trên không có câu hỏi.

Ví dụ:

| Nhóm | Câu hỏi sau cập nhật |
| --- | --- |
| 016/020/027 chưa rõ trở ngại | “Điều gì khiến bạn chưa thể nhận đơn ở lần giao trước?” |
| Thiếu landmark | “Bạn có thể bổ sung một mốc dễ tìm tại địa điểm đã đăng ký không?” |
| Thiếu availability | “Bạn có thể bố trí người nhận tại địa điểm đã đăng ký vào thời điểm nào?” |
| Thiếu COD readiness | “Bạn đã sẵn sàng thanh toán đúng số tiền COD trên đơn khi nhận lại chưa?” |

Các reply giàu thông tin vẫn được giữ như dữ liệu fixture: buyer có thể tự cung cấp thêm chi tiết ngoài trọng tâm câu hỏi. Agent không được mặc định sẽ nhận được đủ các chi tiết đó. Nếu reply thực tế chỉ trả lời một phần, các điều kiện còn thiếu phải được giữ lại và chuyển Ops review khi cần; không hỏi lần hai.

Hai question key hiện có được giữ nguyên. Cần đối chiếu ý nghĩa nhóm key khi triển khai prompt, vì nội dung câu hỏi không còn luôn chỉ hỏi intent.

### 3.4. Không reply: giữ assessment, chốt review

Áp dụng cho `DEMO-005`, `DEMO-010`, `DEMO-014`, `DEMO-018`, `DEMO-022`:

1. Giữ nguyên assessment 1 và policy 1 đã ghi nhận trước câu hỏi.
2. Không tạo reply, assessment 2 hoặc policy 2 giả.
3. Final assessment lấy nguyên assessment 1; candidate `CLARIFY` trong assessment lịch sử vẫn được giữ.
4. Final policy chuyển thành `ESCALATED + ESCALATE_REVIEW`, với lý do đã hỏi nhưng không có phản hồi.

Đây là quyết định finalization riêng, không ghi đè policy 1 lịch sử. Contract mới cho phép final policy khác policy 1 trong nhánh này. Khi triển khai backend, finalization phải tạo audit decision mới.

Không phản hồi không được hiểu là từ chối, không được dùng để quy lỗi cho buyer hoặc tự cho phép hoàn hàng.

### 3.5. Sửa timezone và làm rõ đồng hồ mô phỏng

Deadline trong ô Excel gốc lưu `2026-10-28T15:00:00Z`, trong khi JSON lifecycle ghi `2026-10-28T15:00:00+07:00`; hai giá trị lệch nhau 7 giờ.

Bản cập nhật thống nhất thời điểm:

| Mốc | Giờ Việt Nam (+07:00) | UTC |
| --- | --- | --- |
| Giao thất bại | 24/10/2026 14:30 | 24/10/2026 07:30Z |
| T0 | 24/10/2026 15:00 | 24/10/2026 08:00Z |
| Deadline | 28/10/2026 15:00 | 28/10/2026 08:00Z |

Ô ngày Excel lưu UTC và hiển thị nhãn UTC; JSON có offset giữ ý nghĩa giờ Việt Nam. Các timestamp nguồn được đồng bộ tương ứng.

Để tái lập kịch bản, bổ sung timestamp synthetic: hỏi lúc 15:01, reply/no-reply lúc 15:02 ngày 24/10/2026 (+07:00). Đây là giả định phục vụ mô phỏng, không phải SLA hoặc thời gian bắt buộc phải chờ buyer.

Bộ case lịch sử dùng đồng hồ mô phỏng cố định; không tự thay bằng ngày chạy trên máy. Điều này không cho phép bỏ qua eligibility/deadline trong workflow thực tế.

### 3.6. Đồng bộ schema, hướng dẫn và công thức

- Thêm `NOT_ASKED` vào mô tả contract và dropdown response mode.
- Final source chọn mốc 2 chỉ khi có `BUYER_REPLY`; chọn mốc 1 với `USER_NO_REPLY` hoặc `NOT_ASKED`.
- Công thức final policy xử lý riêng no-reply sau CLARIFY để chuyển review.
- Final question key trống khi không hỏi, không hiển thị lỗi công thức hoặc câu hỏi không tồn tại.
- Cập nhật các sheet hướng dẫn, data flow, schema, scenarios, raw events và policy rules để khớp hành vi mới.
- Đổi `policy_version` trong operational context thành `demo-two-assessment-v2.4-reconciled`, phân biệt với đáp án cũ.
- Đồng bộ mô tả nhãn fixture là FINAL. FINAL thể hiện quyết định chốt nhãn, không chứng minh model đã trả lời đúng hay hệ thống sẵn sàng vận hành.
- Gỡ khẳng định các JSON/ERD bên ngoài đã tự đồng bộ với workbook mới, vì chưa kiểm tra hoặc cập nhật các file đó.

## 4. Kết quả kiểm tra

Đã recalculate workbook, kiểm tra dữ liệu/công thức, render các vùng thay đổi để xem bố cục, xuất file và kiểm tra lại nội dung XLSX đã lưu.

Kết quả công cụ kiểm tra file xuất:

```text
EXPORTED_WORKBOOK_VALIDATION: PASS
MODES: {'BUYER_REPLY': 22, 'USER_NO_REPLY': 5, 'NOT_ASKED': 3}
FINAL_EXPECTED_ACTIONS: {'STANDARD_REATTEMPT': 17, 'ESCALATE_REVIEW': 13}
FORMULAS: 330
```

Các kiểm tra xác nhận:

- Có 30 case riêng biệt, đều mang nhãn FINAL; giữ nguyên 6 sheet.
- Không có assessment 2/policy 2 ở nhánh không reply hoặc không hỏi.
- Ba case logistics chuyển review và không còn sự kiện hỏi/reply giả lập.
- Năm case không reply giữ assessment 1 và có final policy review.
- Final assessment khớp mốc được chọn; timezone deadline khớp nguồn lifecycle.
- Không phát hiện lỗi công thức lưu trong file xuất.
- Các giá trị và công thức ngoài phạm vi thay đổi và phụ thuộc được giữ nguyên.

Các con số 17/13 là phân bố đáp án kỳ vọng của fixture, không phải kết quả chạy agent hoặc chỉ số accuracy. Kiểm tra dùng thư viện spreadsheet và đọc lại XLSX; chưa xác nhận recalculation trực tiếp trong Microsoft Excel.

## 5. Những phần chưa thay đổi và việc tiếp theo

Lần cập nhật này thay đổi workbook và tài liệu giải thích. Chưa chỉnh system prompt, schema ứng dụng, harness, UI, fixtures trong repo hoặc các file data model/test JSON bên ngoài. Không chạy live model, không gọi API và không chạy lại bộ test ứng dụng cho thay đổi workbook này.

Các nhãn confidence còn được nêu trong audit, như case 004/008/016, chưa được sửa trong lần reconciliation này. Việc chốt FINAL không bổ sung bằng chứng mới cho những nhãn đó.

Các nhánh an toàn còn thiếu trong bộ 30 case cũng chưa được bổ sung: hết hạn, hết attempts, return started/completed, reply trùng/muộn, prompt injection, nguồn sai case và lỗi model/persistence.

Các bước triển khai tiếp theo:

1. Phúc cập nhật prompt theo contract mới: một câu hỏi tập trung, không suy diễn readiness từ intent, logistics ngoài khả năng buyer chuyển Ops.
2. Kỹ thuật đồng bộ backend/schema/evaluator với `NOT_ASKED`, giới hạn một câu hỏi và final policy riêng cho no-reply; kiểm soát bằng code, không chỉ bằng prompt.
3. Đồng bộ nguồn JSON/ERD và test với workbook đã chốt; bổ sung các nhánh an toàn còn thiếu.
4. Chạy đánh giá trên model thật với input và expected tách biệt; báo cáo kết quả thực tế trước khi đưa ra nhận định về độ tin cậy.

Không thực hiện nhắn buyer, dispatch courier, thay đổi địa chỉ/COD, hoàn hàng, refund hoặc tích hợp carrier thật. Ops/human tiếp tục là người review và quyết định hành động.
