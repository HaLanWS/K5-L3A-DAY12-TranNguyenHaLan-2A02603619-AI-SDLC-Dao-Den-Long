# Đảo Đèn Lồng — Day 12 AI SDLC

> **Video demo:** *(Sẽ cập nhật link video `.mp4` dưới 5 phút ở Phase 4 / Release `v1.0.0`)*  
> **Sinh viên:** Trần Nguyễn Hà Lan — `2A02603619` (`K5-L3A`)  
> **Trạng thái:** Hoàn thành **Phase 1 (PRD-0 · Test Contract v1.0)**

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba xoay quanh Mây — người giữ đèn nhỏ tuổi đội nón lá có treo đèn lồng — thu thập đom đóm trên **Đêm 1: Đảo Bến** để thắp lại 5 Đèn Lồng Lớn, tỏa sáng xua đuổi Bóng Mực và giữ ngọn lửa trước khi bình minh lên.

Kiến trúc tách hoàn toàn phần **lõi mô phỏng 60 tick/giây tất định** (`src/core/`) khỏi **đồ họa 3D Three.js** (`src/client/`), giúp cả bản chơi 3D và bản **headless CLI** (`src/headless/`) chạy cùng một logic và tuân thủ **Test Contract v1.0**.

---

## Cài đặt & Chạy game (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 18** (chạy được trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview
```

Mở trình duyệt tại `http://localhost:4173` để chơi Đêm 1 – Đảo Bến.  
*(Để chạy chế độ dev có hot-reload: `npm run dev`)*

---

## Điều khiển trong game 3D

| Phím / Thao tác | Hành động |
|---|---|
| `W A S D` hoặc phím mũi tên | Di chuyển Mây theo hướng camera |
| `Space` | Nhảy |
| `E` hoặc `F` | Nạp ánh sáng vào Đèn Lồng Lớn gần nhất (trong bán kính `2.8 m`) |
| `Q` hoặc `Shift` | Tỏa sáng (Pulse) xua và làm choáng Bóng Mực trong `7.0 m` (tốn `1` đom đóm) |
| `Kéo chuột` hoặc `Z` / `C` | Xoay camera 3D quanh Mây |
| `M` | Bật / tắt âm thanh |
| `R` | Chơi lại Đêm 1 ngay |

---

## Luật chơi, Tuning & Cách tính điểm

Toàn bộ tham số được khai báo tại [game.contract.json](game.contract.json) và nạp trực tiếp vào cả bản 3D lẫn headless (Single Source of Truth):

- **Di chuyển & Đảo Bến:** Tốc độ `6.0 m/s`, đảo tròn bán kính `42 m`, 5 Đèn Lồng Lớn đặt đều ở bán kính `25 m`.
  - **`fall_enabled: false`**: Đảo Bến có hàng rào lan can bến thuyền bao quanh nên Mây không bị rơi khỏi đảo và không phát sự kiện `player_hit` kiểu `fall`.
- **Đom đóm & Đèn Lồng Lớn:** Tự động nhặt trong bán kính `1.8 m` (mang tối đa `5`). Mỗi đèn cần `3` ánh sáng để thắp sáng. Khi thắp sáng, đèn tạo vùng an toàn `safe_radius = 5.5 m` khiến Bóng Mực không thể tiến vào.
- **Tỏa sáng (Pulse):** Tốn `1` đom đóm, bán kính `7.0 m`, đẩy Bóng Mực lùi `6.0 m`, làm choáng `3.0 s`, hồi chiêu `2.0 s`.
- **Bóng Mực & Máu:** Tốc độ `3.8 m/s`, tầm chạm `1.2 m`. Mây có `3` ngọn lửa; bị chạm sẽ mất `1` lửa, rơi `round(carried * 0.5)` đom đóm (`hit_drop_ratio = 0.5`) và bất tử `1.5 s`.
- **Thắng / Thua:**
  - **Thắng (`all_lit`):** Thắp sáng đủ 5/5 Đèn Lồng Lớn.
  - **Thua (`no_flames` / `dawn`):** Mất hết ngọn lửa (`flames == 0`) hoặc hết thời lượng Đêm 1 (`300 s`).
- **Cách tính điểm:**
  - Nhặt 1 đom đóm: **+10**
  - Thắp sáng 1 Đèn Lồng Lớn: **+100**
  - Làm choáng 1 Bóng Mực bằng Pulse: **+25**
  - Thưởng khi thắng: **`floor(time_left_s) * 2` + `flames * 50`**

---

## Kiểm thử & Chế độ Headless (Test Contract v1.0)

Chạy toàn bộ unit test + CLI contract test:

```bash
npm test
```

Chạy đầy đủ bộ kiểm chứng Phase 1 (guard bất biến, Vitest, 5 kịch bản headless, kiểm tra tính tất định 2 lần chạy, kiểm tra mã thoát `2` khi file lỗi) và xuất bằng chứng thật vào `docs/proof/phase-1/`:

```bash
npm run verify
```

Chạy headless CLI trực tiếp:

```bash
node dist-headless/headless/cli.js \
  --seed 42 --night 1 \
  --scenario tests/scenarios/move-pickup-win.scenario.json \
  --inputs tests/scenarios/move-pickup-win.inputs.json \
  --ticks 240 --snapshot-every 60 --out out.jsonl
```

---

## Sáng tạo của tôi

Các yếu tố sáng tạo được đặt **100% ở lớp đồ họa & âm thanh (`src/client/`)** và hoàn toàn không tồn tại trong lõi mô phỏng (`src/core/`), đảm bảo không làm thay đổi đầu ra headless theo Test Contract v1.0:

1. **Đom Đóm Nón Lá (Orbiting Hat Fireflies):** Số đom đóm Mây đang mang sẽ bay vòng tròn lấp lánh quanh chiếc nón lá và làm sáng dần chiếc đèn lồng treo ở vành nón, giúp cảm nhận lượng ánh sáng trực quan ngay trên nhân vật.
2. **Hồn Đèn Giấy & Chuyển sắc Bầu trời Đêm:** Mỗi khi một Đèn Lồng Lớn được thắp sáng, các chiếc đèn giấy nhỏ phát sáng bay bổng lên bầu trời sao, đồng thời nền trời, sương mù và ánh sáng đảo chuyển ấm dần từ xanh mực sang ánh vàng cam cổ tích.
3. **Âm thanh Đảo Đêm (Procedural Web Audio):** Toàn bộ hiệu ứng âm thanh (chuông ngũ cung tăng cao độ theo số đom đóm đang mang, tiếng ngân ấm khi thắp đèn, hợp âm tỏa sáng Pulse, âm trầm khi trúng đòn) được tổng hợp trực tiếp bằng Web Audio API mà không cần file audio ngoài.

**Bằng chứng phần lõi & Contract không bị ảnh hưởng:** `scripts/hook-guard.mjs` kiểm tra tĩnh xác nhận `src/core/` không import Three.js/DOM, và `npm run verify` đạt 16/16 test + kiểm tra tính tất định giống hệt 13,142 byte giữa 2 lần chạy (`docs/proof/phase-1/summary.md`).

---

## Tài liệu, Bằng chứng & Harness AI

- **Bằng chứng Phase 1:** [docs/proof/phase-1/summary.md](docs/proof/phase-1/summary.md) (`vitest-output.txt` + các file `.jsonl` thật)
- **Giả định, Đánh giá, Lỗi AI & Token Phase 1:** [docs/notes/phase-1.md](docs/notes/phase-1.md)
- **Harness AI & Tự động hóa:**
  - Hướng dẫn agent: [AGENTS.md](AGENTS.md)
  - Verification skill: [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md)
  - Hook guard & stop test gate: [.claude/settings.json](.claude/settings.json) & [scripts/hook-guard.mjs](scripts/hook-guard.mjs)
  - CI tự động trên GitHub Actions: [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & Nguồn tài nguyên:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md)
- **Tài liệu đề bài gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RUBRIC.md](RUBRIC.md) · [RULES.md](RULES.md)
