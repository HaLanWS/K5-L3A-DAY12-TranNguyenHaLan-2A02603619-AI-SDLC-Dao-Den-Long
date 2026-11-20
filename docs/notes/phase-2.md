# Phase 2 Notes — Ticket-02 ("Ba hòn đảo" · Contract v1.1)

## 1. Thay đổi chuẩn hóa so với Phase 1
- Chuẩn hóa toàn bộ tuning theo Ticket-02 Phần 1 (`game.contract.json` v1.1): sức chứa `10`, chi phí đèn `10`, bán kính nhặt `1.0m`, tương tác `2.0m`, Tỏa Sáng `3` đom đóm / `5.0m` (3D) / choáng `120` tick / đẩy `4m` trong `15` tick / hồi `3s`, vùng an toàn `6m`, Bóng Mực `4.0 m/s` (Đêm 3: `4.5 m/s`), `fall_enabled: true`.
- Chuyển điểm đom đóm từ lúc nhặt sang **+10 mỗi đom đóm nạp vào đèn**, **+5** mỗi Bóng Mực trúng Tỏa Sáng.
- Cập nhật test Phase 1 trong `tests/core.test.ts` khớp số liệu chuẩn mới (không skip âm thầm).

## 2. Acceptance Criteria Phần 3 & Kiểm chứng
| Tính năng | Cách kiểm chứng | Kết quả |
|---|---|---|
| Lướt (`dash`, 14 m/s, 0.2s, CD 1.5s) | `tests/core.test.ts` + `dash-and-fall.jsonl` | **PASS** |
| Rơi khỏi đảo (`Y < -10`, mất carried, chờ 60t, invuln 90t) | `tests/core.test.ts` + `dash-and-fall.jsonl` | **PASS** |
| 3 Bản đồ chuẩn (Đảo Bến / Đảo Cau + cầu + bục nhảy / Đảo Chuông 3 tầng + dốc + gió) | `tests/core.test.ts`, `tests/headless.test.ts`, `night3-wind-and-pause.jsonl` | **PASS** |
| Gió Lạc (idle/chase/flee/removed, cướp & Pulse thả đồ) | `tests/core.test.ts` + `night2-jumppad-charm-drifter.jsonl` | **PASS** |
| Bùa Gió (`7.2 m/s`, Lướt 0 CD, 600t, hồi 2700t) | `tests/core.test.ts` + `night2-jumppad-charm-drifter.jsonl` | **PASS** |
| Tạm dừng (`Esc/P`, `sim_tick` đóng băng) + Menu 3 Đêm + Cài đặt lưu `localStorage` + Bảng màu chuẩn + HUD đầy đủ + Âm thanh BGM/SFX | `tests/core.test.ts` + `night3-wind-and-pause.jsonl` + Vite build xanh | **PASS** |
| Headless trọn Đêm 3 (21.600 tick) ≤ 30s & tất định | `tests/headless.test.ts` + `docs/proof/phase-2/summary.md` | **PASS** |

## 3. Đánh giá & Token Phase 2
- **Cập nhật harness:** Đã cập nhật `AGENTS.md` với thứ tự 12 bước tick và 5 trạng thái Bóng Mực chuẩn v1.1.
- **Ước tính token Phase 2:** ~45K token (tái sử dụng khung kiến trúc Phase 1, tách `src/core/maps.ts` sạch sẽ).
