# Changelog — Breaking Changes Phase 3 (Contract v1.2)

## Breaking Changes
- **Luật thắng:** Bỏ hoàn toàn thắng sớm `all_lit`. Thay bằng `dawn_survived` khi hết giờ với số đèn sáng >= 60% tổng đèn.
- **Trạng thái đèn:** Thêm `fuel` (0..100, hao 1/s) và `ever_lit`. Đèn hết dầu tắt (`lantern_out`). Thắp lại chỉ tốn 5 đom đóm.
- **Hành vi Bóng Mực:** Thêm trạng thái `drain` khi tiếp cận đèn `fuel < 30` trong <= 2m. Mất vùng an toàn khi `fuel < 30`.
- **Hệ thống điểm:**
  - Bỏ thưởng thời gian.
  - Điểm nạp đom đóm: +5 điểm / đom đóm (thay vì +10 điểm).
  - Thắp lần đầu: +100 điểm. Thắp lại: +40 điểm.
  - Pulse trúng bóng đang drain: +15 điểm (bình thường +5 điểm).
  - Thưởng bình minh: +50 + floor(fuel) cho mỗi đèn sáng, +50 cho mỗi ngọn lửa còn lại.
- **Test cũ cập nhật:** Các test kỳ vọng `game_over: all_lit` được cập nhật sang kiểm tra thắp đèn và tiếp tục duy trì đến hết giờ để đạt `dawn_survived`.
