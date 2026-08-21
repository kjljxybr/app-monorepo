#!/usr/bin/env node

/*
 * One-command cross-branch A/B driver for the render commit baseline
 * (render-commit-baseline.e2e.js). Codifies the manual recipe from
 * apps/web/e2e/render-baselines/README.md ("Reproducing a future x baseline"):
 *
 *   1. Baseline target: a PINNED x commit (constant below, overridable via
 *      RENDER_BASELINE_X_COMMIT). Pinning keeps future runs comparable against
 *      the recorded pair even after origin/x moves on.
 *   2. Candidate target: the current repo's committed HEAD. A dirty worktree
 *      only produces a warning: the clones measure the COMMIT, never
 *      uncommitted changes (by design - numbers must describe a sha).
 *   3. Both targets are measured in disposable local clones under
 *      .tmp/render-baseline-clones/ in this repo (gitignored). Each clone is a
 *      `git clone --no-checkout <localRepoPath>` (plain path, NOT file://, so
 *      git's local transport hardlinks the object database - near-instant and
 *      near-zero additional disk for .git) followed by a detached
 *      `git checkout <sha>`. Because the object store is shared, ANY commit
 *      present in the local repository is directly checkoutable - no fetch,
 *      no deepening. Never `git clone -b x` (the local x branch is often
 *      stale - the number one pitfall); the pinned sha is checked out
 *      directly. Clones for the same sha are reused across invocations when
 *      node_modules is present (saves ~4 minutes per rerun);
 *      RENDER_BASELINE_FRESH=1 forces fresh clones. Each clone still costs
 *      roughly 8GB of disk (working tree + node_modules); purge with
 *      `rm -rf .tmp/render-baseline-clones` (or RENDER_BASELINE_CLEANUP=1).
 *   4. Hardlink caveat: the clones share the main repo's object files via
 *      hardlinks. An aggressive `git gc --prune` in the main repo could only
 *      race the brief clone step itself; once a clone exists its hardlinks
 *      keep the objects alive independently. Negligible for a ~10-minute run.
 *   5. The harness is copied from the CANDIDATE CLONE (the committed version)
 *      into the x clone byte-identical, and the one-line
 *      test:e2e:web:render-baseline script is injected into the x clone's
 *      package.json. Nothing ever requires x's local-secret-envelope.e2e.js
 *      (it executes its whole suite on require).
 *   6. Both measurements run back-to-back (x first, then candidate) with
 *      WEB_E2E_HEADLESS=true, on an otherwise idle machine; RENDER_BASELINE_*
 *      and WEB_E2E_* env knobs pass through to the harness.
 *   7. The two v2 artifacts are compared per phase (rendered components,
 *      commits, max rendered per commit, actualDuration; medians + % change,
 *      background-churn highlighted) and a machine-readable summary plus
 *      copies of both raw artifacts are written to .tmp/render-baseline/ in
 *      THIS repo. Recording a new baseline pair stays a manual, reviewed step.
 *
 * This driver requires nothing beyond Node builtins.
 */

// cspell:ignore pgrep hardlink hardlinks checkoutable

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

// The recorded v2 baseline pair was measured at this origin/x commit (see
// apps/web/e2e/render-baselines/README.md). Re-pinning policy: when the team
// decides to move the baseline, update this constant AND record a new artifact
// pair in render-baselines/ in the same change.
const DEFAULT_PINNED_X_COMMIT = 'a830dee4bbcee70217c127ec369432cd15c4b14e';

const HARNESS_RELATIVE_PATH = 'apps/web/e2e/render-commit-baseline.e2e.js';
const RUN_SCRIPT_NAME = 'test:e2e:web:render-baseline';
const RUN_SCRIPT_COMMAND = 'node apps/web/e2e/render-commit-baseline.e2e.js';
const DECISIVE_PHASE = 'background-churn';

const clonesRoot =
  process.env.RENDER_BASELINE_CLONES_DIR ||
  path.join(repoRoot, '.tmp', 'render-baseline-clones');
const outputDir = path.join(repoRoot, '.tmp', 'render-baseline');
const runsDir = path.join(outputDir, 'runs');

function parseBooleanEnv(value) {
  if (value === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

const FRESH_CLONES = parseBooleanEnv(process.env.RENDER_BASELINE_FRESH);
const CLEANUP_CLONES = parseBooleanEnv(process.env.RENDER_BASELINE_CLEANUP);

function log(message) {
  console.log(`[compare] ${message}`);
}

function banner(lines) {
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const bar = '!'.repeat(width);
  console.log(`\n${bar}`);
  for (const line of lines) {
    console.log(`! ${line.padEnd(width - 4)} !`);
  }
  console.log(`${bar}\n`);
}

function yarnBin() {
  return process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function hasCommit(cwd, sha) {
  return tryGit(['cat-file', '-e', `${sha}^{commit}`], cwd) !== null;
}

function commitSubject(cwd, sha) {
  return tryGit(['log', '-1', '--format=%s', sha], cwd) || '(subject unknown)';
}

// Streams a child process's output to the console with a per-target prefix
// (splitting on \r too, so git/yarn progress does not buffer forever) and
// tees the raw bytes into logFile for post-mortem diagnosis.
function runStreaming({ args, command, cwd, env, logFile, prefix }) {
  return new Promise((resolve, reject) => {
    const logStream = logFile
      ? fs.createWriteStream(logFile, { flags: 'a' })
      : undefined;
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pending = { stderr: '', stdout: '' };
    const emitLines = (streamName, chunk) => {
      const value = pending[streamName] + chunk.toString();
      const lines = value.split(/[\r\n]+/);
      pending[streamName] = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim().length) {
          process.stdout.write(`${prefix} ${line}\n`);
        }
      }
    };
    child.stdout.on('data', (chunk) => {
      logStream?.write(chunk);
      emitLines('stdout', chunk);
    });
    child.stderr.on('data', (chunk) => {
      logStream?.write(chunk);
      emitLines('stderr', chunk);
    });
    child.on('error', (error) => {
      logStream?.end();
      reject(error);
    });
    child.on('close', (code) => {
      for (const rest of [pending.stdout, pending.stderr]) {
        if (rest.trim().length) {
          process.stdout.write(`${prefix} ${rest}\n`);
        }
      }
      logStream?.end();
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with code ${code}` +
              `${logFile ? ` (log: ${logFile})` : ''}`,
          ),
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------

function assertNoConcurrentMeasurement() {
  // Comparable numbers require an otherwise idle machine; refuse to stack a
  // measurement on top of another harness or account-selector e2e run.
  let pids = '';
  try {
    pids = execFileSync(
      'pgrep',
      ['-f', 'render-commit-baseline|account-selector.e2e'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    pids = ''; // pgrep exits non-zero when nothing matches
  }
  if (pids) {
    throw new Error(
      'Another render measurement or account-selector e2e appears to be ' +
        `running (pids: ${pids.split('\n').join(', ')}). Back-to-back numbers ` +
        'are only comparable on an idle machine; wait for it to finish (or ' +
        'kill it) and retry.',
    );
  }
  log(
    'reminder: numbers are only comparable when nothing else heavy runs on ' +
      'this machine during the two measurements',
  );
}

function resolvePinnedXCommit() {
  const override = process.env.RENDER_BASELINE_X_COMMIT;
  if (!override) {
    return { sha: DEFAULT_PINNED_X_COMMIT, source: 'pinned default' };
  }
  if (/^[0-9a-f]{40}$/.test(override)) {
    return { sha: override, source: 'RENDER_BASELINE_X_COMMIT' };
  }
  // Allow short shas / ref names; resolve them in the local repo. CAUTION: a
  // bare `x` resolves the often-stale local branch - prefer full shas or
  // `origin/x` after a fetch.
  const resolved = tryGit(['rev-parse', `${override}^{commit}`], repoRoot);
  if (!resolved) {
    throw new Error(
      `RENDER_BASELINE_X_COMMIT=${override} does not resolve to a commit in ` +
        `${repoRoot}. Run \`git fetch origin x\` first, or pass a full sha.`,
    );
  }
  return { sha: resolved, source: `RENDER_BASELINE_X_COMMIT (${override})` };
}

function assertPinnedShaReachable(xSha) {
  // Hard requirement: the clones hardlink this repo's object store, so the
  // pinned commit must exist HERE for the detached checkout to work.
  if (!hasCommit(repoRoot, xSha)) {
    throw new Error(
      `Pinned x commit ${xSha} is not present in the local repository. Run ` +
        `\`git fetch origin x\` in ${repoRoot} and retry.`,
    );
  }
  // Soft sanity check only: with direct checkout, ancestry of origin/x is no
  // longer needed for reachability, but a pinned commit that is not on the
  // local origin/x usually means a typo'd sha or a stale remote-tracking ref,
  // so it is worth a warning.
  const originX = tryGit(['rev-parse', 'refs/remotes/origin/x'], repoRoot);
  if (!originX) {
    log(
      'WARNING: refs/remotes/origin/x does not exist locally; cannot sanity ' +
        'check that the pinned commit is on x',
    );
    return null;
  }
  const isAncestor =
    tryGit(['merge-base', '--is-ancestor', xSha, originX], repoRoot) !== null;
  if (!isAncestor && xSha !== originX) {
    log(
      `WARNING: pinned x commit ${xSha} is not an ancestor of local ` +
        `origin/x (${originX}) - measuring it anyway, but verify it really ` +
        'is an x commit (or run `git fetch origin x` to refresh the ref)',
    );
  }
  return originX;
}

// ---------------------------------------------------------------------------
// Clone preparation
// ---------------------------------------------------------------------------

function cloneIsAtSha(dir, sha) {
  return (
    fs.existsSync(path.join(dir, '.git')) &&
    tryGit(['rev-parse', 'HEAD'], dir) === sha
  );
}

function cloneHasInstall(dir) {
  return fs.existsSync(path.join(dir, 'node_modules'));
}

// One strategy for both targets: a --no-checkout clone of the LOCAL repo by
// plain path (git's local transport hardlinks the object database -
// near-instant, near-zero additional disk for .git) followed by a detached
// checkout of the exact sha. Because the object store is shared, any commit
// present in the local repository is directly checkoutable - branch names
// (including the often-stale local `x`) are never trusted, and a source HEAD
// moving mid-run cannot invalidate the clone.
function prepareClone({ label, sha }) {
  const dir = path.join(clonesRoot, `${label}-${sha.slice(0, 7)}`);
  if (!FRESH_CLONES && cloneIsAtSha(dir, sha)) {
    log(`${label} clone reused at ${dir}`);
    return { dir, reusedClone: true };
  }
  fs.rmSync(dir, { force: true, recursive: true });
  log(`${label} clone: local hardlink clone + detached checkout of ${sha}`);
  git(['clone', '--no-checkout', '--quiet', repoRoot, dir], repoRoot);
  git(
    ['-c', 'advice.detachedHead=false', 'checkout', '--detach', '--quiet', sha],
    dir,
  );
  if (!cloneIsAtSha(dir, sha)) {
    throw new Error(`${label} clone at ${dir} is not at expected ${sha}`);
  }
  return { dir, reusedClone: false };
}

async function installDependencies({ dir, logFile, prefix }) {
  if (cloneHasInstall(dir)) {
    log(`${prefix} node_modules present, skipping yarn install`);
    return { reusedInstall: true };
  }
  log(`${prefix} yarn install (about 2 minutes with a warm cache)`);
  await runStreaming({
    args: ['install'],
    command: yarnBin(),
    cwd: dir,
    env: process.env,
    logFile,
    prefix,
  });
  return { reusedInstall: false };
}

// ---------------------------------------------------------------------------
// Harness propagation (candidate clone -> x clone, byte-identical)
// ---------------------------------------------------------------------------

function ensureRunScript(cloneDir, label) {
  const packageJsonPath = path.join(cloneDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  if (pkg.scripts[RUN_SCRIPT_NAME] === RUN_SCRIPT_COMMAND) {
    return;
  }
  pkg.scripts[RUN_SCRIPT_NAME] = RUN_SCRIPT_COMMAND;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  log(`${label}: injected ${RUN_SCRIPT_NAME} script into package.json`);
}

function propagateHarness(candidateDir, xDir) {
  const source = path.join(candidateDir, HARNESS_RELATIVE_PATH);
  if (!fs.existsSync(source)) {
    throw new Error(
      `Candidate commit does not contain ${HARNESS_RELATIVE_PATH}; the ` +
        'harness must be committed on the candidate branch.',
    );
  }
  const target = path.join(xDir, HARNESS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (!fs.readFileSync(source).equals(fs.readFileSync(target))) {
    throw new Error('Harness copy into the x clone is not byte-identical');
  }
  log('harness propagated byte-identical from candidate clone into x clone');
  ensureRunScript(xDir, '[x]');
  // The candidate branch commits the script line already; ensureRunScript is
  // a no-op there, but keeps arbitrary candidate commits runnable.
  ensureRunScript(candidateDir, '[candidate]');
}

// ---------------------------------------------------------------------------
// Measurement runs
// ---------------------------------------------------------------------------

async function runMeasurement({ cloneDir, label, logFile, runArtifactDir }) {
  fs.rmSync(runArtifactDir, { force: true, recursive: true });
  fs.mkdirSync(runArtifactDir, { recursive: true });
  const startedAt = Date.now();
  log(`${label} measurement starting in ${cloneDir}`);
  await runStreaming({
    args: [RUN_SCRIPT_NAME],
    command: yarnBin(),
    cwd: cloneDir,
    env: {
      ...process.env,
      // Artifacts land in THIS repo's .tmp, one directory per run, so the
      // driver never has to guess sha-derived filenames inside the clones.
      RENDER_BASELINE_ARTIFACT_DIR: runArtifactDir,
      WEB_E2E_HEADLESS: process.env.WEB_E2E_HEADLESS || 'true',
    },
    logFile,
    prefix: label,
  });
  const artifacts = fs
    .readdirSync(runArtifactDir)
    .filter((name) => name.endsWith('-v2.json'));
  if (artifacts.length !== 1) {
    throw new Error(
      `Expected exactly one -v2.json artifact in ${runArtifactDir}, found ` +
        `${artifacts.length}`,
    );
  }
  const artifactPath = path.join(runArtifactDir, artifacts[0]);
  log(
    `${label} measurement finished in ` +
      `${Math.round((Date.now() - startedAt) / 1000)}s, artifact ${artifactPath}`,
  );
  return artifactPath;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function pctChange(xValue, candidateValue) {
  if (
    typeof xValue !== 'number' ||
    typeof candidateValue !== 'number' ||
    xValue === 0
  ) {
    return null;
  }
  return Math.round(((candidateValue - xValue) / xValue) * 1000) / 10;
}

function formatPct(value) {
  if (value === null) {
    return 'n/a';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function phaseMedian(phase, metric) {
  if (!phase) {
    return null;
  }
  if (metric === 'actualDurationMs') {
    return phase.actualDurationAvailable === true
      ? phase.actualDurationMs.median
      : null;
  }
  return phase[metric].median;
}

function comparePhases(xArtifact, candidateArtifact) {
  const candidateByName = new Map(
    candidateArtifact.phases.map((phase) => [phase.phase, phase]),
  );
  const phaseNames = xArtifact.phases.map((phase) => phase.phase);
  for (const phase of candidateArtifact.phases) {
    if (!phaseNames.includes(phase.phase)) {
      phaseNames.push(phase.phase);
    }
  }
  const xByName = new Map(
    xArtifact.phases.map((phase) => [phase.phase, phase]),
  );
  const metrics = [
    ['renderedComponents', 'rendered components / iteration (median)'],
    ['commits', 'React commits / iteration (median)'],
    ['maxRenderedInCommit', 'max rendered in one commit (median)'],
    ['actualDurationMs', 'actualDuration ms / iteration (median)'],
  ];
  const rows = phaseNames.map((phaseName) => {
    const entry = { phase: phaseName };
    for (const [metric] of metrics) {
      const xValue = phaseMedian(xByName.get(phaseName), metric);
      const candidateValue = phaseMedian(
        candidateByName.get(phaseName),
        metric,
      );
      entry[metric] = {
        candidate: candidateValue,
        pctChange: pctChange(xValue, candidateValue),
        x: xValue,
      };
    }
    return entry;
  });

  for (const [metric, title] of metrics) {
    console.log(`\n${title}:`);
    console.table(
      rows.map((row) => ({
        phase: row.phase === DECISIVE_PHASE ? `${row.phase} **` : row.phase,
        x: row[metric].x ?? 'n/a',
        candidate: row[metric].candidate ?? 'n/a',
        change: formatPct(row[metric].pctChange),
      })),
    );
  }
  const churn = rows.find((row) => row.phase === DECISIVE_PHASE);
  if (churn) {
    console.log(
      `** ${DECISIVE_PHASE} is the decisive phase for reload dedup work ` +
        '(no-op AccountUpdate reload cycles):',
    );
    console.log(
      `   rendered ${churn.renderedComponents.x} -> ` +
        `${churn.renderedComponents.candidate} ` +
        `(${formatPct(churn.renderedComponents.pctChange)}), ` +
        `commits ${churn.commits.x} -> ${churn.commits.candidate} ` +
        `(${formatPct(churn.commits.pctChange)}), ` +
        `duration ${churn.actualDurationMs.x ?? 'n/a'}ms -> ` +
        `${churn.actualDurationMs.candidate ?? 'n/a'}ms ` +
        `(${formatPct(churn.actualDurationMs.pctChange)})`,
    );
  }
  return rows;
}

function compareBoot(xArtifact, candidateArtifact) {
  const boot = {};
  for (const metric of ['commits', 'renderedComponents', 'actualDurationMs']) {
    const xValue = xArtifact.boot[metric];
    const candidateValue = candidateArtifact.boot[metric];
    boot[metric] = {
      candidate: candidateValue,
      pctChange: pctChange(xValue, candidateValue),
      x: xValue,
    };
  }
  console.log(
    `\nboot: commits ${boot.commits.x} -> ${boot.commits.candidate} ` +
      `(${formatPct(boot.commits.pctChange)}), rendered ` +
      `${boot.renderedComponents.x} -> ${boot.renderedComponents.candidate} ` +
      `(${formatPct(boot.renderedComponents.pctChange)}), duration ` +
      `${boot.actualDurationMs.x}ms -> ${boot.actualDurationMs.candidate}ms ` +
      `(${formatPct(boot.actualDurationMs.pctChange)})`,
  );
  return boot;
}

function comparabilityWarnings(xArtifact, candidateArtifact) {
  const warnings = [];
  if (
    xArtifact.metricsVersion !== 2 ||
    candidateArtifact.metricsVersion !== 2
  ) {
    warnings.push(
      `metricsVersion mismatch: x=${xArtifact.metricsVersion} ` +
        `candidate=${candidateArtifact.metricsVersion}`,
    );
  }
  for (const key of ['iterations', 'churnEmits', 'quietMs']) {
    if (xArtifact[key] !== candidateArtifact[key]) {
      warnings.push(
        `${key} mismatch: x=${xArtifact[key]} candidate=${candidateArtifact[key]}`,
      );
    }
  }
  if (
    xArtifact.environment.headless !== candidateArtifact.environment.headless
  ) {
    warnings.push(
      `headless mismatch: x=${xArtifact.environment.headless} ` +
        `candidate=${candidateArtifact.environment.headless}`,
    );
  }
  for (const warning of warnings) {
    log(`WARNING: ${warning} - the comparison may not be valid`);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Clone cache maintenance
// ---------------------------------------------------------------------------

function pruneCloneCache(keepDirs) {
  if (!fs.existsSync(clonesRoot)) {
    return;
  }
  for (const name of fs.readdirSync(clonesRoot)) {
    const fullPath = path.join(clonesRoot, name);
    // Only ever touch directories the driver itself created.
    const isDriverClone = /^(x|candidate)-[0-9a-f]{7,40}$/.test(name);
    const keep = keepDirs.includes(fullPath) && !CLEANUP_CLONES;
    if (isDriverClone && !keep) {
      log(`removing clone ${fullPath}`);
      fs.rmSync(fullPath, { force: true, recursive: true });
    }
  }
  if (CLEANUP_CLONES) {
    log('RENDER_BASELINE_CLEANUP=1: clone cache removed');
  } else {
    log(
      `clone cache kept for reuse at ${clonesRoot} (about 8GB per clone; ` +
        'purge with `rm -rf` or RENDER_BASELINE_CLEANUP=1)',
    );
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  assertNoConcurrentMeasurement();

  const pinned = resolvePinnedXCommit();
  const xSha = pinned.sha;
  const localOriginX = assertPinnedShaReachable(xSha);
  const candidateSha = git(['rev-parse', 'HEAD'], repoRoot);
  const candidateBranch = git(['branch', '--show-current'], repoRoot);
  const worktreeDirty = git(['status', '--porcelain'], repoRoot) !== '';

  log(`baseline (x): ${xSha} [${pinned.source}]`);
  log(`  ${commitSubject(repoRoot, xSha)}`);
  if (localOriginX !== xSha) {
    log(`  note: local origin/x has moved on to ${localOriginX}`);
  }
  log(
    `candidate:    ${candidateSha} ` +
      `[HEAD${candidateBranch ? ` of ${candidateBranch}` : ', detached'}]`,
  );
  log(`  ${commitSubject(repoRoot, candidateSha)}`);
  if (xSha === candidateSha) {
    log('WARNING: baseline and candidate are the same commit');
  }
  if (worktreeDirty) {
    banner([
      'WORKTREE IS DIRTY: only the committed HEAD is measured.',
      'Uncommitted changes are excluded BY DESIGN - the numbers',
      'must describe a commit. Commit your changes first if they',
      'are meant to be part of the candidate measurement.',
    ]);
  }

  fs.mkdirSync(clonesRoot, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });
  const runId = new Date()
    .toISOString()
    .replace(/\..+$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-');
  const prepareLog = (label) =>
    path.join(runsDir, `${runId}-${label}-prepare.log`);
  const measureLog = (label) =>
    path.join(runsDir, `${runId}-${label}-measure.log`);

  if (FRESH_CLONES) {
    log('RENDER_BASELINE_FRESH=1: ignoring any cached clones');
  }
  const candidateClone = prepareClone({
    label: 'candidate',
    sha: candidateSha,
  });
  const xClone = prepareClone({ label: 'x', sha: xSha });
  const candidateInstall = await installDependencies({
    dir: candidateClone.dir,
    logFile: prepareLog('candidate'),
    prefix: '[candidate]',
  });
  const xInstall = await installDependencies({
    dir: xClone.dir,
    logFile: prepareLog('x'),
    prefix: '[x]',
  });

  // Re-propagated on every run (even with cached clones) so the x clone always
  // carries the candidate commit's harness byte-identical.
  propagateHarness(candidateClone.dir, xClone.dir);

  // Back-to-back, x first, matching the recorded pairs' protocol.
  const xRunDir = path.join(runsDir, `${runId}-x`);
  const candidateRunDir = path.join(runsDir, `${runId}-candidate`);
  let xArtifactPath;
  let candidateArtifactPath;
  try {
    xArtifactPath = await runMeasurement({
      cloneDir: xClone.dir,
      label: '[x]',
      logFile: measureLog('x'),
      runArtifactDir: xRunDir,
    });
    candidateArtifactPath = await runMeasurement({
      cloneDir: candidateClone.dir,
      label: '[candidate]',
      logFile: measureLog('candidate'),
      runArtifactDir: candidateRunDir,
    });
  } catch (error) {
    banner([
      'A measurement run FAILED. Clones and logs are kept for diagnosis:',
      `x clone:         ${xClone.dir}`,
      `candidate clone: ${candidateClone.dir}`,
      `logs + partial artifacts: ${runsDir} (run id ${runId})`,
    ]);
    throw error;
  }

  const xArtifact = JSON.parse(fs.readFileSync(xArtifactPath, 'utf8'));
  const candidateArtifact = JSON.parse(
    fs.readFileSync(candidateArtifactPath, 'utf8'),
  );
  const warnings = comparabilityWarnings(xArtifact, candidateArtifact);

  console.log(
    `\n=== Render baseline comparison: x ${xSha.slice(0, 7)} vs candidate ` +
      `${candidateSha.slice(0, 7)} ===`,
  );
  const phases = comparePhases(xArtifact, candidateArtifact);
  const boot = compareBoot(xArtifact, candidateArtifact);

  const pairName = `compare-${xSha.slice(0, 7)}-vs-${candidateSha.slice(0, 7)}-${runId}`;
  const xCopyPath = path.join(outputDir, `${pairName}-x-raw.json`);
  const candidateCopyPath = path.join(
    outputDir,
    `${pairName}-candidate-raw.json`,
  );
  fs.copyFileSync(xArtifactPath, xCopyPath);
  fs.copyFileSync(candidateArtifactPath, candidateCopyPath);

  const summary = {
    boot,
    candidate: {
      branch: candidateBranch || '(detached)',
      clone: candidateClone.dir,
      environment: candidateArtifact.environment,
      git: candidateArtifact.git,
      rawArtifact: candidateCopyPath,
      reusedClone: candidateClone.reusedClone,
      reusedInstall: candidateInstall.reusedInstall,
      sha: candidateSha,
      timestamp: candidateArtifact.timestamp,
    },
    churnEmits: xArtifact.churnEmits,
    comparedAt: new Date().toISOString(),
    driver: {
      arch: os.arch(),
      nodeVersion: process.version,
      platform: process.platform,
    },
    iterations: xArtifact.iterations,
    metricsVersion: 2,
    phases,
    warnings,
    worktreeDirty,
    x: {
      clone: xClone.dir,
      environment: xArtifact.environment,
      git: xArtifact.git,
      pinnedSource: pinned.source,
      rawArtifact: xCopyPath,
      reusedClone: xClone.reusedClone,
      reusedInstall: xInstall.reusedInstall,
      sha: xSha,
      timestamp: xArtifact.timestamp,
    },
  };
  const summaryPath = path.join(outputDir, `${pairName}.json`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  log(`summary: ${summaryPath}`);
  log(`raw artifacts: ${xCopyPath}`);
  log(`               ${candidateCopyPath}`);

  pruneCloneCache([candidateClone.dir, xClone.dir]);

  log(`total wall time: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  log(
    'To make this pair the recorded baseline: copy the two raw artifacts ' +
      'into apps/web/e2e/render-baselines/ (sha-keyed names, full shas in ' +
      'the table) and update that README - recording is a manual, reviewed ' +
      'step and is never done automatically.',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
