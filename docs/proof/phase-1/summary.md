# Phase 1 Verification Proof Summary

- Command: `npm run verify`
- Node.js: `v26.13.1` (win32)
- Harness guard (`scripts/hook-guard.mjs`): **PASS**
- Unit + CLI test suite (`vitest run`): **PASS** (full log in `vitest-output.txt`)

## Traceability Matrix (PRD-0 & Test Contract v1.0)

| Check ID | AC | Yêu cầu | Kết quả | Chi tiết đo được | Bằng chứng |
|---|---|---|---|---|---|
| `move-pickup-win` | AC-01, AC-02, AC-03 | Di chuyển + nhặt 3 đom đóm + nạp thắp L1 (L2..L5 đã sáng) → thắng (all_lit) | **PASS** | 3 motes picked, L1 lit, won at tick 111, score=876 | `move-pickup-win.jsonl` |
| `pulse-stun-push` | AC-04 | Tỏa sáng (Pulse) làm choáng và đẩy Bóng Mực ra xa 6m | **PASS** | pulse stunned S1, pushed z=5 -> z=11, state=stunned | `pulse-stun-push.jsonl` |
| `safe-radius-block` | AC-05 | Bóng Mực không đi vào vùng safe_radius (5.5m) quanh đèn đã thắp | **PASS** | min shade dist to lit L1 = 5.501m (>= 5.5m), flames=3 | `safe-radius-block.jsonl` |
| `shade-hit-loss` | AC-06 | Bóng Mực chạm gây mất lửa, rơi 50% đom đóm, bất tử 1.5s, hết lửa → thua (no_flames) | **PASS** | 2 hits spaced 90 ticks (1.5s), dropped=2, lost/no_flames at tick 91 | `shade-hit-loss.jsonl` |
| `dawn-timeout-loss` | AC-07 | Hết thời gian đêm → thua với lý do dawn | **PASS** | lost/dawn at exact tick 60 | `dawn-timeout-loss.jsonl` |
| `determinism-check` | AC-08 | 2 lần chạy cùng --seed 2026 (random_motes & random_shades bật) giống hệt từng byte | **PASS** | identical 13142 bytes across 600 ticks | `determinism-run1.jsonl` == `determinism-run2.jsonl` |
| `invalid-input-exit2` | AC-09 | File inputs sai định dạng (tick trùng) thoát mã 2 + ghi stderr | **PASS** | exit=2, stderr="Error: frames[1].tick (5) must be strictly greater than previous tick (5)" | `vitest-output.txt` |
