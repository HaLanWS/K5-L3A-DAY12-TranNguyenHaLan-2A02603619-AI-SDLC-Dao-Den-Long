# Quyết định Thiết kế (ADR-03): Thay đổi Luật Cốt lõi — Đèn Cạn Dầu (Phase 3)

## Bối cảnh & Vấn đề
- Playtest trước Phase 3 cho thấy người chơi nhanh chóng thắp hết đèn trong 2 phút rồi game kết thúc mà không còn thử thách ở cuối đêm.
- Nhà thiết kế phát hành **Ticket-03 (Contract v1.2)**: chuyển mục tiêu từ *"thắp hết để thắng ngay"* sang *"giữ đèn sáng đón bình minh"*.

## Các quyết định thay thế [THAY THẾ]
1. **Nhiên liệu đèn (`fuel`, 0–100):**
   - Đèn sáng tự hao hụt `1.0 fuel/s`. Khi `fuel <= 0`, đèn tắt (`deposited = 0`, phát `lantern_out`).
   - Thắp lần đầu cần 10 đom đóm (+100 điểm); thắp lại (khi đã `ever_lit`) chỉ cần 5 đom đóm (+40 điểm).
   - Đèn đang sáng nhận thêm đom đóm để châm dầu (mỗi con +10 fuel, tối đa 100 fuel, phát `refuel`, +5 điểm/đom đóm).
2. **Bóng Mực hút dầu (`drain`):**
   - Đèn có `fuel < 30` mất vùng an toàn 6m. Bóng Mực ở trạng thái `wander` ưu tiên tiếp cận đèn yếu gần nhất; khi cách <= 2m chuyển sang `drain`, hút 5 fuel/s (phát `fuel_drain` mỗi 60 tick).
   - Tỏa Sáng trúng Bóng Mực đang drain được thưởng **+15 điểm** (thay vì +5 điểm).
3. **Luật thắng mới (`dawn_survived`):**
   - Không còn thắng sớm khi thắp đủ đèn.
   - Thắng khi sống sót đến hết giờ (`time_left_s <= 0`) và số đèn đang sáng >= `ceil(0.6 * tổng đèn)` (Đêm 1: 3/5, Đêm 2: 4/6, Đêm 3: 5/7).
   - Thưởng bình minh: mỗi đèn sáng `+50 + floor(fuel)`, mỗi ngọn lửa `+50`.
4. **Sức chứa tăng dần:**
   - `capacity = min(20, 10 + 2 * successful_lights)`.
