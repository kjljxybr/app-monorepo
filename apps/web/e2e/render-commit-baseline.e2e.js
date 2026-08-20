#!/usr/bin/env node

/*
 * Cross-branch React render-commit baseline for account-selector UI flows.
 *
 * Purpose
 * -------
 * Measures how many React commits (plus browser long tasks and wall time) a
 * fixed set of account-selector interactions costs on the web app:
 *   - account-switch:      open the account selector and pick the other account
 *   - network-switch:      toggle evm--1 <-> btc--0 through the network trigger
 *   - selector-open-close: open the account selector and dismiss it
 *   - tab-switch:          Wallet <-> Trade sidebar tab round trip
 * Each flow runs RENDER_BASELINE_ITERATIONS times (default 5) and the per
 * iteration commit deltas are reported as min/median/max, so two runs of this
 * script on two branches quantify a render optimization as "switching an
 * account went from N commits to M".
 *
 * Zero intrusion
 * --------------
 * The app is never modified and no in-repo instrumentation is required:
 * commits are counted by installing a minimal __REACT_DEVTOOLS_GLOBAL_HOOK__
 * via Playwright's context.addInitScript BEFORE any page script runs (React
 * binds to whatever hook exists at load time), and long tasks come from a
 * PerformanceObserver installed the same way. Every selector, testID,
 * background API and storage key used below exists on origin/x as well as on
 * feature branches, and this file deliberately requires nothing from the repo
 * besides the root-level playwright-core dependency.
 *
 * Getting the x baseline
 * ----------------------
 * 1. Copy THIS ONE FILE to apps/web/e2e/render-commit-baseline.e2e.js on a
 *    checkout of origin/x (it has no other dependency on this branch), and add
 *    the same one-line script to the root package.json:
 *      "test:e2e:web:render-baseline": "node apps/web/e2e/render-commit-baseline.e2e.js"
 * 2. Run `yarn test:e2e:web:render-baseline` there exactly as here.
 * 3. Diff the two JSON artifacts written to .tmp/render-baseline/
 *    (<git-short-sha>-<branch>.json) phase by phase.
 *
 * Comparability caveats
 * ---------------------
 * Numbers are comparable only between runs on the SAME machine, with the SAME
 * headless setting (WEB_E2E_HEADLESS) and under similar machine load. Commit
 * counts are stable per branch; long-task counts and wall ms are noisier and
 * should be read as a secondary signal.
 */

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const { chromium } = require('playwright-core');

const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir =
  process.env.RENDER_BASELINE_ARTIFACT_DIR ||
  path.join(repoRoot, '.tmp', 'render-baseline');

const RENDERER_TIMEOUT_MS =
  Number(process.env.WEB_E2E_RENDERER_TIMEOUT_MS) || 180_000;
const PAGE_TIMEOUT_MS = Number(process.env.WEB_E2E_PAGE_TIMEOUT_MS) || 120_000;
const ITERATIONS = Number(process.env.RENDER_BASELINE_ITERATIONS) || 5;
// Commit quiescence: a phase (or the pre-phase settle) is considered rendered
// out when no new React commit landed for this long.
const QUIET_MS = Number(process.env.RENDER_BASELINE_QUIET_MS) || 800;
const QUIESCENCE_TIMEOUT_MS =
  Number(process.env.RENDER_BASELINE_QUIESCENCE_TIMEOUT_MS) || 30_000;
// Fixed settle between phases, before the quiescence wait takes over.
const PHASE_SETTLE_MS = Number(process.env.RENDER_BASELINE_SETTLE_MS) || 1000;

// Public BIP39 test vector (Trezor/BIP39 reference data) - NOT a secret and
// never holds funds. Using a fixed mnemonic keeps account names, addresses and
// list contents identical across branches so render costs are comparable.
const PUBLIC_TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Every value below is verified to exist on origin/x AND current branches.
const WALLET_MODE_STORAGE_KEY = '$onekey_web_dapp_mode';
const TEST_IDS = {
  accountItem: (index) => `account-item-index-${index}`,
  accountName: 'account-name',
  accountTrigger: 'AccountSelectorTriggerBase',
  networkTrigger: 'account-network-trigger-button',
  networkTriggerText: 'account-network-trigger-button-text',
  walletItem: (walletId) => `wallet-${walletId}`,
  walletList: 'account-selector-wallet-list',
};
const ONBOARDING_CLOSE_SELECTOR =
  '[data-testid="page-close-trigger"]:visible, ' +
  '[data-testid="onboardingv2-handle-back-icon-btn"]:visible, ' +
  '[data-testid="onboarding-layout-header-back-btn"]:visible, ' +
  '[data-testid="onboarding-icon-btn"]:visible';
// SegmentControl tab label inside the unified network selector; the label
// string is stable in en_US on both branches while the tab's testID is not.
const SINGLE_NETWORK_TAB_LABEL = 'Single network';
const NETWORK_IDS = ['evm--1', 'btc--0'];

function log(message) {
  console.log(`[render-baseline] ${message}`);
}

function yarnBin() {
  return process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
}

function getDevOnlyPassword() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}-onekey-debug`;
}

function gitInfo() {
  const read = (args) => {
    try {
      return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
    } catch {
      return 'unknown';
    }
  };
  return {
    branch: read(['rev-parse', '--abbrev-ref', 'HEAD']),
    sha: read(['rev-parse', '--short', 'HEAD']),
  };
}

// ---------------------------------------------------------------------------
// Renderer + browser launch (self-contained copy of the web E2E launcher so
// this file works on branches where local-secret-envelope.e2e.js exports
// nothing and runs its own test on require).
// ---------------------------------------------------------------------------

function appendOutput(buffer, chunk) {
  const value = `${buffer}${chunk.toString()}`;
  return value.length > 8000 ? value.slice(value.length - 8000) : value;
}

function httpOk(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(
        Boolean(response.statusCode) &&
          response.statusCode >= 200 &&
          response.statusCode < 500,
      );
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available web E2E port near ${startPort}`);
}

async function waitForRenderer(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `Web dev server exited early with code ${child.exitCode}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    if (await httpOk(url)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for web dev server at ${url}`);
}

async function startWebRenderer() {
  const externalRendererUrl = process.env.WEB_E2E_RENDERER_URL;
  if (externalRendererUrl) {
    const rendererUrl = new URL(externalRendererUrl).toString();
    log(`reuse renderer at ${rendererUrl}`);
    await waitForRenderer(rendererUrl, undefined, RENDERER_TIMEOUT_MS);
    return { child: undefined, rendererUrl };
  }

  const preferredPort = Number(process.env.WEB_E2E_PORT) || 3201;
  const port = await findAvailablePort(preferredPort);
  const rendererUrl = `http://localhost:${port}/`;

  log(`start renderer on ${rendererUrl}`);
  const child = spawn(
    yarnBin(),
    ['workspace', '@onekeyhq/web', 'exec', 'rspack', 'serve'],
    {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        BROWSER: 'none',
        E2E_MODE: 'true',
        NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=10240',
        TRANSFORM_REGENERATOR_DISABLED: 'true',
        WEB_PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout.on('data', (chunk) => {
    output = appendOutput(output, chunk);
    if (process.env.WEB_E2E_VERBOSE) {
      process.stdout.write(chunk);
    }
  });
  child.stderr.on('data', (chunk) => {
    output = appendOutput(output, chunk);
    if (process.env.WEB_E2E_VERBOSE) {
      process.stderr.write(chunk);
    }
  });

  try {
    await waitForRenderer(rendererUrl, child, RENDERER_TIMEOUT_MS);
  } catch (error) {
    await stopProcess(child);
    throw new Error(`${error.message}\n\nRenderer output tail:\n${output}`, {
      cause: error,
    });
  }

  return { child, rendererUrl };
}

async function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch (_) {
    try {
      child.kill('SIGTERM');
    } catch (_e) {
      // ignore cleanup errors
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL');
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    } catch (_) {
      // ignore cleanup errors
    }
  }
}

function getChromeExecutablePath() {
  if (process.env.WEB_E2E_BROWSER_EXECUTABLE) {
    return process.env.WEB_E2E_BROWSER_EXECUTABLE;
  }
  if (process.platform === 'darwin') {
    const chromePath =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return undefined;
}

function parseBooleanEnv(value, fallbackValue) {
  if (value === undefined) {
    return fallbackValue;
  }
  const normalizedValue = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', ''].includes(normalizedValue)) {
    return false;
  }
  throw new Error(`Invalid boolean value "${value}".`);
}

function shouldRunHeadless() {
  const isCI = parseBooleanEnv(process.env.CI, false);
  return parseBooleanEnv(process.env.WEB_E2E_HEADLESS, isCI);
}

async function launchBrowser() {
  const executablePath = getChromeExecutablePath();
  if (!executablePath) {
    throw new Error(
      'No browser executable found. Set WEB_E2E_BROWSER_EXECUTABLE to run web E2E.',
    );
  }
  const headless = shouldRunHeadless();
  log(`launch browser in ${headless ? 'headless' : 'headed'} mode`);
  return chromium.launch({
    args: ['--no-sandbox'],
    executablePath,
    headless,
  });
}

// ---------------------------------------------------------------------------
// Injection-only measurement
// ---------------------------------------------------------------------------

// Runs before ANY page script. React's reconciler binds to whatever
// __REACT_DEVTOOLS_GLOBAL_HOOK__ exists at bundle evaluation time; every hook
// call site in React is wrapped in try/catch, so this minimal surface cannot
// break the app. react-refresh (dev builds) wraps hook.inject and
// hook.onCommitFiberRoot but chains to the originals, so counting survives it;
// it also iterates hook.renderers, hence the real Map.
function installRenderBaselineHook() {
  const state = { commits: 0, longTasks: 0 };
  let nextRendererId = 1;
  const hook = {
    checkDCE() {},
    emit() {},
    inject(internals) {
      const id = nextRendererId;
      nextRendererId += 1;
      hook.renderers.set(id, internals);
      return id;
    },
    isDisabled: false,
    off() {},
    on() {},
    onCommitFiberRoot() {
      state.commits += 1;
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    renderers: new Map(),
    setStrictMode() {},
    sub() {
      return () => {};
    },
    supportsFiber: true,
  };
  if (!globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  } else {
    // A real devtools hook is already installed (headed run with the
    // extension); piggyback on it instead of replacing it.
    const existing = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const original = existing.onCommitFiberRoot;
    existing.onCommitFiberRoot = function onCommitFiberRoot(...args) {
      state.commits += 1;
      return typeof original === 'function'
        ? original.apply(this, args)
        : undefined;
    };
  }
  try {
    new PerformanceObserver((list) => {
      state.longTasks += list.getEntries().length;
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // long-task observer unsupported: counts stay 0
  }
  globalThis.__renderBaseline = {
    get commits() {
      return state.commits;
    },
    get longTasks() {
      return state.longTasks;
    },
    mark(name) {
      globalThis.__renderBaseline.marks.push({
        commits: state.commits,
        longTasks: state.longTasks,
        name: String(name),
        tMs: Math.round(globalThis.performance.now()),
      });
    },
    marks: [],
  };
}

async function readCounters(page) {
  return page.evaluate(() => ({
    commits: globalThis.__renderBaseline.commits,
    longTasks: globalThis.__renderBaseline.longTasks,
  }));
}

async function waitForCommitQuiescence(
  page,
  { quietMs = QUIET_MS, timeoutMs = QUIESCENCE_TIMEOUT_MS } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let last = (await readCounters(page)).commits;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const current = (await readCounters(page)).commits;
    if (current !== last) {
      last = current;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return;
    }
  }
  log(`warning: commit quiescence not reached within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// App helpers (selectors valid on both origin/x and feature branches)
// ---------------------------------------------------------------------------

function visibleTestID(testID) {
  return `[data-testid=${JSON.stringify(testID)}]:visible`;
}

async function clickTestID(page, testID) {
  const locator = page.locator(visibleTestID(testID)).first();
  await locator.waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS });
  await locator.click({ timeout: PAGE_TIMEOUT_MS });
}

async function waitForHiddenTestID(page, testID, timeoutMs = PAGE_TIMEOUT_MS) {
  const locator = page.locator(visibleTestID(testID));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) === 0) {
      return;
    }
    await page.waitForTimeout(50);
  }
  assert.fail(`testID ${testID} remained visible`);
}

function getSidebarTab(page, label) {
  return page
    .locator('.sidebar-tab-item')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first();
}

async function waitForAppReady(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        globalThis.$$appGlobals?.$backgroundApiProxy?.serviceE2E &&
        globalThis.$$appGlobals?.$backgroundApiProxy?.serviceAccount,
      ),
    undefined,
    { timeout: PAGE_TIMEOUT_MS },
  );
}

async function waitForHomeShell(page) {
  const onboardingClose = page.locator(ONBOARDING_CLOSE_SELECTOR);
  const homeTab = getSidebarTab(page, 'Wallet');
  const accountTrigger = page.locator(visibleTestID(TEST_IDS.accountTrigger));
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let stableSince;
  while (Date.now() < deadline) {
    if (await onboardingClose.count()) {
      stableSince = undefined;
      await onboardingClose
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    } else {
      if (await accountTrigger.count()) {
        stableSince ??= Date.now();
        if (Date.now() - stableSince >= 2000) {
          return;
        }
      } else {
        stableSince = undefined;
        if (await homeTab.count()) {
          await homeTab.click({ timeout: 5000 }).catch(() => {});
        }
      }
    }
    await page.waitForTimeout(250);
  }
  assert.fail('Home shell (account selector trigger) never became stable');
}

async function waitForPersistedSelection(page, expected) {
  await page.waitForFunction(
    async ({ expectedSelection }) => {
      const selected =
        await globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.accountSelector.getSelectedAccount(
          { num: 0, sceneName: 'home' },
        );
      if (!selected) return false;
      return Object.entries(expectedSelection).every(
        ([key, value]) => selected[key] === value,
      );
    },
    { expectedSelection: expected },
    { timeout: PAGE_TIMEOUT_MS },
  );
}

// ---------------------------------------------------------------------------
// Fixture: 1 HD wallet, 2 indexed accounts, accounts on evm--1 and btc--0.
// Everything runs through background APIs that exist on origin/x.
// ---------------------------------------------------------------------------

async function createFixture(page, devOnlyPassword) {
  return page.evaluate(
    async ({ mnemonic, networkIds, password }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const e2eParams = { $$devOnlyPassword: password };
      await api.serviceE2E.clearWalletsAndAccounts(e2eParams);
      await api.serviceE2E.clearPassword(e2eParams);

      const rawPassword = `E2E-${globalThis.crypto.randomUUID()}-aA1!`;
      const encodedPassword = await api.servicePassword.encodeSensitiveText({
        text: rawPassword,
      });
      await api.servicePassword.setPassword(encodedPassword, 'password');

      const encodedMnemonic = await api.servicePassword.encodeSensitiveText({
        text: mnemonic,
      });
      const created = await api.serviceAccount.createHDWallet({
        isWalletBackedUp: true,
        mnemonic: encodedMnemonic,
        name: 'Render Baseline',
      });
      const walletId = created.wallet.id;

      const waitForIndexedAccount = async (indexedAccountId) => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const indexedAccount = await api.serviceAccount.getIndexedAccountSafe(
            { id: indexedAccountId },
          );
          if (indexedAccount) {
            return indexedAccount;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(`Indexed account ${indexedAccountId} not readable`);
      };

      await waitForIndexedAccount(created.indexedAccount.id);
      const second = await api.serviceAccount.addHDNextIndexedAccount({
        walletId,
      });
      const indexedAccountIds = [
        created.indexedAccount.id,
        second.indexedAccountId,
      ];
      const accountNames = [];
      for (const indexedAccountId of indexedAccountIds) {
        const indexedAccount = await waitForIndexedAccount(indexedAccountId);
        accountNames.push(indexedAccount.name);
        for (const networkId of networkIds) {
          const deriveItems =
            await api.serviceNetwork.getDeriveInfoItemsOfNetwork({
              networkId,
            });
          for (const deriveItem of deriveItems) {
            await api.serviceAccount.addHDOrHWAccounts({
              deriveType: deriveItem.value,
              indexedAccountId,
              networkId,
              walletId,
            });
          }
        }
      }

      const networkNames = {};
      for (const networkId of networkIds) {
        const network = await api.serviceNetwork.getNetworkSafe({ networkId });
        if (!network?.name) {
          throw new Error(`Network ${networkId} has no name`);
        }
        networkNames[networkId] = network.name;
      }

      return {
        accountNames,
        indexedAccountIds,
        networkNames,
        rawPassword,
        walletId,
      };
    },
    {
      mnemonic: PUBLIC_TEST_MNEMONIC,
      networkIds: NETWORK_IDS,
      password: devOnlyPassword,
    },
  );
}

// A page reload restarts the in-memory wallet password cache; re-verify the
// fixture password so no passcode prompt interrupts the measured flows.
async function restoreWalletPasswordCache(page, fixture) {
  await page.evaluate(
    async ({ rawPassword }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const encoded = await api.servicePassword.encodeSensitiveText({
        text: rawPassword,
      });
      await api.servicePassword.verifyPassword({
        password: encoded,
        passwordMode: 'password',
        skipPostVerifyBackgroundTasks: true,
      });
    },
    { rawPassword: fixture.rawPassword },
  );
}

// The app auto-selects the first account after wallet creation and defaults
// the fresh home scene to All Networks, overwriting any selection written
// directly to simpleDb. In All Networks mode the header trigger has no
// cross-branch testID, so escape it once (unmeasured) through the unified
// network selector: prefer the single-network trigger when it is already
// visible, otherwise push the selector's own modal route - the exact call the
// trigger's onPress makes - which is stable on both branches.
async function pinHomeToSingleNetwork(page, fixture, networkId) {
  const singleTrigger = page.locator(visibleTestID(TEST_IDS.networkTrigger));
  if (await singleTrigger.count()) {
    await singleTrigger.first().click({ timeout: PAGE_TIMEOUT_MS });
  } else {
    await page.evaluate(() => {
      globalThis.$$appGlobals.$rootAppNavigation.pushModal(
        'ChainSelectorModal',
        {
          params: { editable: true, num: 0, sceneName: 'home' },
          screen: 'UnifiedNetworkSelector',
        },
      );
    });
  }
  const networkRow = page.locator(
    `${visibleTestID(networkId)}, ${visibleTestID(`select-item-${networkId}`)}`,
  );
  try {
    await networkRow.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    await page
      .getByText(SINGLE_NETWORK_TAB_LABEL, { exact: true })
      .first()
      .click({ timeout: PAGE_TIMEOUT_MS });
    await networkRow.first().waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MS,
    });
  }
  await networkRow.first().click({ timeout: PAGE_TIMEOUT_MS });
  await waitForPersistedSelection(page, { networkId });
  await page
    .locator(visibleTestID(TEST_IDS.networkTrigger))
    .first()
    .waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS });
  await page.waitForFunction(
    ({ expectedName, selector }) => {
      const node = globalThis.document.querySelector(selector);
      return Boolean(node && node.textContent?.includes(expectedName));
    },
    {
      expectedName: fixture.networkNames[networkId],
      selector: `[data-testid=${JSON.stringify(TEST_IDS.networkTriggerText)}]`,
    },
    { timeout: PAGE_TIMEOUT_MS },
  );
}

// ---------------------------------------------------------------------------
// Measured flows
// ---------------------------------------------------------------------------

async function openAccountSelector(page) {
  await clickTestID(page, TEST_IDS.accountTrigger);
  await page
    .locator(visibleTestID(TEST_IDS.walletList))
    .first()
    .waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS });
}

async function closeAccountSelector(page) {
  await page.keyboard.press('Escape');
  const walletList = page.locator(visibleTestID(TEST_IDS.walletList));
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if ((await walletList.count()) === 0) {
      return;
    }
    await page.waitForTimeout(50);
  }
  // Escape did not land; use the modal close button instead.
  await page
    .locator('[data-testid="page-close-trigger"]:visible')
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  await waitForHiddenTestID(page, TEST_IDS.walletList);
}

async function flowAccountSwitch(page, fixture, iteration) {
  const targetIndex = iteration % 2 === 0 ? 1 : 0;
  const targetName = fixture.accountNames[targetIndex];
  await openAccountSelector(page);
  await clickTestID(page, TEST_IDS.walletItem(fixture.walletId));
  await clickTestID(page, TEST_IDS.accountItem(targetIndex));
  await waitForHiddenTestID(page, TEST_IDS.walletList);
  await waitForPersistedSelection(page, {
    indexedAccountId: fixture.indexedAccountIds[targetIndex],
  });
  await page.waitForFunction(
    ({ expectedName, selector }) => {
      const node = globalThis.document.querySelector(selector);
      return Boolean(node && node.textContent?.includes(expectedName));
    },
    {
      expectedName: targetName,
      selector: `[data-testid=${JSON.stringify(TEST_IDS.accountName)}]`,
    },
    { timeout: PAGE_TIMEOUT_MS },
  );
}

async function flowNetworkSwitch(page, fixture, iteration) {
  const targetNetworkId = iteration % 2 === 0 ? NETWORK_IDS[1] : NETWORK_IDS[0];
  await clickTestID(page, TEST_IDS.networkTrigger);
  const networkRow = page.locator(
    `${visibleTestID(targetNetworkId)}, ${visibleTestID(
      `select-item-${targetNetworkId}`,
    )}`,
  );
  try {
    await networkRow.first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // The selector opened on the portfolio tab; move to the network tab. The
    // tab has no cross-branch testID, so the stable label text is used.
    await page
      .getByText(SINGLE_NETWORK_TAB_LABEL, { exact: true })
      .first()
      .click({ timeout: PAGE_TIMEOUT_MS });
    await networkRow.first().waitFor({
      state: 'visible',
      timeout: PAGE_TIMEOUT_MS,
    });
  }
  await networkRow.first().click({ timeout: PAGE_TIMEOUT_MS });
  await waitForPersistedSelection(page, { networkId: targetNetworkId });
  // The selector must dismiss and the trigger text must re-render to the new
  // network name before the phase ends.
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  while ((await networkRow.count()) > 0) {
    assert.ok(
      Date.now() < deadline,
      `Network selector stayed open after picking ${targetNetworkId}`,
    );
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(
    ({ expectedName, selector }) => {
      const node = globalThis.document.querySelector(selector);
      return Boolean(node && node.textContent?.includes(expectedName));
    },
    {
      expectedName: fixture.networkNames[targetNetworkId],
      selector: `[data-testid=${JSON.stringify(TEST_IDS.networkTriggerText)}]`,
    },
    { timeout: PAGE_TIMEOUT_MS },
  );
}

async function flowSelectorOpenClose(page) {
  await openAccountSelector(page);
  await closeAccountSelector(page);
}

async function flowTabSwitch(page) {
  const tradeTab = getSidebarTab(page, 'Trade');
  const walletTab = getSidebarTab(page, 'Wallet');
  await tradeTab.click({ timeout: PAGE_TIMEOUT_MS });
  await waitForCommitQuiescence(page);
  await walletTab.click({ timeout: PAGE_TIMEOUT_MS });
  await page
    .locator(visibleTestID(TEST_IDS.accountTrigger))
    .first()
    .waitFor({ state: 'visible', timeout: PAGE_TIMEOUT_MS });
}

// ---------------------------------------------------------------------------
// Measurement driver
// ---------------------------------------------------------------------------

function summarize(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const median = sorted.length
    ? sorted[Math.floor((sorted.length - 1) / 2)]
    : 0;
  return {
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    median,
    min: sorted.length ? sorted[0] : 0,
  };
}

async function measurePhase(page, phaseName, runIteration) {
  log(`phase ${phaseName}: ${ITERATIONS} iterations`);
  const commitDeltas = [];
  const longTaskDeltas = [];
  const wallMs = [];
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    await page.waitForTimeout(PHASE_SETTLE_MS);
    await waitForCommitQuiescence(page);
    const before = await readCounters(page);
    const startedAt = Date.now();
    await runIteration(iteration);
    await waitForCommitQuiescence(page);
    const after = await readCounters(page);
    commitDeltas.push(after.commits - before.commits);
    longTaskDeltas.push(after.longTasks - before.longTasks);
    wallMs.push(Date.now() - startedAt);
  }
  const result = {
    commitDeltas,
    commits: summarize(commitDeltas),
    iterations: ITERATIONS,
    longTaskDeltas,
    longTasks: summarize(longTaskDeltas),
    phase: phaseName,
    wallMs: summarize(wallMs),
  };
  log(
    `phase ${phaseName}: commits/iter min=${result.commits.min} median=${result.commits.median} max=${result.commits.max}`,
  );
  return result;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const git = gitInfo();
  const devOnlyPassword = getDevOnlyPassword();

  const { child: rendererProcess, rendererUrl } = await startWebRenderer();
  let browser;
  let page;
  const phases = [];
  const notes = [];
  try {
    browser = await launchBrowser();
    const context = await browser.newContext();
    await context.addInitScript(
      ({ key }) => {
        globalThis.localStorage.setItem(key, 'wallet');
      },
      { key: WALLET_MODE_STORAGE_KEY },
    );
    await context.addInitScript(installRenderBaselineHook);
    page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    await page.goto(rendererUrl, {
      timeout: PAGE_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);

    log('create HD wallet fixture (public BIP39 test mnemonic)');
    const fixture = await createFixture(page, devOnlyPassword);
    assert.equal(fixture.accountNames.length, 2);

    // Reload so the measured document starts from a clean boot; all measured
    // phases run inside this single document.
    await page.goto(rendererUrl, {
      timeout: PAGE_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);
    await waitForHomeShell(page);
    await restoreWalletPasswordCache(page, fixture);
    await waitForPersistedSelection(page, { walletId: fixture.walletId });
    await waitForCommitQuiescence(page);
    log(`pin home selection to ${NETWORK_IDS[0]}`);
    await pinHomeToSingleNetwork(page, fixture, NETWORK_IDS[0]);
    const hookInstalled = await page.evaluate(() =>
      Boolean(
        globalThis.__renderBaseline && globalThis.__renderBaseline.commits > 0,
      ),
    );
    assert.equal(
      hookInstalled,
      true,
      'React devtools hook must observe commits (app booted before hook?)',
    );
    await waitForCommitQuiescence(page);
    const bootCounters = await readCounters(page);
    log(
      `boot: ${bootCounters.commits} commits, ${bootCounters.longTasks} long tasks`,
    );

    phases.push(
      await measurePhase(page, 'account-switch', (iteration) =>
        flowAccountSwitch(page, fixture, iteration),
      ),
    );
    phases.push(
      await measurePhase(page, 'network-switch', (iteration) =>
        flowNetworkSwitch(page, fixture, iteration),
      ),
    );
    phases.push(
      await measurePhase(page, 'selector-open-close', () =>
        flowSelectorOpenClose(page),
      ),
    );
    if (await getSidebarTab(page, 'Trade').count()) {
      phases.push(
        await measurePhase(page, 'tab-switch', () => flowTabSwitch(page)),
      );
    } else {
      notes.push('tab-switch skipped: Trade sidebar tab not present');
      log('phase tab-switch: skipped (Trade sidebar tab not present)');
    }

    const finalCounters = await readCounters(page);
    const artifact = {
      boot: bootCounters,
      environment: {
        arch: os.arch(),
        headless: shouldRunHeadless(),
        nodeVersion: process.version,
        platform: process.platform,
      },
      git,
      iterations: ITERATIONS,
      notes,
      phases,
      quietMs: QUIET_MS,
      timestamp: new Date().toISOString(),
      totalCommits: finalCounters.commits,
      totalLongTasks: finalCounters.longTasks,
    };
    const sanitizedBranch = git.branch.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const artifactPath = path.join(
      artifactDir,
      `${git.sha}-${sanitizedBranch}.json`,
    );
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
    log(`artifact: ${artifactPath}`);

    console.table(
      phases.map((phase) => ({
        phase: phase.phase,
        'commits min': phase.commits.min,
        'commits med': phase.commits.median,
        'commits max': phase.commits.max,
        'longtasks med': phase.longTasks.median,
        'wall ms med': phase.wallMs.median,
      })),
    );

    for (const phase of phases) {
      assert.ok(
        phase.commits.max > 0,
        `phase ${phase.phase} observed zero commits: measurement hook broken`,
      );
    }
  } catch (error) {
    if (page) {
      const screenshotPath = path.join(
        artifactDir,
        'render-baseline-failure.png',
      );
      await page
        .screenshot({ fullPage: true, path: screenshotPath })
        .catch(() => {});
      log(`failure screenshot: ${screenshotPath}`);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await stopProcess(rendererProcess);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
