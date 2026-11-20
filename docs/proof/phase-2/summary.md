# Phase 2 Verification Proof Summary (Ticket-02 · Contract v1.1)

- Command: `npm run verify`
- Node.js: `v26.13.1` (win32)
- Vitest suite: **PASS** (`vitest-output.txt`)

| Check ID | Yêu cầu | Kết quả | Chi tiết đo được |
|---|---|---|---|
| `dash-and-fall` | Lướt 14 m/s (0.2s) + rơi khỏi Đảo Bến (r>40m, Y<-10) → mất lửa & hồi sinh sau 60 tick | **PASS** | dash + fall (lost=3, flames=2) |
| `night2-jumppad-charm-drifter` | Đêm 2 Đảo Cau: Bùa Gió + Gió Lạc cướp + Tỏa Sáng buộc nhả đom đóm | **PASS** | charm=C1, stolen=3, dropped=3 |
| `night3-wind-and-pause` | Đêm 3 Đảo Chuông: Gió mạnh tại tick 1800 + Tạm dừng đóng băng sim_tick | **PASS** | wind active dir=216.397°, paused@1811, resumed@1851 |
| `headless-21600-perf` | Chạy headless trọn Đêm 3 (21.600 tick) trong <= 30 giây | **PASS** | completed in 156 ms (0.16s <= 30s) |
