---
name: verify-phase
description: Run build, unit tests, headless Test Contract scenarios, determinism check, and regenerate real proof artifacts for the current phase.
---

# Verify Phase Skill

Use this skill whenever completing a phase or after modifying `src/core/`, `src/headless/`, or `game.contract.json`.

## Steps

1. Run full build for both headless CLI and 3D web client:
   ```bash
   npm run build
   ```
2. Execute the verification gate script:
   ```bash
   npm run verify
   ```
   This runs:
   - All Vitest unit & CLI contract tests (`npm test`).
   - Curated headless scenarios covering movement, mote pickup, lantern deposit/lighting, win condition, pulse stun/push, shade safe-radius repulsion, player hit/loss, and dawn timeout.
   - Determinism check (two identical runs with the same seed/scenario/inputs compared byte-for-byte).
   - Malformed input/scenario exit-code-2 check.
   - Writes genuine command outputs and JSONL traces into `docs/proof/phase-1/`.
3. Inspect the generated proof summary in `docs/proof/phase-1/summary.md` and confirm every requirement is backed by real output matching the current git tree.
4. Never manually edit files under `docs/proof/`. If a check fails, fix the code or test with a clear rationale, then re-run `npm run verify`.
