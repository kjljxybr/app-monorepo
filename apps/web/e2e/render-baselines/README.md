# Render commit baselines

Recorded JSON artifacts from `apps/web/e2e/render-commit-baseline.e2e.js`, the
cross-branch React render baseline for account-selector UI flows on the web
app. v1 files record per-flow React commit deltas (min/median/max over 5
iterations), browser long tasks, wall time, and boot counters. v2 files
(`metricsVersion: 2`, `-v2` suffix) additionally record per-flow rendered
composite-component deltas (React DevTools' PerformedWork semantics), the max
components rendered in a single commit, per-commit `actualDuration` sums, and
the `background-churn` phase (no-op `AccountUpdate` reload cycles).

## Files

| File | Branch | Full commit | Run time (UTC) | Notes |
| --- | --- | --- | --- | --- |
| `a830dee-x.json` | `x` | `a830dee4bbcee70217c127ec369432cd15c4b14e` | 2026-08-21 02:17 | v1 back-to-back pair, run 1 |
| `a518e7b-sydney89_account-selector-render-performance.json` | `sydney89/account-selector-render-performance` | `a518e7b9ae42b242a169576eb30076139da6627a` | 2026-08-21 02:20 | v1 back-to-back pair, run 2 (started immediately after run 1) |
| `446bf0a973-sydney89_account-selector-render-performance.json` | `sydney89/account-selector-render-performance` | `446bf0a973` | 2026-08-20 14:49 | Earlier v1 third sample, run from the development worktree |
| `a830dee-x-v2.json` | `x` | `a830dee4bbcee70217c127ec369432cd15c4b14e` | 2026-08-21 03:22 | v2 back-to-back pair, run 1 |
| `d7ed222-sydney89_account-selector-render-performance-v2.json` | `sydney89/account-selector-render-performance` | `d7ed222781` | 2026-08-21 03:26 | v2 back-to-back pair, run 2 (started immediately after run 1; the clone's local ref was named `official`, which is what the JSON's `git.branch` field records) |

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

## Reproducing a future x baseline (agent-ready recipe)

Both recorded pairs were produced with disposable shallow clones. Never run a
measurement inside a development worktree that has uncommitted changes: the
dev server compiles whatever is on disk, so the numbers stop describing any
commit, and the run competes with in-progress work.

1. Resolve the x commit to measure. CAUTION: the local `x` branch is often
   stale (it pointed at `2b82b23c5e` while origin/x was `a830dee4bb` when the
   recorded pairs were made). Always take `origin/x`:

   ```
   git -C <local-main-repo> fetch origin x
   git -C <local-main-repo> rev-parse origin/x   # record the full sha
   ```

2. Create two throwaway clones in a temp directory, cloning from the LOCAL
   repository (`file://`) so no network is needed. A plain `-b x` clone would
   pick the stale local branch, so fetch the remote-tracking ref explicitly:

   ```
   mkdir x-clone && cd x-clone && git init
   git fetch --depth 1 file://<local-main-repo> refs/remotes/origin/x
   git checkout FETCH_HEAD
   ```

   For the branch under test a normal shallow clone works:

   ```
   git clone --depth 1 -b <branch> file://<local-main-repo> branch-clone
   ```

3. `yarn install` in each clone (about 2 minutes with a warm yarn cache;
   postinstall/patch steps run normally; no mobile toolchains are needed).
4. Copy the harness from the branch under test into the x clone so both runs
   use byte-identical harness code, and add the script line to the x clone's
   root `package.json`:

   ```
   cp branch-clone/apps/web/e2e/render-commit-baseline.e2e.js x-clone/apps/web/e2e/
   ```

   `"test:e2e:web:render-baseline": "node apps/web/e2e/render-commit-baseline.e2e.js"`

   The harness is deliberately self-contained. Do NOT make it require x's
   `apps/web/e2e/local-secret-envelope.e2e.js`: on x that file executes its
   whole test suite as a require side effect. Every selector and background
   API the harness uses was verified to exist on origin/x (see the harness
   header); keep any future edit x-compatible the same way.
5. Run back-to-back on an otherwise idle machine (no parallel e2e runs or
   builds), x first, then the branch, same settings:

   ```
   WEB_E2E_HEADLESS=true yarn test:e2e:web:render-baseline
   ```

   Defaults: `RENDER_BASELINE_ITERATIONS=5`, 10 churn emits, `quietMs=800`.
6. Each run writes `.tmp/render-baseline/<git-short-sha>-<branch>-v2.json`
   inside its own clone. Copy both artifacts into this directory (keep the
   sha-keyed names; record the FULL shas in the table above - shallow clones
   abbreviate to 7 characters), extend the README tables, then delete the
   clones. Commit and rendered-component counts are the stable signal;
   actualDuration and wall ms are secondary; long tasks are incomparable to
   v1 numbers because the v2 fiber walk inflates them.

Known pitfalls, learned producing the recorded pairs:

- Stale local `x` branch (step 1) - the single most likely way to silently
  measure the wrong baseline.
- On origin/x the horizontal-layout header label carries no `account-name`
  testID; the harness therefore waits on the `AccountSelectorTriggerBase`
  container instead (fixed in `3b5b19d280`). Keep that wait if editing the
  account-switch flow.
- A fresh wallet auto-selects All Networks on boot, and in that state the
  header trigger has no stable testID on x; the harness escapes it with the
  unmeasured single-network pinning step before any phase runs.
- Comparable numbers require the same machine, same headless setting, and
  back-to-back timing; cross-machine or cross-day comparisons are not valid.

## v2: component-level renders (x `a830dee4bb` vs branch `d7ed222781`)

The v1 pair above showed commit-count parity, which is the wrong dimension for
this branch: the optimization reduces how many components re-render WITHIN
each commit and how many redundant reload cascades run, not how many top-level
commits an interaction schedules. The v2 harness (harness commit `d7ed222781`,
"test: measure component-level renders in baseline harness") measures both:

- Rendered components: in `onCommitFiberRoot` the committed fiber tree is
  walked the way React DevTools detects rendered fibers - a composite fiber
  (FunctionComponent/ClassComponent/ForwardRef/memo tags) counts iff its
  `PerformedWork` flag is set, and the walk descends only where the child
  pointer differs from the fiber's alternate, so stale flags on reused
  subtrees are never visited. The walk costs the same on both branches
  (symmetric overhead); it does inflate the long-task counter, so long tasks
  are recorded but no longer compared.
- actualDuration: installing the devtools hook before load puts React dev
  roots in ProfileMode, so the finished root's `actualDuration` (ms of render
  work per commit) is summed per phase. Both runs had it populated for every
  commit (`commitsMissingDuration: 0`).
- Fixture: 3 HD wallets x 2 indexed accounts, chain accounts on evm--1 +
  btc--0 with the default derive type (12 chain accounts), so selector lists
  and consumers have realistic breadth.
- New phase `background-churn`: with Home settled and NOTHING changed in the
  data, `AccountUpdate` is emitted 10 times on the app event bus from page
  context (`$$appGlobals.$appEventBus`, assigned unconditionally in
  `packages/shared/src/eventBus/appEventBus.ts` on both branches), each emit
  in its own quiescent window, far beyond the 150ms reload throttle, so each
  emit triggers one full reload cycle. On both branches
  `AccountSelectorEffects` schedules `reloadActiveAccountInfo` on this event
  (origin/x `AccountSelectorEffects.tsx:224`, branch `:1032`; both throttle at
  150ms trailing).

Both runs executed back-to-back in fresh shallow clones with byte-identical
harness code (same protocol as the v1 pair; x run 03:22 UTC, branch run
started immediately after), Apple M4 Max, macOS 26.4.1, Node v25.2.1, Chrome
151, headless, 5 iterations per interactive phase, 10 churn emits.

### Rendered components (median per iteration)

| Phase | x | Branch | Change |
| --- | --- | --- | --- |
| account-switch | 11141 | 11188 | +0.4% |
| network-switch | 17059 | 17181 | +0.7% |
| selector-open-close | 6570 | 6602 | +0.5% |
| tab-switch | 6868 | 7659 | +12% (noise, see below) |
| background-churn | 3547 | 253 | **-93%** |

### Commits (median per iteration)

| Phase | x | Branch | Change |
| --- | --- | --- | --- |
| account-switch | 85 | 83 | -2% |
| network-switch | 60 | 59 | -2% |
| selector-open-close | 46 | 46 | 0% |
| tab-switch | 20 | 27 | +35% (noise, see below) |
| background-churn | 14 | 5 | **-64%** |

### Max rendered components in a single commit (median per iteration)

| Phase | x | Branch | Change |
| --- | --- | --- | --- |
| account-switch | 1467 | 1443 | -2% |
| network-switch | 2002 | 2025 | +1% |
| selector-open-close | 1229 | 1205 | -2% |
| tab-switch | 1637 | 1613 | -1% |
| background-churn | 771 | 113 | **-85%** |

### actualDuration ms of render work (median per iteration)

| Phase | x | Branch | Change |
| --- | --- | --- | --- |
| account-switch | 410.1 | 414.4 | +1% |
| network-switch | 500.8 | 493.9 | -1% |
| selector-open-close | 282.4 | 310.9 | +10% |
| tab-switch | 297.8 | 334.3 | +12% |
| background-churn | 197.7 | 18.4 | **-91%** |

Boot: x 364 commits / 46702 rendered / 2096.3ms; branch 362 commits / 44847
rendered / 2159.5ms - parity.

### background-churn per-emit detail

Every emit is a pure no-op: same account, same networks, nothing in the data
changed. Rendered components per emit:

- x: 2633, 4688, 3774, 3774, 4461, 3547, 4461, 2633, 3547, 3547 - never
  below 2633; every single no-op event re-renders every `useActiveAccount`
  consumer.
- branch: 235, 1376, 1149, 915, 1, 253, 235, 1, 1142, 2776 - two emits cost
  1 component, the median costs 253, and even the worst emit (2776) is barely
  above x's best (2633).

Mechanism (verified in source): on x, `reloadActiveAccountInfo`
(`packages/kit/src/states/jotai/contexts/accountSelector/actions.tsx:654-657`
at `a830dee4bb`) unconditionally writes `activeAccountsAtom` with a fresh
object identity even when the rebuilt info is deep-equal, and
`markActiveAccountInitDone` (`:607-612`) unconditionally rewrites the
init-done atom the same way - so every no-op reload notifies every consumer.
On the branch, the deep-equal rebuild short-circuits into a `Noop` outcome
with no atom write (`actions.tsx:1207-1231`) and the init-done write is gated
(`:980-988`). The residual branch cost (the ~1k-component emits) comes from
the parts of the reload cycle that still run; the 1-component emits show the
gate suppressing the cascade entirely.

### Reading

The four interactive flows are at parity on every metric - the branch's
optimization does not change what an actual account/network switch must
re-render, and no interactive regression appears. The tab-switch deltas are
the same first-iteration lazy-mount noise documented for v1: commit deltas
here are x 64/20/20/27/20 vs branch 60/20/20/27/31 - identical except the
last iteration, where the median picker lands on 20 vs 27 - and rendered
deltas x 23856/6868/6868/7761/6868 vs branch 22313/6766/6806/7659/8800 tell
the same story. The +10-12% duration deltas on the two cheapest phases are
within run-to-run duration noise. The decisive result is background-churn: a
redundant background `AccountUpdate` costs x ~3.5k component renders and
~198ms of render work per event, and costs the branch ~253 renders and ~18ms
(-93% / -91%), with commits down 14 -> 5. This is precisely the dimension the
v1 commit counter could not resolve, and it confirms the branch's noop-gate /
subscription-isolation work does what it claims without regressing the
interactive flows.
