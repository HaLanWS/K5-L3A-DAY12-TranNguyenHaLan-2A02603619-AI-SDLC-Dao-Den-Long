# Đảo Đèn Lồng — Day 12 AI SDLC (v1.0.0)

> **Video demo:** [docs/demo/demo.mp4](docs/demo/demo.mp4) (hoặc xem tại GitHub Release v1.0.0)  
> **Sinh viên:** Trần Nguyễn Hà Lan — `2A202603619` (`2A02603619`) — Lớp `K5-L3A`  
> **Trạng thái:** Hoàn tất **Phase 4 (Bình minh: phát hành v1.0.0 · Test Contract v1.3)**

---

## Cài đặt & Chạy game (tối đa 3 lệnh)

```bash
npm ci
npm run build
npm run preview
```

Mở trình duyệt tại `http://localhost:4173`.

---

## Các lệnh chuẩn (Test Contract v1.3)

- **Chạy kiểm chứng toàn bộ:**
  ```bash
  npm run verify
  ```
- **Chạy Headless:**
  ```bash
  node dist-headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl
  ```
- **Benchmark:**
  ```bash
  npm run bench
  # hoặc: node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
  ```
- **Soak Test:**
  ```bash
  npm run soak
  # hoặc: node scripts/soak.mjs --seed 7 --nights 10 --out soak.json
  ```
- **Xuất Bảng Xếp Hạng:**
  ```bash
  node dist-headless/headless/cli.js --export-leaderboard out.json
  ```

---

## Sáng tạo của tôi
- **Hệ thống hạt Đom Đóm Nón Lá (Orbiting Hat Fireflies)** quanh chiếc nón lá truyền thống của Mây.
- **Hồn Đèn Giấy & Bầu trời chuyển sắc ấm áp** khi các Đèn Lồng Lớn bừng sáng.
- **Âm thanh tổng hợp thủ tục (Procedural Web Audio API)** không dùng file ngoài.

---

## Tài liệu & Bằng chứng
- **Retrospective:** [docs/notes/retro.md](docs/notes/retro.md)
- **ADR Đèn Cạn Dầu (Phase 3):** [docs/notes/adr-03-den-can-dau.md](docs/notes/adr-03-den-can-dau.md)
- **Changelog Breaking Changes:** [CHANGELOG.md](CHANGELOG.md)
- **Benchmark Results:** [bench.json](bench.json)
- **Soak Test Results:** [soak.json](soak.json)
