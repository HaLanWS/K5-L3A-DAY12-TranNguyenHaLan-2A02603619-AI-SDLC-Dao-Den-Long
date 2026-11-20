# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn cố định cho AI agent làm việc trên dự án **Đảo Đèn Lồng** (Day 12 AI SDLC).

## Kiến trúc & Nguyên tắc bất biến
- **Tách lõi khỏi đồ họa:** Toàn bộ logic game nằm trong `src/core/` (pure TypeScript, không DOM, không Three.js, không `Math.random()`). Cả bản 3D (`src/client/`) và bản headless (`src/headless/`) phải dùng chung một `Simulation`.
- **Single Source of Truth cho Tuning:** Mọi thông số trong `game.contract.json` được nạp trực tiếp bởi `src/headless/cli.ts` và `src/client/main.ts` rồi truyền vào `Simulation`. Không hardcode lại số tuning ở nơi khác.
- **Tính tất định (Determinism):** Mọi yếu tố ngẫu nhiên trong `src/core/` bắt buộc dùng `Mulberry32` PRNG khởi tạo từ `--seed`. Không dùng `Math.random()`, `Date.now()`, hay `performance.now()` trong logic game.
- **Sáng tạo không phá Contract:** Tính năng sáng tạo (hiệu ứng, âm thanh, thực thể trang trí) chỉ đặt ở `src/client/` và tuyệt đối không làm thay đổi đầu ra headless.

## Lệnh chuẩn
- Cài đặt: `npm ci`
- Build (client + headless): `npm run build`
- Chạy game 3D: `npm run preview` (hoặc `npm run dev`)
- Chạy test đơn vị + headless contract: `npm test`
- Chạy kiểm chứng toàn bộ & xuất bằng chứng: `npm run verify`
- Chạy headless trực tiếp:
  `node dist-headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`

## Quy ước Test Contract v1.0
- 60 tick/giây cố định (`dt = 1/60`). Tick 0 snapshot trước khi áp dụng input. Bước `k` đọc input tick `k`, tạo trạng thái `k+1`, sự kiện ghi `tick = k+1`.
- Khoảng cách đo trên mặt phẳng XZ (`<= r + 1e-9` để tránh sai số dấu phẩy động khi cộng dồn `1/60`). Tọa độ làm tròn 3 chữ số thập phân, không có `-0`.
- Dựng scenario không phát sự kiện và không cộng điểm; giữ nguyên tọa độ `y` của mọi thực thể do scenario chỉ định; nếu lantern có `deposited >= lantern_cost` và không khai báo `lit`, tự đánh dấu `lit = true`.
- File `--inputs` hoặc `--scenario` sai định dạng bắt buộc thoát với mã `2` và ghi lỗi ra `stderr`. Hỗ trợ cả `--flag value` và `--flag=value`.

## Quy tắc kiểm chứng
- Không đánh dấu hoàn thành nếu chưa chạy `npm run verify` và xác nhận tất cả test xanh.
- Không sửa tay file output trong `docs/proof/`.
- Commit nhỏ, rõ mục đích. Không commit `.env`, API key hoặc token.
