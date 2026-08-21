# Render commit baselines

Recorded JSON artifacts from `apps/web/e2e/render-commit-baseline.e2e.js`, the
cross-branch React render-commit baseline for account-selector UI flows on the
web app. Each file is one full run: per-flow React commit deltas (min/median/
max over 5 iterations), browser long tasks, wall time, and boot counters.

## Files

| File | Branch | Full commit | Run time (UTC) | Notes |
| --- | --- | --- | --- | --- |
| `a830dee-x.json` | `x` | `a830dee4bbcee70217c127ec369432cd15c4b14e` | 2026-08-21 02:17 | Back-to-back pair, run 1 |
| `a518e7b-sydney89_account-selector-render-performance.json` | `sydney89/account-selector-render-performance` | `a518e7b9ae42b242a169576eb30076139da6627a` | 2026-08-21 02:20 | Back-to-back pair, run 2 (started immediately after run 1) |
| `446bf0a973-sydney89_account-selector-render-performance.json` | `sydney89/account-selector-render-performance` | `446bf0a973` | 2026-08-20 14:49 | Earlier third sample, run from the development worktree |

The short shas inside the two 2026-08-21 JSONs are 7 characters because both
runs executed in fresh shallow clones (small object databases abbreviate
shorter); the table above carries the full shas.

## How the 2026-08-21 pair was produced

- Machine: Apple M4 Max (arm64), macOS 26.4.1, Node v25.2.1, Google Chrome
  151.0.7922.170.
- Both branches were shallow-cloned from the local repository into separate
  temp directories (`git clone --depth 1 file://<repo> ...`, origin/x resolved
  to `a830dee4bb`), each got its own full `yarn install`, so neither run shared
  a build cache or a `.tmp` with the other.
- The harness file from this repo at commit `3b5b19d280` ("test: fix render
  baseline harness x compatibility") was copied into BOTH clones, so the two
  runs used byte-identical harness code. On origin/x the one-line
  `test:e2e:web:render-baseline` script was added to the clone's root
  `package.json` (see reproduction steps below).
- Command in each clone, with nothing else running on the machine:
  `WEB_E2E_HEADLESS=true yarn test:e2e:web:render-baseline`
  (headless, default `RENDER_BASELINE_ITERATIONS=5`, `quietMs=800`). The x run
  finished first and the branch run started immediately afterwards, so both
  samples share machine conditions.

The 2026-08-20 sample was produced by the same command from the development
worktree with the pre-fix harness; the fix only changed the DOM signal that
ends the account-switch flow (commit counting is identical), so its numbers
remain comparable.

## Comparison (x `a830dee4bb` vs branch `a518e7b9ae`, back-to-back pair)

Median React commits per iteration:

| Phase | x median | Branch median | Change |
| --- | --- | --- | --- |
| account-switch | 83 | 82 | -1.2% |
| network-switch | 66 | 65 | -1.5% |
| selector-open-close | 44 | 44 | 0% |
| tab-switch | 22 | 28 | +27% (noise, see below) |

Median long tasks per iteration:

| Phase | x | Branch |
| --- | --- | --- |
| account-switch | 3 | 3 |
| network-switch | 4 | 4 |
| selector-open-close | 2 | 2 |
| tab-switch | 2 | 2 |

Boot (initial load through home shell + single-network pinning):

| Counter | x | Branch |
| --- | --- | --- |
| Boot commits | 370 | 373 |
| Boot long tasks | 14 | 15 |

Reading: whole-app commit counts for these four UI flows are at parity between
origin/x and the branch, within run-to-run noise. The tab-switch delta is not a
regression signal: the phase is the noisiest (first iteration always pays a
lazy-mount spike, x deltas 90/22/21/21/35 vs branch 64/28/29/23/24) and the
2026-08-20 branch sample's median was 21. The branch's render-performance work
is enforced at a finer granularity (per-provider commit budgets and render
guards in `apps/web/e2e/account-selector.e2e.js`), which this whole-app commit
counter does not resolve; this baseline's job is to catch coarse cross-branch
regressions in interaction cost, and it shows none in either direction.

## Reproducing a future x baseline

1. Copy `apps/web/e2e/render-commit-baseline.e2e.js` (only that file) onto a
   checkout of origin/x and add the one-line script to the root `package.json`:
   `"test:e2e:web:render-baseline": "node apps/web/e2e/render-commit-baseline.e2e.js"`
2. Run `WEB_E2E_HEADLESS=true yarn test:e2e:web:render-baseline` there, then
   the same command on the branch under test, back-to-back on the same idle
   machine with the same headless setting.
3. Each run writes `.tmp/render-baseline/<git-short-sha>-<branch>.json`; copy
   both artifacts into this directory and compare phase by phase. Commit
   counts are the stable signal; long tasks and wall ms are secondary.
