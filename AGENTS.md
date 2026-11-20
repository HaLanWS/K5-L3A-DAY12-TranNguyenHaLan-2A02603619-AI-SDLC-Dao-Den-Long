# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn cố định cho AI agent làm việc trên dự án **Đảo Đèn Lồng** (Day 12 AI SDLC).

## Kiến trúc & Nguyên tắc bất biến
- **Tách lõi khỏi đồ họa:** Toàn bộ logic game nằm trong `src/core/` (`maps.ts`, `simulation.ts`, `prng.ts`, `types.ts`) — pure TypeScript, không DOM, không Three.js, không `Math.random()`.
- **Single Source of Truth cho Tuning:** Mọi thông số trong `game.contract.json` được nạp trực tiếp bởi `src/headless/cli.ts` và `src/client/main.ts` rồi truyền vào `Simulation`.
- **Tính tất định (Determinism):** Dùng `Mulberry32` PRNG khởi tạo từ `--seed`. Không dùng `Math.random()`, `Date.now()`, `performance.now()` trong `src/core/`.
- **Sáng tạo không phá Contract:** Hiệu ứng & âm thanh sáng tạo chỉ đặt ở `src/client/` và không đổi output headless.

## Lệnh chuẩn
- `npm ci` · `npm run build` · `npm run preview` · `npm test` · `npm run verify`
- Headless: `node dist-headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`

## Quy ước Test Contract v1.1 (Cập nhật Phase 2)
- Hỗ trợ đủ 3 Đêm (`--night 1|2|3`): Đảo Bến (r=40m), Đảo Cau (2 đảo r=28m + cầu tre + 2 bục nhảy), Đảo Chuông (3 tầng + 2 dốc + bục nhảy + tháp chuông + gió mạnh).
- Thứ tự 12 bước cố định trong mỗi tick: Input/Pause → Giảm bộ đếm → Di chuyển + Rơi (`Y < -10`) → Nhặt đom đóm & Bùa Gió → Tương tác đèn → Vùng an toàn → Tỏa Sáng (3D 5m) → Di chuyển Bóng Mực & Gió Lạc → Chạm (Gió Lạc trước, Bóng Mực sau) → Sinh thực thể theo lịch → Xét thắng/thua → Snapshot.
- Trạng thái Bóng Mực bắt buộc đúng tên: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Tạm dừng (`pause`): `tick` tăng nhưng `sim_tick` và mọi bộ đếm đứng yên; `state: "paused"`.
- Khoảng cách dùng `<= r + 1e-9`; tọa độ làm tròn 3 chữ số thập phân, không `-0`; file `--inputs`/`--scenario` lỗi thoát mã `2`.

## Quy tắc kiểm chứng
- Không đánh dấu hoàn thành nếu chưa chạy `npm run verify` xanh. Không sửa tay `docs/proof/`.
