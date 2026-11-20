# Phase 1 Notes — PRD-0 (Đêm 1: Đảo Bến)

## 1. Phân tích yêu cầu & Giả định cho các điểm mơ hồ

| Mục | Nội dung trong PRD-0 / Contract | Giả định & Quyết định thiết kế |
|---|---|---|
| Công nghệ | Tự do, chạy được trên macOS/Linux | TypeScript + Node.js (headless thuần, 0 dependency runtime) + Three.js + Vite (bản 3D web chạy mọi OS). |
| Hình dáng & kích thước Đảo Bến | Hòn đảo tròn có 5 Đèn Lồng Lớn, ground `Y = 0` | Đảo tròn tâm `(0, 0, 0)`, bán kính `42 m`. 5 Đèn Lồng Lớn (`L1`–`L5`) đặt đều trên vòng tròn bán kính `25 m` (`L1` tại `[0, 0, 25]`, mỗi đèn cách nhau 72°). |
| Rơi khỏi đảo | `fall_enabled` do tác giả chọn | Đặt `fall_enabled: false`. Bao quanh đảo là lan can bến thuyền / dây thừng gỗ giữ Mây an toàn trên đảo, tránh phạt rơi bất ngờ. |
| Tốc độ & di chuyển | `player_speed`, không quy định quán tính | `player_speed = 6.0 m/s`, vận tốc ngang tức thời (không trễ gia tốc) để khớp chính xác kỳ vọng test headless. Nhảy: `v_y = 7.0 m/s`, trọng lực `-20 m/s²`, tiếp đất `Y = 0`. |
| Thu thập đom đóm | Đom đóm rải rác, nhặt được | `pickup_radius = 1.8 m`, `carry_capacity = 5`. Tự động nhặt khi khoảng cách XZ `<= pickup_radius` và còn chỗ chứa. Khi `random_motes: true`, sinh sẵn 15 đom đóm và tự bổ sung mỗi 4 giây nếu dưới 20 con. |
| Nạp & thắp đèn | Nạp ánh sáng vào đèn để thắp đèn | `interact_radius = 2.8 m`, `lantern_cost = 3`. Nhấn `interact` (cạnh lên `false -> true`) sẽ nạp `min(carried, lantern_cost - deposited)` vào đèn chưa thắp gần nhất trong tầm. Đạt `lantern_cost` thì đèn bật sáng (`lit = true`). |
| Tỏa sáng (Pulse) | Xua Bóng Mực, tốn ánh sáng | `pulse_cost = 1`, `pulse_radius = 7.0 m`, `pulse_stun_s = 3.0 s`, `pulse_push_m = 6.0 m`, `pulse_cooldown_s = 2.0 s`. Kích hoạt ở cạnh lên `false -> true` khi đủ ánh sáng và hết hồi chiêu. |
| Bóng Mực & vùng an toàn | Đuổi Mây, sợ đèn, chạm vào mất máu | `shade_speed = 3.8 m/s`, `shade_hit_radius = 1.2 m`, `safe_radius = 5.5 m` (chỉ áp dụng cho đèn **đã thắp** `lit = true`). Khi chạm Mây (hết `invuln_s = 1.5 s`): trừ 1 ngọn lửa (`flames` khởi đầu = 3), rơi `round(carried * 0.5)` đom đóm (`hit_drop_ratio = 0.5`). |
| Thời lượng & Thắng/Thua | Thắp hết đèn thì thắng; mất hết máu hoặc hết đêm thì thua | `night1_duration_s = 300 s`. Thắng (`won` / `all_lit`) khi đủ 5/5 đèn sáng. Thua (`lost` / `no_flames`) khi `flames == 0`, hoặc (`lost` / `dawn`) khi `time_left_s <= 0`. |
| Cách tính điểm | Có điểm số, khai báo `score.*` | `+10` / đom đóm, `+100` / đèn thắp, `+25` / Bóng Mực bị choáng bởi Pulse; khi thắng cộng thưởng `floor(time_left_s) * 2 + flames * 50`. |

## 2. Tiêu chí nghiệm thu & Bảng truy vết kiểm chứng

| ID | Yêu cầu | Cách kiểm chứng & File kịch bản | Kết quả |
|---|---|---|---|
| AC-01 | Di chuyển + xoay `cam_yaw_deg` + chuẩn hóa vector > 1 + giữ nguyên vector <= 1 + nhảy | `tests/core.test.ts` + `tests/scenarios/move-pickup-win.scenario.json` | **PASS** |
| AC-02 | Nhặt đom đóm tự động theo `pickup_radius`, giới hạn `carry_capacity`, cộng điểm | `tests/core.test.ts` + `docs/proof/phase-1/move-pickup-win.jsonl` | **PASS** |
| AC-03 | Nạp ánh sáng vào đèn (`interact` rising edge), thắp đèn và thắng khi đủ 5/5 đèn + thưởng điểm | `tests/core.test.ts` + `docs/proof/phase-1/move-pickup-win.jsonl` | **PASS** |
| AC-04 | Tỏa sáng (Pulse): tốn `pulse_cost`, đẩy `pulse_push_m`, làm choáng `pulse_stun_s`, hồi chiêu `pulse_cooldown_s` | `tests/core.test.ts` + `docs/proof/phase-1/pulse-stun-push.jsonl` | **PASS** |
| AC-05 | Bóng Mực đuổi theo, bị chặn ngoài `safe_radius` quanh đèn đã thắp | `tests/core.test.ts` + `docs/proof/phase-1/safe-radius-block.jsonl` | **PASS** |
| AC-06 | Bóng Mực chạm Mây: trừ `flames`, rơi đom đóm theo `hit_drop_ratio`, bất tử `invuln_s`, thua khi hết `flames` | `tests/core.test.ts` + `docs/proof/phase-1/shade-hit-loss.jsonl` | **PASS** |
| AC-07 | Hết thời gian Đêm 1 (`time_left_s <= 0`) kết thúc thua với lý do `dawn` | `tests/core.test.ts` + `docs/proof/phase-1/dawn-timeout-loss.jsonl` | **PASS** |
| AC-08 | Tính tất định: 2 lần chạy cùng seed + scenario + inputs ra file JSONL giống hệt từng byte | `tests/headless.test.ts` + `determinism-run1.jsonl == determinism-run2.jsonl` | **PASS** |
| AC-09 | CLI bắt lỗi định dạng `--inputs` / `--scenario` với mã thoát `2` và ghi `stderr`; hỗ trợ `--flag=value` | `tests/headless.test.ts` + `docs/proof/phase-1/summary.md` | **PASS** |
| AC-10 | Bản 3D chơi được Đêm 1 hoàn chỉnh (nón lá có đèn, đảo sáng dần, HUD, chơi lại sau thắng/thua) | Build Vite (`dist/` xanh, 0 lỗi TS) — người dùng kiểm tra chơi trực tiếp qua `npm run preview` | **BUILD PASS** (cần chơi thử trực tiếp khi quay video) |

## 3. Đánh giá Phase 1 & Phân tích lỗi AI (Independent Review)

Sau khi agent chính xây xong Phase 1, một subagent độc lập (**Independent Contract Reviewer**, chỉ có quyền đọc) đã kiểm tra toàn bộ mã nguồn, `game.contract.json` và output thật trong `docs/proof/phase-1/`. Kết quả phát hiện và sửa các lỗi thực tế sau:

1. **Sai số dấu phẩy động khi cộng dồn `1/60` làm trễ 1 tick ở biên bán kính (`simulation.ts`):**
   - *Phát hiện:* Xem trace thật `move-pickup-win.jsonl`, Mây đi `+Z` với `6.0 m/s` (`0.1 m/tick`), `M3` tại `z=9.0` đáng lẽ nhặt ở tick `72` (`z=7.2`, khoảng cách `1.8 === pickup_radius`) nhưng bị trễ sang tick `73` vì `72 * (6.0 * (1/60)) = 7.199999999999999` → `dist = 1.8000000000000007 > 1.8`.
   - *Khắc phục:* Thêm `DIST_EPS = 1e-9` cho các phép so sánh `<= r`, dùng `speed / TICK_RATE`, và bổ sung unit test biên tick `72` trong `tests/core.test.ts`.
   - *Cập nhật harness:* Ghi quy tắc `<= r + 1e-9` vào `AGENTS.md`.
2. **Đánh rơi tọa độ `y` của đom đóm từ scenario (`simulation.ts`):**
   - *Phát hiện:* `motes` hardcode `y: 0` thay vì giữ nguyên `y` khi scenario truyền `[x, y, z]`.
   - *Khắc phục:* Lưu và xuất đúng `round3(m.y)` trong snapshot.
3. **Lantern trong scenario có `deposited >= lantern_cost` nhưng không ghi `lit: true` bị kẹt không thể thắp:**
   - *Khắc phục:* Tự đặt `lit = true` khi `patch.lit === undefined && deposited >= lantern_cost`.
4. **CLI chưa hỗ trợ cú pháp `--flag=value` và chưa chặn `id: ""` ở `motes`/`shades`:**
   - *Khắc phục:* Cập nhật `parseCliArgs` và `validator.ts`, thêm test hồi quy trong `tests/headless.test.ts`.
5. **Lỗi UX nhỏ ở bản 3D (`hud.ts`, `main.ts`):**
   - Nút bấm giữ focus sau khi click có thể bị nhấn lại khi bấm `Space` để nhảy → thêm `.blur()`.
   - Phím `M` bật/tắt âm thanh chưa đồng bộ chữ trên nút HUD và chưa chặn `e.repeat` cho `R`/`M` → đã đồng bộ và chặn repeat.
6. **Doc drift trong `AGENTS.md`:**
   - `AGENTS.md` từng nhắc `src/core/config.ts` không tồn tại (thực tế `cli.ts` và `main.ts` nạp trực tiếp `game.contract.json`). Đã sửa khớp code thật.

## 4. Ước tính Token & Cách tiết kiệm (Phase 1)

- **Ước tính mức dùng Phase 1:** ~55K–75K token tổng (gồm đọc 6 tài liệu lab, thiết kế & viết core/headless/client/tests, và 1 lượt Independent Contract Reviewer).
- **Cách đã tiết kiệm token:**
  - Chốt giả định, tuning (`game.contract.json`) và tiêu chí nghiệm thu **trước khi code** nên bản build đầu tiên biên dịch xanh ngay, không phải sửa đi sửa lại kiến trúc.
  - Gộp các file độc lập vào lời gọi song song và giữ `AGENTS.md` ngắn gọn (~30 dòng).
  - Dùng script tự động `npm run verify` thay vì chạy từng lệnh rời rạc qua agent.
  - Tách reviewer độc lập chỉ đọc các file cần kiểm tra thay vì đưa toàn bộ log vào ngữ cảnh.
