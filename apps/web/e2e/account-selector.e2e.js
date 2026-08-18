#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  AccountManagerTestIDs,
  AccountSelectorTestIDs,
  AddressInputTestIDs,
  DAppConnectionTestIDs,
  SendTestIDs,
} = require('./account-selector-test-ids');
const {
  getDevOnlyPassword,
  launchBrowser,
  startWebRenderer,
  stopProcess,
} = require('./local-secret-envelope.e2e');

const repoRoot = path.resolve(__dirname, '../../..');
const artifactDir =
  process.env.ACCOUNT_SELECTOR_E2E_ARTIFACT_DIR ||
  path.join(repoRoot, '.tmp', 'account-selector-e2e');
const pageTimeoutMs =
  Number(process.env.ACCOUNT_SELECTOR_E2E_TIMEOUT_MS) || 120_000;

function visibleTestIDSelector(testID) {
  return `[data-testid=${JSON.stringify(testID)}]:visible`;
}

async function getUniqueVisibleByTestIDs(
  owner,
  testIDs,
  { timeout = pageTimeoutMs } = {},
) {
  const locator = owner.locator(
    testIDs.map((testID) => visibleTestIDSelector(testID)).join(', '),
  );
  await locator.first().waitFor({ state: 'visible', timeout });
  assert.equal(
    await locator.count(),
    1,
    `Expected one visible element for testID ${testIDs.join(' or ')}`,
  );
  return locator;
}

function getUniqueVisibleByTestID(owner, testID, options) {
  return getUniqueVisibleByTestIDs(owner, [testID], options);
}

async function waitForNoVisibleTestID(page, testID) {
  const locator = page.locator(visibleTestIDSelector(testID));
  const deadline = Date.now() + pageTimeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) === 0) {
      return;
    }
    await page.waitForTimeout(50);
  }
  assert.fail(`testID ${testID} remained visible`);
}

const iterations = Number(process.env.ACCOUNT_SELECTOR_E2E_ITERATIONS) || 8;
const configuredCycles = Number(process.env.ACCOUNT_SELECTOR_E2E_CYCLES ?? 1);
const walletModeStorageKey = '$onekey_web_dapp_mode';
const defaultAccountCreationNetworkIds = [
  'btc--0',
  'evm--1',
  'tron--0x2b6653dc',
  'sol--101',
];
const expectedNetworks = [
  'evm--1',
  'evm--137',
  'btc--0',
  'tron--0x2b6653dc',
  'sol--101',
];
const accountSelectorE2EWalletFixtures = [
  { accountNames: ['A-1', 'A-2'], fixtureId: 'alpha', name: 'E2E A' },
  { accountNames: ['B-1', 'B-2'], fixtureId: 'beta', name: 'E2E B' },
];
const expectedAccountAddressFixtures = {
  alpha: {
    0: {
      'evm--1': {
        default: '0x29EA87Ea486d2F86d12d9cb89a714a838b80b2c0',
        ledgerLive: '0x29EA87Ea486d2F86d12d9cb89a714a838b80b2c0',
        ledgerLegacy: '0x2910d0b1a398cE6bDCE4636fD77820abc4Ae2D44',
      },
      'evm--137': {
        default: '0x29EA87Ea486d2F86d12d9cb89a714a838b80b2c0',
        ledgerLive: '0x29EA87Ea486d2F86d12d9cb89a714a838b80b2c0',
        ledgerLegacy: '0x2910d0b1a398cE6bDCE4636fD77820abc4Ae2D44',
      },
      'btc--0': {
        BIP86: 'bc1p3exqxzq4a8dt2w93glckd2g0f5hdffx6myne0w5el3e5hr0thwdskd9dd9',
        default: '35Cfo9RaVcs7vuzzHpAZfM93mMwhcBMqX3',
        BIP84: 'bc1q0vet6wytnqxs64xturxgrcqmxhuqryvjpge6fe',
        BIP44: '1EGRU4SwuKfJabfeaYjpAuYv9C9o9wSXkg',
      },
      'tron--0x2b6653dc': {
        default: 'TGVnZ7FhmZ7fk1Q2fq1q1tkPbNoyAKvZ6f',
      },
      'sol--101': {
        default: '3u4eLrbCiaMp18qniooJnZx9WxV7YACv58UB56Pd2Cmz',
        ledgerLive: '9JVmTaUa4oHo9mrj5rcgP8ZLgXCAgntJj9YVdfg2Aqnv',
      },
    },
    1: {
      'evm--1': {
        default: '0x9EeD09420354804349318a77998f3B7E2Ad0c03f',
        ledgerLive: '0xb38C1Add6CAaaf19d5f8ece94ED89b3aF0f6dEE5',
        ledgerLegacy: '0x7312AaB6D67880d56ecd573029c2ae2a5D063e47',
      },
      'evm--137': {
        default: '0x9EeD09420354804349318a77998f3B7E2Ad0c03f',
        ledgerLive: '0xb38C1Add6CAaaf19d5f8ece94ED89b3aF0f6dEE5',
        ledgerLegacy: '0x7312AaB6D67880d56ecd573029c2ae2a5D063e47',
      },
      'btc--0': {
        BIP86: 'bc1pujhgylg0lffp53cr45fy3jqlmqmnljwyywgvmggrk7yy445ukq9svqsxwn',
        default: '3MFBLbC1VhrA91ny8DbKkT8quuTYG771Q4',
        BIP84: 'bc1q82rzukc8drepdflquvwnqmz8myuj9t5m2f87sa',
        BIP44: '16hrKc9j94qGqCDuu3XwKLqXFjjk2Y7RpT',
      },
      'tron--0x2b6653dc': {
        default: 'TXwS4FNboHAXCHXUnYv2b6HLe5YEpuk9LE',
      },
      'sol--101': {
        default: 'Bb9QG1hnt8isRc2ckyVwKdnk2ffwmKJJVkVBkjQMDW9B',
        ledgerLive: 'DeYxLhuSKHNt8gZkG7tVEU4guAbY4pQhWF3NJfFa5X7x',
      },
    },
  },
  beta: {
    0: {
      'evm--1': {
        default: '0xc19f5C3b2471D36c7C164088297A674Afec0fD25',
        ledgerLive: '0xc19f5C3b2471D36c7C164088297A674Afec0fD25',
        ledgerLegacy: '0xd7Fe163fCD9d67Ab68E6CE5652A1957EeC2630d6',
      },
      'evm--137': {
        default: '0xc19f5C3b2471D36c7C164088297A674Afec0fD25',
        ledgerLive: '0xc19f5C3b2471D36c7C164088297A674Afec0fD25',
        ledgerLegacy: '0xd7Fe163fCD9d67Ab68E6CE5652A1957EeC2630d6',
      },
      'btc--0': {
        BIP86: 'bc1pshjgd309dgxxs0a4asdspqqev9pyphre7y880hncn8029r49fzssl27npq',
        default: '3DDTNjF71KjMokRUK9CPVGEVjo7hStra3y',
        BIP84: 'bc1qcu98avx9jd7t09g3qc5m82zee9jd3g6trrtwvd',
        BIP44: '1JzGUm3Gwe7ALQMuzAqKbBWtL8pZ6Q9xeM',
      },
      'tron--0x2b6653dc': {
        default: 'TDNFzUNwJby4p4CXeA2dqCTAbmbm4Yx5jv',
      },
      'sol--101': {
        default: 'CW26DQMgAhvUekW7fkYVtw1rBHgHXH57QeUMNVabJ9o8',
        ledgerLive: 'CYSc58nc6YTouUuAsRGMxxUfek4PxQ6H8MffTWfPVskT',
      },
    },
    1: {
      'evm--1': {
        default: '0xA3335B2314eA7019a54C3679fab8Ac3743B0901B',
        ledgerLive: '0xa272798AFd54aC38FdAFd0bAe3E46CCe6090fF56',
        ledgerLegacy: '0xA39efFD5c0d0B9Bf0f3fFB5EC18C87C12430c671',
      },
      'evm--137': {
        default: '0xA3335B2314eA7019a54C3679fab8Ac3743B0901B',
        ledgerLive: '0xa272798AFd54aC38FdAFd0bAe3E46CCe6090fF56',
        ledgerLegacy: '0xA39efFD5c0d0B9Bf0f3fFB5EC18C87C12430c671',
      },
      'btc--0': {
        BIP86: 'bc1p67xxx734ty8x5zfanxqvt7338trhlepaxwzrax8x5k3l53vgppxskrwrf4',
        default: '36ZAoHY8sq6kETwp1aaEUdhjau69QYX2ty',
        BIP84: 'bc1q848998rvdgcqnt75l2ln3j9cpx682y3v05smf0',
        BIP44: '18BbCRyPdD8VEkf5pGbbyqucFD342b8aq3',
      },
      'tron--0x2b6653dc': {
        default: 'TMRLK1QeHPvNqQSdPDt3ELQjq8KGPCrR23',
      },
      'sol--101': {
        default: '2WRg3Us65uRSibSX2AiAY9nesWtUama8iisAvMkBk4Q3',
        ledgerLive: 'BQ7WwoKXRApzkt6jGX87tCoph9H1dgqu4f1f7JEkzmA2',
      },
    },
  },
};
const simulatedDAppOrigin = 'https://account-selector-e2e.test';
const simulatedDAppSecondaryOrigin =
  'https://account-selector-secondary-e2e.test';
const dappConnectionProviderCommitLimit = readPositiveNumberEnv(
  'ACCOUNT_SELECTOR_E2E_DAPP_CONNECTION_PROVIDER_COMMIT_MAX',
  22,
);

function readPositiveNumberEnv(name, fallbackValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined) return fallbackValue;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received: ${rawValue}`);
  }
  return value;
}

const performanceBudgetDefinitions = [
  {
    defaultLimit: 2000,
    envName: 'ACCOUNT_SELECTOR_E2E_ACTIVE_RELOAD_MUTEX_P95_MS',
    event: 'activeReloadResult',
    field: 'mutexWaitMs',
    statistic: 'p95',
  },
  {
    defaultLimit: 5000,
    envName: 'ACCOUNT_SELECTOR_E2E_ACTIVE_RELOAD_MUTEX_MAX_MS',
    event: 'activeReloadResult',
    field: 'mutexWaitMs',
    statistic: 'max',
  },
  {
    defaultLimit: 3500,
    envName: 'ACCOUNT_SELECTOR_E2E_ACTIVE_RELOAD_TOTAL_P95_MS',
    event: 'activeReloadResult',
    field: 'totalMs',
    statistic: 'p95',
  },
  {
    defaultLimit: 8000,
    envName: 'ACCOUNT_SELECTOR_E2E_ACTIVE_RELOAD_TOTAL_MAX_MS',
    event: 'activeReloadResult',
    field: 'totalMs',
    statistic: 'max',
  },
  {
    defaultLimit: 500,
    envName: 'ACCOUNT_SELECTOR_E2E_PROVIDER_COMMIT_P95_MS',
    event: 'providerSubtreeCommit',
    field: 'actualDuration',
    statistic: 'p95',
  },
  {
    defaultLimit: 1500,
    envName: 'ACCOUNT_SELECTOR_E2E_PROVIDER_COMMIT_MAX_MS',
    event: 'providerSubtreeCommit',
    field: 'actualDuration',
    statistic: 'max',
  },
  {
    defaultLimit: 750,
    envName: 'ACCOUNT_SELECTOR_E2E_SELECTION_UPDATE_P95_MS',
    event: 'selectionUpdateResult',
    field: 'totalMs',
    statistic: 'p95',
  },
  {
    defaultLimit: 15_000,
    envName: 'ACCOUNT_SELECTOR_E2E_STORAGE_INIT_MAX_MS',
    event: 'storageInitResult',
    field: 'totalMs',
    statistic: 'max',
  },
].map((budget) => ({
  ...budget,
  limit: readPositiveNumberEnv(budget.envName, budget.defaultLimit),
}));

function log(message) {
  console.log(`[account-selector-e2e] ${message}`);
}

function collectCdpStackFrames(stackTrace, frames = []) {
  let current = stackTrace;
  while (current && frames.length < 40) {
    for (const frame of current.callFrames || []) {
      frames.push({
        columnNumber: frame.columnNumber,
        functionName: frame.functionName,
        lineNumber: frame.lineNumber,
        url: frame.url,
      });
      if (frames.length >= 40) break;
    }
    current = current.parent;
  }
  return frames;
}

function percentile(values, ratio) {
  if (!values.length) return undefined;
  const sorted = [...values].toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function summarizeTimingValues(timingValues) {
  const summary = {};
  for (const [field, values] of Object.entries(timingValues)) {
    if (values.length) {
      summary[field] = {
        count: values.length,
        max: Math.max(...values),
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
      };
    }
  }
  return summary;
}

function recordFanout(fanoutMap, { consumer, id, reason }) {
  if (typeof id !== 'number') return;
  const operation = fanoutMap.get(id) || {
    consumerCommitCounts: new Map(),
    id,
    reason: reason || 'unspecified',
  };
  operation.consumerCommitCounts.set(
    consumer,
    (operation.consumerCommitCounts.get(consumer) || 0) + 1,
  );
  fanoutMap.set(id, operation);
}

function summarizeFanout(fanoutMap) {
  const duplicateConsumers = [];
  const reasonCounts = {};
  let maxCommitsPerConsumer = 0;
  let maxConsumersPerOperation = 0;
  let totalConsumerCommits = 0;
  for (const operation of fanoutMap.values()) {
    reasonCounts[operation.reason] = (reasonCounts[operation.reason] || 0) + 1;
    maxConsumersPerOperation = Math.max(
      maxConsumersPerOperation,
      operation.consumerCommitCounts.size,
    );
    for (const [consumer, commitCount] of operation.consumerCommitCounts) {
      totalConsumerCommits += commitCount;
      maxCommitsPerConsumer = Math.max(maxCommitsPerConsumer, commitCount);
      if (commitCount > 1) {
        duplicateConsumers.push({
          commitCount,
          consumer,
          id: operation.id,
          reason: operation.reason,
        });
      }
    }
  }
  return {
    duplicateConsumers,
    maxCommitsPerConsumer,
    maxConsumersPerOperation,
    operationCount: fanoutMap.size,
    reasonCounts,
    totalConsumerCommits,
  };
}

function buildTraceSummary(events) {
  const eventCounts = {};
  const outcomeCounts = {};
  const timingFields = [
    'actualDuration',
    'bgTotalMs',
    'buildMs',
    'mutexWaitMs',
    'totalMs',
    'workMs',
  ];
  const timings = Object.fromEntries(timingFields.map((field) => [field, []]));
  const timingsByEvent = {};
  const activeReloadFanout = new Map();
  const selectionTransitionFanout = new Map();
  const providerRenders = {
    byDebugName: {},
    commitCount: 0,
    initialSnapshotCommitCount: 0,
    slowCommitCount: 0,
    totalActualDuration: 0,
    trackedCommitCount: 0,
    untrackedCommitCount: 0,
  };

  for (const event of events) {
    eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
    if (typeof event.outcome === 'string') {
      const key = `${event.event}:${event.outcome}`;
      outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
    }
    for (const field of timingFields) {
      if (typeof event[field] === 'number' && Number.isFinite(event[field])) {
        timings[field].push(event[field]);
        timingsByEvent[event.event] ||= {};
        timingsByEvent[event.event][field] ||= [];
        timingsByEvent[event.event][field].push(event[field]);
      }
    }
    if (
      event.event === 'providerSubtreeCommit' ||
      event.event === 'providerUntrackedCommitBatch'
    ) {
      const isBatch = event.event === 'providerUntrackedCommitBatch';
      const commitCount = isBatch ? event.commitCount : 1;
      const duration = isBatch
        ? event.totalActualDuration
        : event.actualDuration;
      const safeCommitCount = typeof commitCount === 'number' ? commitCount : 0;
      const safeDuration = typeof duration === 'number' ? duration : 0;
      const debugName =
        typeof event.perfDebugName === 'string'
          ? event.perfDebugName
          : `unlabeled:${event.sceneName || 'unknown'}`;
      if (
        event.event === 'providerSubtreeCommit' &&
        event.attribution === 'tracked-account-state'
      ) {
        for (const stateChange of event.stateChanges || []) {
          const consumer = `${debugName}:num-${stateChange.num}`;
          recordFanout(selectionTransitionFanout, {
            consumer,
            id: stateChange.selectionTransitionId,
            reason: stateChange.selectionReason,
          });
          recordFanout(activeReloadFanout, {
            consumer,
            id: stateChange.activeReloadId,
            reason: stateChange.activeTrigger,
          });
        }
      }
      const debugSummary = providerRenders.byDebugName[debugName] || {
        commitCount: 0,
        initialSnapshotCommitCount: 0,
        slowCommitCount: 0,
        totalActualDuration: 0,
        trackedCommitCount: 0,
        untrackedCommitCount: 0,
      };
      debugSummary.commitCount += safeCommitCount;
      debugSummary.totalActualDuration += safeDuration;
      providerRenders.byDebugName[debugName] = debugSummary;
      providerRenders.commitCount += safeCommitCount;
      providerRenders.totalActualDuration += safeDuration;
      if (
        event.attribution === 'initial-provider-snapshot' ||
        event.attribution === 'scope-reset-snapshot'
      ) {
        debugSummary.initialSnapshotCommitCount += safeCommitCount;
        providerRenders.initialSnapshotCommitCount += safeCommitCount;
      } else if (isBatch || event.trackedStateChanged !== true) {
        debugSummary.untrackedCommitCount += safeCommitCount;
        providerRenders.untrackedCommitCount += safeCommitCount;
      } else {
        debugSummary.trackedCommitCount += safeCommitCount;
        providerRenders.trackedCommitCount += safeCommitCount;
      }
      if (event.slow === true) {
        debugSummary.slowCommitCount += 1;
        providerRenders.slowCommitCount += 1;
      }
    }
  }

  const timingSummary = summarizeTimingValues(timings);
  const timingSummaryByEvent = Object.fromEntries(
    Object.entries(timingsByEvent).map(([event, timingValues]) => [
      event,
      summarizeTimingValues(timingValues),
    ]),
  );

  return {
    eventCounts,
    fanout: {
      activeReloads: summarizeFanout(activeReloadFanout),
      selectionTransitions: summarizeFanout(selectionTransitionFanout),
    },
    outcomeCounts,
    providerRenders,
    timingSummary,
    timingSummaryByEvent,
    totalEvents: events.length,
  };
}

function evaluatePerformanceBudgets(summary) {
  return performanceBudgetDefinitions.map((budget) => {
    const observed =
      summary.timingSummaryByEvent[budget.event]?.[budget.field]?.[
        budget.statistic
      ];
    return {
      envName: budget.envName,
      event: budget.event,
      field: budget.field,
      limit: budget.limit,
      observed,
      passed: typeof observed === 'number' && observed <= budget.limit,
      statistic: budget.statistic,
    };
  });
}

function assertPerformanceBudgets(results) {
  const failures = results.filter((result) => !result.passed);
  assert.deepEqual(
    failures.map(({ event, field, limit, observed, statistic }) => ({
      event,
      field,
      limit,
      observed,
      statistic,
    })),
    [],
    'AccountSelector performance budget exceeded',
  );
}

function assertTraceHealth({ droppedCount, events, phase }) {
  assert.equal(droppedCount, 0, `${phase}: trace buffer dropped events`);
  const errorEvents = events.filter((event) => {
    const outcome = typeof event.outcome === 'string' ? event.outcome : '';
    return (
      outcome === 'error' ||
      outcome === 'error-fallback' ||
      outcome === 'partial'
    );
  });
  assert.deepEqual(
    errorEvents.map((event) => ({
      event: event.event,
      outcome: event.outcome,
    })),
    [],
    `${phase}: AccountSelector trace contains error outcomes`,
  );
  const snapshotsWithCausalMetadata = events.filter(
    (event) =>
      event.event === 'providerSubtreeCommit' &&
      (event.attribution === 'initial-provider-snapshot' ||
        event.attribution === 'scope-reset-snapshot') &&
      event.stateChanges?.some(
        (change) =>
          change.selectionTransitionId !== undefined ||
          change.activeReloadId !== undefined,
      ),
  );
  assert.deepEqual(
    snapshotsWithCausalMetadata.map((event) => ({
      event: event.event,
      providerInstanceId: event.providerInstanceId,
    })),
    [],
    `${phase}: provider snapshots must not inherit stale transition metadata`,
  );
}

function assertTraceRequestResultPairs(events) {
  const pairs = [
    ['accountSelectRequested', 'accountSelectResult', 'operationId'],
    ['activeReloadStart', 'activeReloadResult', 'reloadId'],
    ['autoDeriveRequested', 'autoDeriveResult', 'operationId'],
    ['autoDeriveSyncRequested', 'autoDeriveSyncResult', 'operationId'],
    ['autoSelectAccountRequested', 'autoSelectAccountResult', 'operationId'],
    ['availableNetworksRequested', 'availableNetworksResult', 'operationId'],
    ['crossSceneSyncRequested', 'crossSceneSyncResult', 'operationId'],
    ['manualSceneSyncRequested', 'manualSceneSyncResult', 'operationId'],
    ['selectionUpdateRequested', 'selectionUpdateResult', 'attemptId'],
    ['storageInitRequested', 'storageInitResult', 'operationId'],
  ];

  for (const [requestEvent, resultEvent, key] of pairs) {
    const requests = events.filter((event) => event.event === requestEvent);
    const results = events.filter((event) => event.event === resultEvent);
    const requestCounts = new Map();
    const resultCounts = new Map();
    for (const request of requests) {
      requestCounts.set(
        request[key],
        (requestCounts.get(request[key]) || 0) + 1,
      );
    }
    for (const result of results) {
      resultCounts.set(result[key], (resultCounts.get(result[key]) || 0) + 1);
    }
    const unmatched = requests.filter(
      (request) => resultCounts.get(request[key]) !== 1,
    );
    assert.deepEqual(
      unmatched.map((request) => ({ event: requestEvent, id: request[key] })),
      [],
      `${requestEvent}: every request must have exactly one ${resultEvent}`,
    );
    const orphaned = results.filter(
      (result) => requestCounts.get(result[key]) !== 1,
    );
    assert.deepEqual(
      orphaned.map((result) => ({ event: resultEvent, id: result[key] })),
      [],
      `${resultEvent}: every result must have exactly one ${requestEvent}`,
    );
  }
}

function assertStaleReloadPostProcessPairs(events) {
  const staleOutcomes = new Set([
    'stale-after-build',
    'stale-before-build',
    'stale-schedule-before-build',
  ]);
  const staleResults = events.filter(
    (event) =>
      event.event === 'activeReloadResult' &&
      event.scheduleId !== undefined &&
      staleOutcomes.has(event.outcome),
  );
  const postProcessCounts = new Map();
  for (const event of events) {
    if (
      event.event === 'activeReloadPostProcessResult' &&
      event.outcome === 'skip-stale-action'
    ) {
      postProcessCounts.set(
        `${event.scheduleId}:${event.actionOutcome}`,
        (postProcessCounts.get(`${event.scheduleId}:${event.actionOutcome}`) ||
          0) + 1,
      );
    }
  }
  const unmatched = staleResults.filter(
    (event) =>
      postProcessCounts.get(`${event.scheduleId}:${event.outcome}`) !== 1,
  );
  assert.deepEqual(
    unmatched.map((event) => ({
      outcome: event.outcome,
      scheduleId: event.scheduleId,
    })),
    [],
    'Every stale scheduled reload must skip post-processing exactly once',
  );
}

async function waitForAppReady(page) {
  await page.waitForFunction(
    () =>
      Boolean(
        globalThis.$$appGlobals?.$backgroundApiProxy?.serviceE2E
          ?.configureAccountSelectorPerfE2E &&
        globalThis.$$appGlobals?.$$platformEnv,
      ),
    undefined,
    { timeout: pageTimeoutMs },
  );
  const mode = await page.evaluate(() => ({
    isE2E: globalThis.$$appGlobals.$$platformEnv.isE2E,
    isWebDappMode: globalThis.$$appGlobals.$$platformEnv.isWebDappMode,
  }));
  assert.equal(mode.isE2E, true, 'Web renderer must run with E2E_MODE=true');
  assert.equal(
    mode.isWebDappMode,
    false,
    'CDP init script must switch Web to wallet mode before app bootstrap',
  );
}

async function configurePerfTrace(page, devOnlyPassword) {
  const result = await page.evaluate(
    ({ password }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.serviceE2E.configureAccountSelectorPerfE2E(
        {
          $$devOnlyPassword: password,
          enabled: true,
        },
      ),
    { password: devOnlyPassword },
  );
  assert.equal(result.enabled, true, 'AccountSelector perf logger is disabled');
}

async function drainPerfTrace(page, devOnlyPassword) {
  return page.evaluate(
    ({ password }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.serviceE2E.drainAccountSelectorPerfE2ETrace(
        { $$devOnlyPassword: password },
      ),
    { password: devOnlyPassword },
  );
}

async function collectPerfTraceUntil(
  page,
  devOnlyPassword,
  predicate,
  timeoutMs = pageTimeoutMs,
) {
  const collected = { droppedCount: 0, events: [] };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const next = await drainPerfTrace(page, devOnlyPassword);
    collected.droppedCount += next.droppedCount;
    collected.events.push(...next.events);
    if (predicate(collected.events)) {
      await page.waitForTimeout(350);
      const settled = await drainPerfTrace(page, devOnlyPassword);
      collected.droppedCount += settled.droppedCount;
      collected.events.push(...settled.events);
      return collected;
    }
    await page.waitForTimeout(100);
  }
  return collected;
}

function mergePerfTrace(...traces) {
  return {
    droppedCount: traces.reduce(
      (total, trace) => total + trace.droppedCount,
      0,
    ),
    events: traces.flatMap((trace) => trace.events),
  };
}

async function collectSelectionOperationTrace(
  page,
  devOnlyPassword,
  { expectActiveReload, num = 0, reason, sceneName = 'home' },
) {
  if (!expectActiveReload) {
    await page.waitForTimeout(350);
    return drainPerfTrace(page, devOnlyPassword);
  }
  return collectPerfTraceUntil(page, devOnlyPassword, (events) =>
    events.some(
      (event) =>
        event.event === 'activeReloadResult' &&
        event.num === num &&
        event.reason === reason &&
        event.sceneName === sceneName,
    ),
  );
}

async function createFixture(page, devOnlyPassword) {
  return page.evaluate(
    async ({
      accountCreationNetworkIds,
      addressNetworkIds,
      password,
      walletFixtures,
    }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const e2eParams = { $$devOnlyPassword: password };
      await api.serviceE2E.clearWalletsAndAccounts(e2eParams);
      await api.serviceE2E.clearPassword(e2eParams);

      const rawPassword = `E2E-${globalThis.crypto.randomUUID()}-aA1!`;
      const encodedPassword = await api.servicePassword.encodeSensitiveText({
        text: rawPassword,
      });
      await api.servicePassword.setPassword(encodedPassword, 'password');

      const waitForIndexedAccount = async (indexedAccountId) => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const indexedAccount = await api.serviceAccount.getIndexedAccountSafe(
            {
              id: indexedAccountId,
            },
          );
          if (indexedAccount) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error(
          `Indexed account ${indexedAccountId} was not readable after creation`,
        );
      };

      const createWallet = async ({ accountNames, fixtureId, name }) => {
        const encodedMnemonic =
          await api.serviceE2E.getAccountSelectorE2EEncodedMnemonic({
            ...e2eParams,
            fixtureId,
          });
        const created = await api.serviceAccount.createHDWallet({
          isWalletBackedUp: true,
          mnemonic: encodedMnemonic,
          name,
        });
        await waitForIndexedAccount(created.indexedAccount.id);
        const second = await api.serviceAccount.addHDNextIndexedAccount({
          walletId: created.wallet.id,
        });
        const indexedAccountIds = [
          created.indexedAccount.id,
          second.indexedAccountId,
        ];

        for (
          let accountIndex = 0;
          accountIndex < indexedAccountIds.length;
          accountIndex += 1
        ) {
          const indexedAccountId = indexedAccountIds[accountIndex];
          await waitForIndexedAccount(indexedAccountId);
          await api.serviceAccount.setAccountName({
            indexedAccountId,
            name: accountNames[accountIndex],
            skipEventEmit: true,
            skipSaveLocalSyncItem: true,
          });
          const renamedAccount = await api.serviceAccount.getIndexedAccountSafe(
            {
              id: indexedAccountId,
            },
          );
          if (renamedAccount?.name !== accountNames[accountIndex]) {
            throw new Error(
              `Expected account ${indexedAccountId} to be named ${accountNames[accountIndex]}, received ${renamedAccount?.name}`,
            );
          }
          for (const networkId of accountCreationNetworkIds) {
            const deriveItems =
              await api.serviceNetwork.getDeriveInfoItemsOfNetwork({
                networkId,
              });
            for (const deriveItem of deriveItems) {
              await api.serviceAccount.addHDOrHWAccounts({
                deriveType: deriveItem.value,
                indexedAccountId,
                networkId,
                walletId: created.wallet.id,
              });
            }
          }
        }
        const savedWallet = await api.serviceAccount.getWalletSafe({
          walletId: created.wallet.id,
        });
        if (savedWallet?.name !== name) {
          throw new Error(
            `Expected wallet ${created.wallet.id} to be named ${name}, received ${savedWallet?.name}`,
          );
        }
        return {
          fixtureId,
          indexedAccountIds,
          walletId: created.wallet.id,
        };
      };

      const wallets = [];
      for (const walletFixture of walletFixtures) {
        wallets.push(await createWallet(walletFixture));
      }

      const addressFixtures = {};
      for (const wallet of wallets) {
        addressFixtures[wallet.fixtureId] = {};
        for (
          let accountIndex = 0;
          accountIndex < wallet.indexedAccountIds.length;
          accountIndex += 1
        ) {
          const indexedAccountId = wallet.indexedAccountIds[accountIndex];
          const accountAddresses = {};
          addressFixtures[wallet.fixtureId][accountIndex] = accountAddresses;
          for (const networkId of addressNetworkIds) {
            const deriveItems =
              await api.serviceNetwork.getDeriveInfoItemsOfNetwork({
                networkId,
              });
            const networkAddresses = {};
            accountAddresses[networkId] = networkAddresses;
            for (const deriveItem of deriveItems) {
              const { accounts } =
                await api.serviceAccount.getAccountsByIndexedAccounts({
                  deriveType: deriveItem.value,
                  indexedAccountIds: [indexedAccountId],
                  networkId,
                });
              const account = accounts[0];
              if (!account?.address) {
                throw new Error(
                  `Missing ${networkId}/${deriveItem.value} address for ${wallet.fixtureId} account ${accountIndex}`,
                );
              }
              networkAddresses[deriveItem.value] = account.address;
            }
          }
        }
      }
      return { addressFixtures, wallets };
    },
    {
      addressNetworkIds: expectedNetworks,
      accountCreationNetworkIds: defaultAccountCreationNetworkIds,
      password: devOnlyPassword,
      walletFixtures: accountSelectorE2EWalletFixtures,
    },
  );
}

async function readPersistedSelection(
  page,
  sceneName = 'home',
  num = 0,
  sceneUrl,
) {
  return page.evaluate(
    async ({ scene, selectionNum, selectionSceneUrl }) => {
      const simpleDb = globalThis.$$appGlobals.$backgroundApiProxy.simpleDb;
      if (scene === 'discover' && selectionSceneUrl) {
        const dappMap = await simpleDb.dappConnection.getAccountSelectorMap({
          sceneUrl: selectionSceneUrl,
        });
        return dappMap?.[selectionNum];
      }
      return simpleDb.accountSelector.getSelectedAccount({
        num: selectionNum,
        sceneName: scene,
        sceneUrl: selectionSceneUrl,
      });
    },
    { scene: sceneName, selectionNum: num, selectionSceneUrl: sceneUrl },
  );
}

async function readAccountSelectorStateSnapshot(
  page,
  { num = 0, sceneName = 'home', sceneUrl },
) {
  return page.evaluate(
    ({ selectionNum, selectionSceneName, selectionSceneUrl }) => {
      const accessor =
        globalThis.$$appGlobals.$$accountSelectorE2EStateAccessor;
      if (!accessor?.getSnapshot) {
        throw new Error('AccountSelector E2E state accessor is unavailable');
      }
      return accessor.getSnapshot({
        num: selectionNum,
        sceneName: selectionSceneName,
        sceneUrl: selectionSceneUrl,
      });
    },
    {
      selectionNum: num,
      selectionSceneName: sceneName,
      selectionSceneUrl: sceneUrl,
    },
  );
}

function getExpectedAccountFixture(target) {
  const walletFixture = accountSelectorE2EWalletFixtures.find(
    (item) => item.fixtureId === target.fixtureId,
  );
  assert.ok(walletFixture, `Unknown wallet fixture ${target.fixtureId}`);
  const accountName = walletFixture.accountNames[target.index];
  assert.ok(
    accountName,
    `Missing account name for ${target.fixtureId}/${target.index}`,
  );
  return { accountName, walletName: walletFixture.name };
}

function shortenAddress(address) {
  return address.length <= 14
    ? address
    : `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function findFixtureTarget(fixture, selection) {
  for (const wallet of fixture.wallets) {
    const index = wallet.indexedAccountIds.indexOf(selection?.indexedAccountId);
    if (wallet.walletId === selection?.walletId && index >= 0) {
      return {
        fixtureId: wallet.fixtureId,
        index,
        indexedAccountId: wallet.indexedAccountIds[index],
        walletId: wallet.walletId,
      };
    }
  }
  assert.fail(
    `Selection does not match an E2E fixture: ${selection?.walletId}/${selection?.indexedAccountId}`,
  );
}

async function assertAccountSelectorStateConsistent(
  page,
  target,
  {
    assertPersistence = true,
    assertUI = true,
    num = 0,
    sceneName = 'home',
    sceneUrl,
  } = {},
) {
  await readAccountSelectorStateSnapshot(page, { num, sceneName, sceneUrl });
  try {
    await page.waitForFunction(
      ({
        expectedIndexedAccountId,
        expectedWalletId,
        selectionNum,
        selectionSceneName,
        selectionSceneUrl,
      }) => {
        const snapshot =
          globalThis.$$appGlobals.$$accountSelectorE2EStateAccessor?.getSnapshot?.(
            {
              num: selectionNum,
              sceneName: selectionSceneName,
              sceneUrl: selectionSceneUrl,
            },
          );
        return Boolean(
          snapshot?.active?.ready &&
          snapshot.selected?.walletId === expectedWalletId &&
          snapshot.selected?.indexedAccountId === expectedIndexedAccountId &&
          snapshot.active?.walletId === snapshot.selected?.walletId &&
          snapshot.active?.indexedAccountId ===
            snapshot.selected?.indexedAccountId &&
          snapshot.active?.networkId === snapshot.selected?.networkId &&
          snapshot.active?.deriveType === snapshot.selected?.deriveType,
        );
      },
      {
        expectedIndexedAccountId: target.indexedAccountId,
        expectedWalletId: target.walletId,
        selectionNum: num,
        selectionSceneName: sceneName,
        selectionSceneUrl: sceneUrl,
      },
      { timeout: pageTimeoutMs },
    );
  } catch (error) {
    const [persisted, snapshot] = await Promise.all([
      assertPersistence
        ? readPersistedSelection(page, sceneName, num, sceneUrl)
        : undefined,
      readAccountSelectorStateSnapshot(page, { num, sceneName, sceneUrl }),
    ]);
    throw new Error(
      `${sceneName} AccountSelector state did not converge: ${JSON.stringify({
        active: snapshot?.active
          ? {
              deriveType: snapshot.active.deriveType,
              indexedAccountId: snapshot.active.indexedAccountId,
              networkId: snapshot.active.networkId,
              ready: snapshot.active.ready,
              walletId: snapshot.active.walletId,
            }
          : undefined,
        persisted,
        selected: snapshot?.selected,
        target: {
          indexedAccountId: target.indexedAccountId,
          walletId: target.walletId,
        },
      })}`,
      { cause: error },
    );
  }

  const [persisted, snapshot] = await Promise.all([
    assertPersistence
      ? readPersistedSelection(page, sceneName, num, sceneUrl)
      : undefined,
    readAccountSelectorStateSnapshot(page, { num, sceneName, sceneUrl }),
  ]);
  const selected = snapshot?.selected;
  const active = snapshot?.active;
  assert.ok(selected, `${sceneName} selected Atom snapshot is missing`);
  assert.ok(active?.ready, `${sceneName} active Atom must be ready`);
  const isAllNetworkSelection = selected.networkId === 'onekeyall--0';
  if (assertPersistence) {
    assert.deepEqual(
      {
        ...(isAllNetworkSelection ? {} : { deriveType: selected.deriveType }),
        indexedAccountId: selected.indexedAccountId,
        networkId: selected.networkId,
        othersWalletAccountId: selected.othersWalletAccountId,
        walletId: selected.walletId,
      },
      {
        ...(isAllNetworkSelection ? {} : { deriveType: persisted?.deriveType }),
        indexedAccountId: persisted?.indexedAccountId,
        networkId: persisted?.networkId,
        othersWalletAccountId: persisted?.othersWalletAccountId,
        walletId: persisted?.walletId,
      },
      `${sceneName} selected Atom must match persisted selection`,
    );
  }
  assert.deepEqual(
    {
      deriveType: active.deriveType,
      indexedAccountId: active.indexedAccountId,
      networkId: active.networkId,
      walletId: active.walletId,
    },
    {
      deriveType: selected.deriveType,
      indexedAccountId: selected.indexedAccountId,
      networkId: selected.networkId,
      walletId: selected.walletId,
    },
    `${sceneName} active Atom must match selected Atom`,
  );
  assert.equal(
    selected.walletId,
    target.walletId,
    `${sceneName} selected wallet must match the fixture`,
  );
  assert.equal(
    selected.indexedAccountId,
    target.indexedAccountId,
    `${sceneName} selected account must match the fixture`,
  );

  const expectedAddress =
    expectedAccountAddressFixtures[target.fixtureId]?.[target.index]?.[
      selected.networkId
    ]?.[selected.deriveType];
  if (isAllNetworkSelection) {
    assert.equal(
      expectedAddress,
      undefined,
      'All Networks must not use a chain-specific golden address',
    );
  } else {
    assert.ok(
      expectedAddress,
      `Missing golden address for ${target.fixtureId}/${target.index}/${selected.networkId}/${selected.deriveType}`,
    );
    assert.equal(
      active.address,
      expectedAddress,
      `${sceneName} active account address must match the golden fixture`,
    );
  }

  const { accountName } = getExpectedAccountFixture(target);
  assert.equal(
    active.accountName,
    accountName,
    `${sceneName} active account name must match the fixture`,
  );
  if (assertUI) {
    const accountNames = await page
      .locator(visibleTestIDSelector(AccountSelectorTestIDs.triggerAccountName))
      .allTextContents();
    assert.ok(
      accountNames.some((name) => name.includes(accountName)),
      `Visible account name must include ${accountName}`,
    );
    const visibleAddressLocator = page.locator(
      visibleTestIDSelector(AccountSelectorTestIDs.addressText),
    );
    const visibleAddressCount = await visibleAddressLocator.count();
    assert.ok(
      visibleAddressCount <= 1,
      `Expected at most one visible element for testID ${AccountSelectorTestIDs.addressText}`,
    );
    if (expectedAddress && visibleAddressCount === 1) {
      const visibleAddress = await visibleAddressLocator.textContent();
      assert.equal(
        visibleAddress?.trim(),
        expectedAddress,
        'Visible account address must match the golden fixture',
      );
    }
  }
  return { persisted, snapshot };
}

async function assertDAppConnectionConsumer(
  page,
  target,
  origin = simulatedDAppOrigin,
) {
  const snapshot = await readAccountSelectorStateSnapshot(page, {
    sceneName: 'discover',
    sceneUrl: origin,
  });
  const selected = snapshot?.selected;
  assert.ok(selected, 'DApp consumer selected Atom snapshot is missing');
  const expectedAddress =
    expectedAccountAddressFixtures[target.fixtureId]?.[target.index]?.[
      selected.networkId
    ]?.[selected.deriveType];
  assert.ok(
    expectedAddress,
    `Missing DApp golden address for ${target.fixtureId}/${target.index}/${selected.networkId}/${selected.deriveType}`,
  );
  const { accountName } = getExpectedAccountFixture(target);
  const accountNameLocator = await getUniqueVisibleByTestID(
    page,
    AccountSelectorTestIDs.dappAccountName,
  );
  const addressLocator = await getUniqueVisibleByTestID(
    page,
    AccountSelectorTestIDs.dappAccountAddress,
  );
  assert.equal(
    (await accountNameLocator.textContent())?.trim(),
    accountName,
    'DApp connection card must render the selected fixture account name',
  );
  assert.equal(
    (await addressLocator.textContent())?.trim(),
    shortenAddress(expectedAddress),
    'DApp connection card must render the selected golden address',
  );
}

async function waitForPersistedSelection(
  page,
  expected,
  sceneName = 'home',
  num = 0,
) {
  await page.waitForFunction(
    async ({ expectedSelection, scene, selectionNum }) => {
      const selected =
        await globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.accountSelector.getSelectedAccount(
          {
            num: selectionNum,
            sceneName: scene,
          },
        );
      if (!selected) return false;
      return Object.entries(expectedSelection).every(
        ([key, value]) => selected[key] === value,
      );
    },
    { expectedSelection: expected, scene: sceneName, selectionNum: num },
    { timeout: pageTimeoutMs },
  );
}

function getDesktopSidebarTab(page, label) {
  return page
    .locator('.sidebar-tab-item')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first();
}

async function readActiveRouteNames(page) {
  return page.evaluate(() => {
    const routeNames = [];
    let state = globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
    while (state?.routes?.length) {
      const route = state.routes[state.index ?? 0];
      if (!route) break;
      routeNames.push(route.name);
      state = route.state;
    }
    return routeNames;
  });
}

async function switchAppTab(page, routeName) {
  await page.evaluate(async (targetRoute) => {
    const navigation = globalThis.$$appGlobals.$rootAppNavigation;
    if (!navigation?.switchTabAsync) {
      throw new Error('Root switchTabAsync navigation is unavailable');
    }
    await navigation.switchTabAsync(targetRoute);
  }, routeName);
  await page.waitForFunction(
    (targetRoute) => {
      let state =
        globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
      while (state?.routes?.length) {
        const route = state.routes[state.index ?? 0];
        if (!route) break;
        if (route.name === targetRoute) return true;
        state = route.state;
      }
      return false;
    },
    routeName,
    { timeout: pageTimeoutMs },
  );
}

async function switchDesktopSidebarTab(page, label, routeName) {
  const tab = getDesktopSidebarTab(page, label);
  await tab.waitFor({ state: 'visible', timeout: pageTimeoutMs });
  await tab.click({ timeout: pageTimeoutMs });
  await page.waitForTimeout(250);

  let routeNames = await readActiveRouteNames(page);
  if (!routeNames.includes(routeName)) {
    await switchAppTab(page, routeName);
    routeNames = await readActiveRouteNames(page);
  }
  assert.ok(
    routeNames.includes(routeName),
    `Expected active route ${routeName}, received ${routeNames.join(' > ')}`,
  );
}

async function waitForHomeShell(page) {
  const onboardingClose = page.locator(
    '[data-testid="page-close-trigger"]:visible, ' +
      '[data-testid="onboardingv2-handle-back-icon-btn"]:visible, ' +
      '[data-testid="onboarding-layout-header-back-btn"]:visible, ' +
      '[data-testid="onboarding-icon-btn"]:visible',
  );
  const homeTab = getDesktopSidebarTab(page, 'Wallet');
  const accountTrigger = page.locator(
    visibleTestIDSelector(AccountSelectorTestIDs.trigger),
  );
  const deadline = Date.now() + pageTimeoutMs;
  let homeStableSince;

  while (Date.now() < deadline) {
    if (await onboardingClose.count()) {
      homeStableSince = undefined;
      await onboardingClose
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
    } else {
      if (await accountTrigger.count()) {
        homeStableSince ??= Date.now();
        if (Date.now() - homeStableSince >= 2000) {
          assert.equal(
            await accountTrigger.count(),
            1,
            `Expected one visible element for testID ${AccountSelectorTestIDs.trigger}`,
          );
          return;
        }
      } else {
        homeStableSince = undefined;
      }
      if (await homeTab.count()) {
        await switchDesktopSidebarTab(page, 'Wallet', 'Home').catch(() => {});
      }
    }
    await page.waitForTimeout(250);
  }
  await getUniqueVisibleByTestID(page, AccountSelectorTestIDs.trigger, {
    timeout: 1,
  });
}

async function openAccountSelector(page) {
  const trigger = await getUniqueVisibleByTestID(
    page,
    AccountSelectorTestIDs.trigger,
  );
  await trigger.click({ timeout: pageTimeoutMs });
  await getUniqueVisibleByTestID(page, AccountManagerTestIDs.walletList);
}

async function selectWalletAccount(
  page,
  { indexedAccountId, index, walletId },
  { waitForCommit = true } = {},
) {
  await openAccountSelector(page);
  const wallet = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.wallet(walletId),
  );
  await wallet.click({ timeout: pageTimeoutMs });
  const account = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.accountItem(index),
  );
  await account.click({ timeout: pageTimeoutMs });
  if (!waitForCommit) {
    await waitForNoVisibleTestID(page, AccountManagerTestIDs.walletList);
    return;
  }
  await waitForPersistedSelection(page, { indexedAccountId, walletId });
  await waitForNoVisibleTestID(page, AccountManagerTestIDs.walletList);
  await getUniqueVisibleByTestID(
    page,
    AccountSelectorTestIDs.triggerAccountName,
  );
}

async function selectNetwork(page, networkId, { waitForCommit = true } = {}) {
  const trigger = await getUniqueVisibleByTestIDs(page, [
    AccountSelectorTestIDs.networkTrigger,
    AccountSelectorTestIDs.allNetworksTrigger,
  ]);
  await trigger.click({ timeout: pageTimeoutMs });

  const networkTab = await getUniqueVisibleByTestID(
    page,
    'unified-network-selector-network-tab',
  );
  await networkTab.click({ timeout: pageTimeoutMs });

  const networkItem = await getUniqueVisibleByTestIDs(page, [
    networkId,
    `select-item-${networkId}`,
  ]);
  await networkItem.click({ timeout: pageTimeoutMs });
  await waitForNoVisibleTestID(page, 'unified-network-selector-network-tab');
  if (waitForCommit) {
    await waitForPersistedSelection(page, { networkId });
  } else {
    const deadline = Date.now() + pageTimeoutMs;
    while (Date.now() < deadline) {
      if ((await networkItem.count()) === 0) {
        return;
      }
      await page.waitForTimeout(50);
    }
    assert.fail(`Network item ${networkId} remained visible`);
  }
}

function getAccountDerivationSettingsNetworkId(networkId) {
  if (networkId.startsWith('evm--')) {
    return 'evm--1';
  }
  return networkId;
}

async function openAccountDerivationSettings(page, networkId) {
  const settingsNetworkId = getAccountDerivationSettingsNetworkId(networkId);
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pushModal('SettingModal', {
      screen: 'SettingAccountDerivationModal',
    });
  });
  const trigger = await getUniqueVisibleByTestID(
    page,
    `account-derivation-network-${settingsNetworkId}`,
  );
  return { settingsNetworkId, trigger };
}

async function closeAccountDerivationSettings(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pop();
  });
  await waitForHomeShell(page);
}

async function selectDeriveTypeViaUI(
  page,
  { deriveType, settingsNetworkId, trigger },
) {
  await trigger.click({ timeout: pageTimeoutMs });
  let item;
  try {
    item = await getUniqueVisibleByTestID(page, `select-item-${deriveType}`, {
      timeout: 2000,
    });
  } catch {
    await trigger.click({ timeout: pageTimeoutMs });
    item = await getUniqueVisibleByTestID(page, `select-item-${deriveType}`);
  }
  await item.click({ force: true, timeout: pageTimeoutMs });
  await page.waitForFunction(
    async ({ expectedDeriveType, networkId }) => {
      const actual =
        await globalThis.$$appGlobals.$backgroundApiProxy.serviceNetwork.getGlobalDeriveTypeOfNetwork(
          { networkId },
        );
      return actual === expectedDeriveType;
    },
    { expectedDeriveType: deriveType, networkId: settingsNetworkId },
    { timeout: pageTimeoutMs },
  );
}

async function verifyAllNetworkDeriveAddresses(
  page,
  target,
  networkId,
  devOnlyPassword,
) {
  const deriveTypes = await page.evaluate(
    async ({ selectedNetworkId }) => {
      const serviceNetwork =
        globalThis.$$appGlobals.$backgroundApiProxy.serviceNetwork;
      const items = await serviceNetwork.getDeriveInfoItemsOfNetwork({
        networkId: selectedNetworkId,
      });
      return items.map((item) => item.value);
    },
    { selectedNetworkId: networkId },
  );
  assert.ok(
    deriveTypes.length > 0,
    `${networkId} must expose at least one derive type`,
  );
  const traces = [];
  const initialSelection = await readPersistedSelection(page);
  const orderedDeriveTypes = [
    ...deriveTypes.filter(
      (deriveType) => deriveType !== initialSelection?.deriveType,
    ),
    ...deriveTypes.filter(
      (deriveType) => deriveType === initialSelection?.deriveType,
    ),
  ];
  const settings =
    deriveTypes.length > 1
      ? await openAccountDerivationSettings(page, networkId)
      : undefined;
  for (const deriveType of orderedDeriveTypes) {
    if (settings) {
      const previous = await readPersistedSelection(page);
      await drainPerfTrace(page, devOnlyPassword);
      await selectDeriveTypeViaUI(page, { ...settings, deriveType });
      await waitForPersistedSelection(page, { deriveType, networkId });
      await assertAccountSelectorStateConsistent(page, target, {
        assertUI: false,
      });
      const changed = previous?.deriveType !== deriveType;
      const trace = await collectSelectionOperationTrace(
        page,
        devOnlyPassword,
        {
          expectActiveReload: changed,
          reason: 'autoDeriveGlobalSync',
        },
      );
      assertSelectionOperationBudget(trace, {
        expectedActiveReloads: changed ? 1 : 0,
        expectedSelectionUpdates: changed ? 1 : 0,
        label: `UI derive selection ${networkId}/${deriveType}`,
        reason: 'autoDeriveGlobalSync',
      });
      traces.push(trace);
    }
    await waitForPersistedSelection(page, { deriveType, networkId });
    await assertAccountSelectorStateConsistent(page, target);
  }
  if (settings) {
    const currentSelection = await readPersistedSelection(page);
    assert.ok(
      currentSelection?.deriveType,
      `${networkId} must keep a derive type before the no-op selection`,
    );
    await drainPerfTrace(page, devOnlyPassword);
    await selectDeriveTypeViaUI(page, {
      ...settings,
      deriveType: currentSelection.deriveType,
    });
    await assertAccountSelectorStateConsistent(page, target, {
      assertUI: false,
    });
    const noOpTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: false,
        reason: 'autoDeriveGlobalSync',
      },
    );
    assertSelectionOperationBudget(noOpTrace, {
      expectedActiveReloads: 0,
      expectedSelectionUpdates: 0,
      label: `no-op UI derive selection ${networkId}/${currentSelection.deriveType}`,
      reason: 'autoDeriveGlobalSync',
    });
    traces.push(noOpTrace);
    await closeAccountDerivationSettings(page);
    await assertAccountSelectorStateConsistent(page, target);
  }
  return mergePerfTrace(...traces);
}

async function runRapidSelectionBursts(page, fixture) {
  const accountTargets = [
    {
      fixtureId: fixture.wallets[0].fixtureId,
      index: 0,
      indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
      walletId: fixture.wallets[0].walletId,
    },
    {
      fixtureId: fixture.wallets[1].fixtureId,
      index: 1,
      indexedAccountId: fixture.wallets[1].indexedAccountIds[1],
      walletId: fixture.wallets[1].walletId,
    },
    {
      fixtureId: fixture.wallets[0].fixtureId,
      index: 1,
      indexedAccountId: fixture.wallets[0].indexedAccountIds[1],
      walletId: fixture.wallets[0].walletId,
    },
  ];
  for (const target of accountTargets) {
    await selectWalletAccount(page, target, { waitForCommit: false });
  }
  const finalAccount = accountTargets[accountTargets.length - 1];
  await waitForPersistedSelection(page, {
    indexedAccountId: finalAccount.indexedAccountId,
    walletId: finalAccount.walletId,
  });

  const networkTargets = ['evm--1', 'btc--0', 'evm--137'];
  for (const networkId of networkTargets) {
    await selectNetwork(page, networkId, { waitForCommit: false });
  }
  await waitForPersistedSelection(page, {
    networkId: networkTargets[networkTargets.length - 1],
  });

  await selectNetwork(page, 'btc--0');
  const deriveBurst = await page.evaluate(async () => {
    const api = globalThis.$$appGlobals.$backgroundApiProxy;
    const selected = await api.simpleDb.accountSelector.getSelectedAccount({
      num: 0,
      sceneName: 'home',
    });
    const deriveItems = await api.serviceNetwork.getDeriveInfoItemsOfNetwork({
      networkId: 'btc--0',
    });
    const alternatives = deriveItems
      .map((item) => item.value)
      .filter((value) => value !== selected?.deriveType);
    const finalDeriveType = alternatives[0];
    if (!finalDeriveType) {
      return undefined;
    }
    const writes = [
      finalDeriveType,
      selected?.deriveType,
      alternatives[1] || finalDeriveType,
      finalDeriveType,
    ].filter(Boolean);
    for (const deriveType of writes) {
      await api.serviceNetwork.saveGlobalDeriveTypeForNetwork({
        deriveType,
        networkId: 'btc--0',
      });
    }
    return { finalDeriveType, writes: writes.length };
  });
  assert.ok(deriveBurst?.writes >= 3, 'BTC derive burst needs three writes');
  await waitForPersistedSelection(page, {
    deriveType: deriveBurst.finalDeriveType,
    networkId: 'btc--0',
  });
  await assertAccountSelectorStateConsistent(page, finalAccount);
}

async function assertSwapConsumer(page, target) {
  const swapTab = getDesktopSidebarTab(page, 'Trade');
  if (!(await swapTab.count())) return;
  await switchDesktopSidebarTab(page, 'Trade', 'Swap');
  await page
    .locator('[data-testid="swap-content-container"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  await page
    .locator('[data-testid="swap-from-amount-input"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  await page
    .locator('[data-testid="swap-to-amount-input"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  await waitForPersistedSelection(
    page,
    {
      indexedAccountId: target.indexedAccountId,
      walletId: target.walletId,
    },
    'swap',
  );
  await assertAccountSelectorStateConsistent(page, target, {
    assertUI: false,
    sceneName: 'swap',
  });
  await switchDesktopSidebarTab(page, 'Wallet', 'Home');
}

async function assertPerpsAccountConsumer(page, devOnlyPassword, target) {
  await page
    .locator('[data-testid="perp-header-settings-button"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  const homeSelection = await readPersistedSelection(page);
  const expectedAddress =
    expectedAccountAddressFixtures[target.fixtureId]?.[target.index]?.[
      'evm--1'
    ]?.[homeSelection?.deriveType ?? 'default'];
  assert.ok(
    expectedAddress,
    `Missing Perps golden address for ${target.fixtureId}/${target.index}/${
      homeSelection?.deriveType ?? 'default'
    }`,
  );
  await page.waitForFunction(
    async ({ expectedIndexedAccountId, expectedPerpsAddress, password }) => {
      const activePerpsAccount =
        await globalThis.$$appGlobals.$backgroundApiProxy.serviceE2E.getPerpsActiveAccountE2E(
          { $$devOnlyPassword: password },
        );
      return Boolean(
        activePerpsAccount?.indexedAccountId === expectedIndexedAccountId &&
        activePerpsAccount?.accountAddress?.toLowerCase() ===
          expectedPerpsAddress.toLowerCase(),
      );
    },
    {
      expectedIndexedAccountId: target.indexedAccountId,
      expectedPerpsAddress: expectedAddress,
      password: devOnlyPassword,
    },
    { timeout: pageTimeoutMs },
  );
  await page.waitForTimeout(500);
  const activePerpsAccount = await page.evaluate(
    ({ password }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.serviceE2E.getPerpsActiveAccountE2E(
        { $$devOnlyPassword: password },
      ),
    { password: devOnlyPassword },
  );
  assert.equal(
    activePerpsAccount.indexedAccountId,
    target.indexedAccountId,
    'Perps business account must follow the Home Account Selector account',
  );
  assert.equal(
    activePerpsAccount.accountAddress?.toLowerCase(),
    expectedAddress.toLowerCase(),
    'Perps business account must resolve the selected fixture address',
  );
  await page
    .locator('[data-testid="perp-portfolio-button"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
}

async function runPerpsAccountSyncScenario(page, devOnlyPassword, fixture) {
  const initialSelection = await readPersistedSelection(page);
  const initialTarget = findFixtureTarget(fixture, initialSelection);
  await drainPerfTrace(page, devOnlyPassword);
  await switchAppTab(page, 'Perp');
  await assertAccountSelectorStateConsistent(page, initialTarget, {
    assertUI: false,
  });
  await assertPerpsAccountConsumer(page, devOnlyPassword, initialTarget);
  const initialTrace = await drainPerfTrace(page, devOnlyPassword);

  const preferredTarget = {
    fixtureId: fixture.wallets[1].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[1].indexedAccountIds[0],
    walletId: fixture.wallets[1].walletId,
  };
  const target =
    preferredTarget.indexedAccountId === initialTarget.indexedAccountId
      ? {
          fixtureId: fixture.wallets[0].fixtureId,
          index: 0,
          indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
          walletId: fixture.wallets[0].walletId,
        }
      : preferredTarget;

  await switchDesktopSidebarTab(page, 'Wallet', 'Home');
  await waitForHomeShell(page);
  await drainPerfTrace(page, devOnlyPassword);
  await selectWalletAccount(page, target);
  const selectionTrace = await collectSelectionOperationTrace(
    page,
    devOnlyPassword,
    {
      expectActiveReload: true,
      reason: 'userSelectAccount',
    },
  );
  assertSelectionOperationBudget(selectionTrace, {
    expectedActiveReloads: 1,
    expectedSelectionUpdates: 1,
    label: 'Perps source account selection',
    reason: 'userSelectAccount',
  });

  await switchAppTab(page, 'Perp');
  await assertAccountSelectorStateConsistent(page, target, {
    assertUI: false,
  });
  await assertPerpsAccountConsumer(page, devOnlyPassword, target);
  const syncedTrace = await drainPerfTrace(page, devOnlyPassword);
  await switchDesktopSidebarTab(page, 'Wallet', 'Home');
  await waitForHomeShell(page);
  const trace = mergePerfTrace(initialTrace, selectionTrace, syncedTrace);
  assertTraceHealth({ ...trace, phase: 'perps-account-sync' });
  return trace;
}

async function addSimulatedCustomNetwork(page, cycle) {
  return page.evaluate(
    async ({ cycleNumber }) => {
      const serviceCustomRpc =
        globalThis.$$appGlobals.$$backgroundApi?.serviceCustomRpc;
      if (!serviceCustomRpc?.upsertCustomNetworkInfo) {
        throw new Error(
          'Direct ServiceCustomRpc is unavailable in the Web single runtime',
        );
      }
      const chainId = String(31_337 + cycleNumber);
      const networkId = `evm--${chainId}`;
      const networkName = `E2E Custom ${chainId}`;
      await serviceCustomRpc.upsertCustomNetworkInfo({
        networkInfo: {
          backendIndex: false,
          chainId,
          code: networkName,
          decimals: 18,
          defaultEnabled: true,
          explorerURL: 'https://account-selector-e2e.test/explorer',
          feeMeta: {
            decimals: 9,
            isEIP1559FeeEnabled: true,
            isWithL1BaseFee: false,
            symbol: 'Gwei',
          },
          id: networkId,
          impl: 'evm',
          isCustomNetwork: true,
          isTestnet: true,
          logoURI: '',
          name: networkName,
          shortcode: networkName,
          shortname: networkName,
          status: 'LISTED',
          symbol: 'E2E',
        },
        rpcUrl: 'http://127.0.0.1:8545',
        skipSaveLocalSyncItem: true,
      });
      return { networkId };
    },
    { cycleNumber: cycle },
  );
}

async function runMultiNumAndCustomNetworkScenario(
  page,
  devOnlyPassword,
  cycle,
  fixture,
) {
  const homeSelection = await readPersistedSelection(page);
  assert.ok(homeSelection?.walletId, 'Home selection must have a wallet');
  assert.ok(
    homeSelection?.indexedAccountId,
    'Home selection must have an indexed account',
  );
  const target = findFixtureTarget(fixture, homeSelection);

  await switchDesktopSidebarTab(page, 'Trade', 'Swap');
  await page
    .locator('[data-testid="swap-content-container"]:visible')
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  await waitForPersistedSelection(
    page,
    {
      indexedAccountId: homeSelection.indexedAccountId,
      walletId: homeSelection.walletId,
    },
    'swap',
    0,
  );
  await waitForPersistedSelection(
    page,
    {
      indexedAccountId: homeSelection.indexedAccountId,
      walletId: homeSelection.walletId,
    },
    'swap',
    1,
  );

  const mountTrace = await collectPerfTraceUntil(
    page,
    devOnlyPassword,
    (events) =>
      [0, 1].every((num) =>
        events.some(
          (event) =>
            event.event === 'effectsStateObserved' &&
            event.sceneName === 'swap' &&
            event.num === num &&
            event.selection?.hasWallet === true &&
            event.activeAccount?.ready === true,
        ),
      ),
  );
  for (const num of [0, 1]) {
    await assertAccountSelectorStateConsistent(page, target, {
      assertUI: false,
      num,
      sceneName: 'swap',
    });
  }

  const { networkId } = await addSimulatedCustomNetwork(page, cycle);
  await page.waitForFunction(
    async ({ expectedNetworkId }) => {
      const result =
        await globalThis.$$appGlobals.$backgroundApiProxy.serviceNetwork.getAllNetworkIds();
      return result.networkIds.includes(expectedNetworkId);
    },
    { expectedNetworkId: networkId },
    { timeout: pageTimeoutMs },
  );
  const customNetworkTrace = await collectPerfTraceUntil(
    page,
    devOnlyPassword,
    (events) =>
      [0, 1].every(
        (num) =>
          events.some(
            (event) =>
              event.event === 'availableNetworksResult' &&
              event.consumer === 'auto-select-network' &&
              event.num === num &&
              event.outcome === 'success' &&
              event.sceneName === 'swap' &&
              event.trigger === 'custom-network-event',
          ) &&
          events.some(
            (event) =>
              event.event === 'activeReloadResult' &&
              event.num === num &&
              event.sceneName === 'swap' &&
              event.trigger === 'custom-network-update',
          ),
      ),
  );
  const trace = mergePerfTrace(mountTrace, customNetworkTrace);
  assertTraceHealth({ ...trace, phase: 'multi-num-custom-network' });

  for (const num of [0, 1]) {
    const requests = customNetworkTrace.events.filter(
      (event) =>
        event.event === 'availableNetworksRequested' &&
        event.consumer === 'auto-select-network' &&
        event.num === num &&
        event.sceneName === 'swap' &&
        event.trigger === 'custom-network-event',
    );
    const schedules = customNetworkTrace.events.filter(
      (event) =>
        event.event === 'activeReloadScheduled' &&
        event.num === num &&
        event.sceneName === 'swap' &&
        event.trigger === 'custom-network-update',
    );
    assert.equal(
      requests.length,
      1,
      `Swap num ${num} must refresh available networks exactly once`,
    );
    assert.equal(
      schedules.length,
      1,
      `Swap num ${num} must schedule one custom-network reload`,
    );
  }
  assert.ok(
    customNetworkTrace.events.some(
      (event) =>
        event.event === 'availableNetworksResult' &&
        event.changed === true &&
        event.trigger === 'custom-network-event',
    ),
    'Custom network refresh must observe the changed network list',
  );
  for (const num of [0, 1]) {
    await assertAccountSelectorStateConsistent(page, target, {
      assertUI: false,
      num,
      sceneName: 'swap',
    });
  }

  await switchDesktopSidebarTab(page, 'Wallet', 'Home');
  await waitForHomeShell(page);
  return { networkId, trace };
}

async function deleteSimulatedDAppConnection(
  page,
  connectionOrigin = simulatedDAppOrigin,
) {
  await page.evaluate(
    ({ origin }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.deleteConnection(
        origin,
        'injectedProvider',
      ),
    { origin: connectionOrigin },
  );
}

function assertDAppAccountSelectorInitializationRefreshBudget(trace) {
  const mirrorCommits = trace.events.filter(
    (event) =>
      event.event === 'mirrorTrackerCommit' &&
      event.perfDebugName === 'dapp-connection-modal',
  );
  const mirrorRegistrations = trace.events.filter(
    (event) =>
      event.event === 'mirrorTrackerRegistration' &&
      event.perfDebugName === 'dapp-connection-modal',
  );
  const mirrorProviderInstanceIds = new Set(
    mirrorCommits.map((event) => event.providerInstanceId),
  );
  assert.equal(
    mirrorProviderInstanceIds.size,
    1,
    'DApp initialization must use one AccountSelector mirror tracker instance',
  );
  assert.equal(
    mirrorRegistrations.filter((event) => event.action === 'add').length,
    1,
    'DApp initialization must register one AccountSelector mirror tracker',
  );
  assert.equal(
    mirrorRegistrations.filter((event) => event.action === 'remove').length,
    0,
    'DApp initialization must not unregister its mirror tracker before approval',
  );
  assert.ok(
    mirrorCommits.length <= 1,
    `DApp AccountSelector mirror committed ${mirrorCommits.length} times during initialization (limit 1)`,
  );

  const effectsHostCommits = trace.events.filter(
    (event) =>
      event.event === 'effectsHostCommit' &&
      event.num === 0 &&
      event.sceneName === 'discover',
  );
  const effectsStateObservations = trace.events.filter(
    (event) =>
      event.event === 'effectsStateObserved' &&
      event.num === 0 &&
      event.sceneName === 'discover',
  );
  const effectInstanceIds = new Set(
    effectsHostCommits.map((event) => event.effectInstanceId),
  );
  assert.equal(
    effectInstanceIds.size,
    1,
    'DApp initialization must use one AccountSelectorEffects instance',
  );
  assert.ok(
    effectsHostCommits.length <= 5,
    `DApp AccountSelectorEffects host committed ${effectsHostCommits.length} times during initialization (limit 5)`,
  );
  assert.ok(
    effectsStateObservations.length <= 4,
    `DApp AccountSelectorEffects observed ${effectsStateObservations.length} semantic states during initialization (limit 4)`,
  );
  for (const channel of [
    'activeAccount',
    'selectedAccount',
    'storageReady',
    'updateMeta',
  ]) {
    const count = effectsStateObservations.filter((event) =>
      event.changedChannels?.includes(channel),
    ).length;
    assert.ok(
      count <= 1,
      `DApp AccountSelectorEffects observed ${channel} ${count} times during initialization (limit 1)`,
    );
  }
}

function assertDAppAccountSelectorMirrorLifecycle(trace) {
  const mirrorCommits = trace.events.filter(
    (event) =>
      event.event === 'mirrorTrackerCommit' &&
      event.perfDebugName === 'dapp-connection-modal',
  );
  const providerInstanceIds = new Set(
    mirrorCommits.map((event) => event.providerInstanceId),
  );
  assert.equal(
    providerInstanceIds.size,
    1,
    'DApp connection must keep one AccountSelector mirror tracker instance',
  );
  const providerInstanceId = mirrorCommits[0]?.providerInstanceId;
  const registrations = trace.events.filter(
    (event) =>
      event.event === 'mirrorTrackerRegistration' &&
      event.providerInstanceId === providerInstanceId,
  );
  assert.equal(
    registrations.filter((event) => event.action === 'add').length,
    1,
    'DApp connection must register its AccountSelector mirror once',
  );
  assert.equal(
    registrations.filter((event) => event.action === 'remove').length,
    1,
    'DApp connection must unregister its AccountSelector mirror once',
  );
  assert.equal(
    mirrorCommits.length,
    1,
    'DApp connection must not recommit its AccountSelector mirror',
  );
}

function assertSelectionOperationBudget(
  trace,
  {
    expectedActiveReloads,
    expectedSelectionUpdates,
    label,
    num = 0,
    reason,
    sceneName = 'home',
  },
) {
  assertTraceHealth({ ...trace, phase: label });
  const rawSelectionUpdates = trace.events.filter(
    (event) =>
      event.event === 'selectionStateUpdated' &&
      event.num === num &&
      event.reason === reason,
  );
  const rawTransitionIds = new Set(
    rawSelectionUpdates.map((event) => event.transitionId),
  );
  if (expectedSelectionUpdates === 0) {
    assert.equal(
      rawSelectionUpdates.length,
      0,
      `${label} must not commit a no-op selection update`,
    );
  }
  const storageRequests = trace.events.filter(
    (event) =>
      event.event === 'selectionStorageRequested' &&
      event.num === num &&
      event.reason === reason &&
      event.sceneName === sceneName &&
      rawTransitionIds.has(event.transitionId),
  );
  const transitionIds = new Set(
    storageRequests.map((event) => event.transitionId),
  );
  const selectionUpdates = trace.events.filter(
    (event) =>
      event.event === 'selectionStateUpdated' &&
      event.num === num &&
      event.reason === reason &&
      transitionIds.has(event.transitionId),
  );
  assert.equal(
    selectionUpdates.length,
    expectedSelectionUpdates,
    `${label} must commit ${expectedSelectionUpdates} effective selection update(s)`,
  );
  const activeSchedules = trace.events.filter(
    (event) =>
      event.event === 'activeReloadScheduled' &&
      event.num === num &&
      event.reason === reason &&
      event.sceneName === sceneName,
  );
  assert.equal(
    activeSchedules.length,
    expectedActiveReloads,
    `${label} must schedule ${expectedActiveReloads} active reload(s)`,
  );
  const completedReloads = trace.events.filter(
    (event) =>
      event.event === 'activeReloadResult' &&
      event.num === num &&
      ['commit', 'noop'].includes(event.outcome) &&
      event.reason === reason &&
      event.sceneName === sceneName,
  );
  assert.equal(
    completedReloads.length,
    expectedActiveReloads,
    `${label} must complete ${expectedActiveReloads} active reload(s)`,
  );
  const committedScheduleIds = new Set(
    completedReloads
      .filter((event) => event.outcome === 'commit')
      .map((event) => event.scheduleId),
  );
  const selectedObservations = trace.events.filter(
    (event) =>
      event.event === 'effectsStateObserved' &&
      event.num === num &&
      event.sceneName === sceneName &&
      transitionIds.has(event.transitionId) &&
      event.changedChannels?.includes('selectedAccount'),
  );
  assert.equal(
    selectedObservations.length,
    expectedSelectionUpdates,
    `${label} must expose each selection update to Effects once`,
  );
  const activeObservations = trace.events.filter(
    (event) =>
      event.event === 'effectsStateObserved' &&
      event.num === num &&
      event.sceneName === sceneName &&
      committedScheduleIds.has(event.activeScheduleId) &&
      event.changedChannels?.includes('activeAccount'),
  );
  assert.equal(
    activeObservations.length,
    committedScheduleIds.size,
    `${label} must expose each committed active account result to Effects once`,
  );
  assert.equal(
    storageRequests.length,
    expectedSelectionUpdates,
    `${label} must persist each selection update once`,
  );
  const storageOperationIds = new Set(
    storageRequests.map((event) => event.operationId),
  );
  const storageResults = trace.events.filter(
    (event) =>
      event.event === 'selectionStorageResult' &&
      storageOperationIds.has(event.operationId),
  );
  assert.equal(
    storageResults.length,
    storageRequests.length,
    `${label} must complete each causally related storage request once`,
  );
  const longLivedMirrorCommits = trace.events.filter(
    (event) =>
      event.event === 'mirrorTrackerCommit' &&
      ['home-page', 'swap-route'].includes(event.perfDebugName),
  );
  assert.deepEqual(
    longLivedMirrorCommits,
    [],
    `${label} must not recommit a long-lived AccountSelector mirror`,
  );
}

function assertLatestWinsBurstBudget(trace) {
  assertTraceHealth({ ...trace, phase: 'latest-wins-burst' });
  assert.ok(
    trace.events.some((event) => event.event === 'activeReloadCoalesced'),
    'Rapid selection must coalesce active reloads',
  );
  assert.ok(
    trace.events.some((event) => event.event === 'globalDeriveEventCoalesced'),
    'Rapid derive writes must coalesce global derive events',
  );
  const homeDeriveStorageRequests = trace.events.filter(
    (event) =>
      event.event === 'selectionStorageRequested' &&
      event.num === 0 &&
      event.reason === 'autoDeriveGlobalSync' &&
      event.sceneName === 'home',
  );
  assert.ok(
    homeDeriveStorageRequests.length > 0,
    'Rapid derive writes must produce a final Home selection',
  );
  const finalTransitionId =
    homeDeriveStorageRequests[homeDeriveStorageRequests.length - 1]
      .transitionId;
  const finalSchedules = trace.events.filter(
    (event) =>
      event.event === 'activeReloadScheduled' &&
      event.num === 0 &&
      event.sceneName === 'home' &&
      event.transitionId === finalTransitionId,
  );
  assert.equal(
    finalSchedules.length,
    1,
    'The latest derive selection must schedule one Home active reload',
  );
  const finalResults = trace.events.filter(
    (event) =>
      event.event === 'activeReloadResult' &&
      event.num === 0 &&
      event.sceneName === 'home' &&
      event.transitionId === finalTransitionId &&
      ['commit', 'noop'].includes(event.outcome),
  );
  assert.equal(
    finalResults.length,
    1,
    'The latest derive selection must complete one Home active reload',
  );
  assert.deepEqual(
    trace.events.filter(
      (event) =>
        event.event === 'mirrorTrackerCommit' &&
        ['home-page', 'swap-route'].includes(event.perfDebugName),
    ),
    [],
    'Rapid selection must not recommit long-lived AccountSelector mirrors',
  );
}

async function openAndApproveSimulatedDAppConnection(
  page,
  devOnlyPassword,
  {
    assertInitializationDetails = true,
    cleanupConnection = false,
    expectedNetworkId = 'evm--1',
    expectedSelection,
    origin: connectionOrigin = simulatedDAppOrigin,
    writeArtifacts = true,
  } = {},
) {
  await deleteSimulatedDAppConnection(page, connectionOrigin);
  const pendingTrace = await drainPerfTrace(page, devOnlyPassword);
  await page.evaluate(
    ({ origin }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const state = {
        hasResult: false,
        outcome: 'pending',
      };
      globalThis.__accountSelectorE2EDappConnection = state;
      void api.serviceDApp
        .openConnectionModal({
          data: {
            method: 'eth_requestAccounts',
            params: [],
          },
          id: `account-selector-e2e-${Date.now()}`,
          origin,
          scope: 'ethereum',
        })
        .then((result) => {
          state.hasResult = Boolean(result);
          state.outcome = 'resolved';
        })
        .catch((error) => {
          state.error = error?.message || String(error);
          state.outcome = 'rejected';
        });
    },
    { origin: connectionOrigin },
  );

  const modal = await getUniqueVisibleByTestID(
    page,
    DAppConnectionTestIDs.ConnectionModal,
  );
  const accountItems = modal.locator(
    visibleTestIDSelector(DAppConnectionTestIDs.AccountListItem),
  );
  await accountItems
    .first()
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  assert.ok(
    (await accountItems.count()) >= 1,
    'DApp connection modal must render at least one account item',
  );

  const initializationTrace = await collectPerfTraceUntil(
    page,
    devOnlyPassword,
    (events) =>
      events.some(
        (event) =>
          event.event === 'autoSelectAccountResult' &&
          event.num === 0 &&
          event.sceneName === 'discover' &&
          event.source === 'active-ready',
      ) &&
      events.some(
        (event) =>
          event.event === 'manualSceneSyncResult' &&
          event.num === 0 &&
          event.sourceNum === 0 &&
          event.sourceSceneName === 'home',
      ) &&
      events.some(
        (event) =>
          event.event === 'dappConnectionAccountObserved' &&
          event.num === 0 &&
          event.hasAddress === true,
      ) &&
      events.some(
        (event) =>
          event.event === 'providerSubtreeCommit' &&
          event.perfDebugName === 'dapp-connection-modal',
      ),
  );
  assertTraceHealth({
    ...initializationTrace,
    phase: 'dapp-connection-modal-initialization',
  });
  assertDAppAccountSelectorInitializationRefreshBudget(initializationTrace);
  if (expectedSelection) {
    await assertAccountSelectorStateConsistent(page, expectedSelection, {
      assertPersistence: false,
      sceneName: 'discover',
      sceneUrl: connectionOrigin,
    });
    await assertDAppConnectionConsumer(
      page,
      expectedSelection,
      connectionOrigin,
    );
  }
  if (writeArtifacts) {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, 'dapp-connection-initialization-trace.json'),
      `${JSON.stringify(initializationTrace, null, 2)}\n`,
    );
  }

  if (assertInitializationDetails) {
    const autoSelectRequests = initializationTrace.events.filter(
      (event) =>
        event.event === 'autoSelectAccountRequested' &&
        event.num === 0 &&
        event.sceneName === 'discover' &&
        event.source === 'active-ready',
    );
    assert.equal(
      autoSelectRequests.length,
      1,
      'DApp connection modal must start auto-select exactly once',
    );
    const sceneSyncRequests = initializationTrace.events.filter(
      (event) =>
        event.event === 'manualSceneSyncRequested' &&
        event.num === 0 &&
        event.sourceNum === 0 &&
        event.sourceSceneName === 'home',
    );
    assert.equal(
      sceneSyncRequests.length,
      1,
      'DApp connection modal must sync Home selection exactly once',
    );
    const effectInstanceIds = new Set(
      initializationTrace.events
        .filter(
          (event) =>
            event.event === 'effectsStateObserved' &&
            event.num === 0 &&
            event.sceneName === 'discover',
        )
        .map((event) => event.effectInstanceId),
    );
    assert.equal(
      effectInstanceIds.size,
      1,
      'DApp connection modal must mount one AccountSelectorEffects instance',
    );
    const appliedAccountObservations = initializationTrace.events.filter(
      (event) =>
        event.event === 'dappConnectionAccountObserved' &&
        event.num === 0 &&
        event.appliedToModal === true,
    );
    assert.equal(
      appliedAccountObservations.length,
      1,
      'DApp connection modal must apply one usable account observation',
    );
    const accountObservations = initializationTrace.events.filter(
      (event) =>
        event.event === 'dappConnectionAccountObserved' && event.num === 0,
    );
    assert.ok(
      accountObservations.length <= 2,
      `DApp connection modal observed ${accountObservations.length} account states (limit 2)`,
    );
    const initializationSelectionUpdates = initializationTrace.events.filter(
      (event) =>
        event.event === 'selectionStateUpdated' &&
        event.num === 0 &&
        ['syncFromScene', 'autoSelectNetwork', 'autoDeriveFallback'].includes(
          event.reason,
        ),
    );
    assert.equal(
      initializationSelectionUpdates.length,
      1,
      `DApp connection initialization must update selection once, received ${initializationSelectionUpdates.length}`,
    );
    assert.equal(
      initializationSelectionUpdates[0]?.reason,
      'syncFromScene',
      'DApp connection initialization must atomically prepare the Home selection',
    );
    for (const field of [
      'walletId',
      'indexedAccountId',
      'networkId',
      'deriveType',
      'focusedWallet',
    ]) {
      assert.ok(
        initializationSelectionUpdates[0]?.changedFields?.includes(field),
        `DApp connection atomic selection update must include ${field}`,
      );
    }
    const initializationActiveReloads = initializationTrace.events.filter(
      (event) =>
        event.event === 'activeReloadResult' &&
        event.num === 0 &&
        event.sceneName === 'discover' &&
        event.outcome === 'commit' &&
        ['syncFromScene', 'autoSelectNetwork', 'autoDeriveFallback'].includes(
          event.reason,
        ),
    );
    assert.equal(
      initializationActiveReloads.length,
      1,
      `DApp connection initialization must reload the active account once, received ${initializationActiveReloads.length}`,
    );
    assert.equal(
      initializationActiveReloads[0]?.reason,
      'syncFromScene',
      'DApp connection initialization reload must use the atomic scene sync',
    );
  }

  const approveButton = await getUniqueVisibleByTestID(
    modal,
    DAppConnectionTestIDs.ConnectionApproveButton,
  );
  await approveButton.click({ timeout: pageTimeoutMs });
  await modal.waitFor({ state: 'hidden', timeout: pageTimeoutMs });
  await page.waitForFunction(
    () => globalThis.__accountSelectorE2EDappConnection?.outcome !== 'pending',
    undefined,
    { timeout: pageTimeoutMs },
  );
  const connectionResult = await page.evaluate(
    () => globalThis.__accountSelectorE2EDappConnection,
  );
  assert.deepEqual(
    {
      error: connectionResult?.error,
      hasResult: connectionResult?.hasResult,
      outcome: connectionResult?.outcome,
    },
    { error: undefined, hasResult: true, outcome: 'resolved' },
    'Simulated DApp connection request must resolve through the real modal',
  );
  await page.waitForTimeout(350);
  const completionTrace = await drainPerfTrace(page, devOnlyPassword);
  const trace = mergePerfTrace(
    pendingTrace,
    initializationTrace,
    completionTrace,
  );
  assertDAppAccountSelectorMirrorLifecycle(trace);
  const dappConnectionSummary = buildTraceSummary(trace.events);
  if (writeArtifacts) {
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, 'dapp-connection-trace.json'),
      JSON.stringify(
        {
          events: trace.events,
          summary: dappConnectionSummary,
        },
        null,
        2,
      ),
    );
  }
  const providerSummary =
    dappConnectionSummary.providerRenders.byDebugName['dapp-connection-modal'];
  assert.ok(providerSummary, 'DApp connection Provider trace is missing');
  assert.ok(
    providerSummary.commitCount <= dappConnectionProviderCommitLimit,
    `DApp connection Provider committed ${providerSummary.commitCount} times (limit ${dappConnectionProviderCommitLimit})`,
  );

  const dappMap = await page.evaluate(
    ({ origin }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.getAccountSelectorMap(
        { sceneUrl: origin },
      ),
    { origin: connectionOrigin },
  );
  assert.ok(dappMap?.[0]?.walletId, 'DApp approval must persist a wallet');
  assert.ok(
    dappMap?.[0]?.indexedAccountId || dappMap?.[0]?.othersWalletAccountId,
    'DApp approval must persist an account',
  );
  if (expectedSelection) {
    assert.equal(
      dappMap?.[0]?.walletId,
      expectedSelection.walletId,
      'DApp approval must persist the newly selected wallet',
    );
    assert.equal(
      dappMap?.[0]?.indexedAccountId,
      expectedSelection.indexedAccountId,
      'DApp approval must persist the newly selected account',
    );
  }
  if (expectedNetworkId) {
    assert.equal(
      dappMap?.[0]?.networkId,
      expectedNetworkId,
      'DApp approval must inherit the expected EVM network',
    );
  } else {
    assert.ok(
      dappMap?.[0]?.networkId?.startsWith('evm--'),
      'DApp approval must persist an EVM network',
    );
  }
  if (cleanupConnection) {
    await deleteSimulatedDAppConnection(page, connectionOrigin);
  }
  return trace;
}

async function openSimulatedDAppAccountSelector(
  page,
  { num = 0, origin: connectionOrigin = simulatedDAppOrigin } = {},
) {
  await page.waitForFunction(
    () => Boolean(globalThis.$$appGlobals.$rootAppNavigation?.pushModal),
    undefined,
    { timeout: pageTimeoutMs },
  );
  await page.evaluate(
    ({ origin, selectionNum }) => {
      globalThis.$$appGlobals.$rootAppNavigation.pushModal(
        'AccountManagerStacks',
        {
          params: {
            num: selectionNum,
            sceneName: 'discover',
            sceneUrl: origin,
          },
          screen: 'AccountSelectorStack',
        },
      );
    },
    { origin: connectionOrigin, selectionNum: num },
  );
  await getUniqueVisibleByTestID(page, AccountManagerTestIDs.walletList);
}

async function closeSimulatedDAppAccountSelector(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pop();
  });
  await waitForNoVisibleTestID(page, AccountManagerTestIDs.walletList).catch(
    () => undefined,
  );
  await waitForHomeShell(page);
}

async function buildSimulatedDAppAccountInfo(page, target) {
  return page.evaluate(
    async ({ indexedAccountId, walletId }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const networkId = 'evm--1';
      const deriveType =
        (await api.serviceNetwork.getGlobalDeriveTypeOfNetwork({
          networkId,
        })) ?? 'default';
      const { accounts } =
        await api.serviceAccount.getAccountsByIndexedAccounts({
          deriveType,
          indexedAccountIds: [indexedAccountId],
          networkId,
        });
      const account = accounts[0];
      if (!account?.id || !account.address) {
        throw new Error(
          `Unable to build simulated DApp account for ${indexedAccountId}`,
        );
      }
      return {
        accountId: account.id,
        address: account.address,
        deriveType,
        focusedWallet: walletId,
        indexedAccountId,
        networkId,
        networkImpl: 'evm',
        walletId,
      };
    },
    {
      indexedAccountId: target.indexedAccountId,
      walletId: target.walletId,
    },
  );
}

function selectedAccountIdentity(selection) {
  return {
    deriveType: selection?.deriveType,
    indexedAccountId: selection?.indexedAccountId,
    networkId: selection?.networkId,
    othersWalletAccountId: selection?.othersWalletAccountId,
    walletId: selection?.walletId,
  };
}

async function openDAppConnectionList(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pushModal(
      'DAppConnectionModal',
      { screen: 'ConnectionList' },
    );
  });
  return getUniqueVisibleByTestID(page, DAppConnectionTestIDs.ConnectionList);
}

async function closeDAppConnectionList(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pop();
  });
  await waitForNoVisibleTestID(page, DAppConnectionTestIDs.ConnectionList);
  await waitForHomeShell(page);
}

async function runMultiOriginDAppScenario(page, devOnlyPassword, fixture) {
  await deleteSimulatedDAppConnection(page, simulatedDAppSecondaryOrigin);
  const homeSelection = await readPersistedSelection(page);
  const homeTarget = findFixtureTarget(fixture, homeSelection);
  const connectionTrace = await openAndApproveSimulatedDAppConnection(
    page,
    devOnlyPassword,
    {
      expectedSelection: homeTarget,
      writeArtifacts: false,
    },
  );

  const primaryNumOneTarget = {
    fixtureId: fixture.wallets[0].fixtureId,
    index: 1,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[1],
    walletId: fixture.wallets[0].walletId,
  };
  const secondaryNumZeroTarget = {
    fixtureId: fixture.wallets[0].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
    walletId: fixture.wallets[0].walletId,
  };
  const secondaryNumOneTarget = {
    fixtureId: fixture.wallets[1].fixtureId,
    index: 1,
    indexedAccountId: fixture.wallets[1].indexedAccountIds[1],
    walletId: fixture.wallets[1].walletId,
  };
  const secondaryNumOneUpdatedTarget = {
    fixtureId: fixture.wallets[1].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[1].indexedAccountIds[0],
    walletId: fixture.wallets[1].walletId,
  };
  const [primaryNumOneInfo, secondaryNumZeroInfo, secondaryNumOneInfo] =
    await Promise.all([
      buildSimulatedDAppAccountInfo(page, primaryNumOneTarget),
      buildSimulatedDAppAccountInfo(page, secondaryNumZeroTarget),
      buildSimulatedDAppAccountInfo(page, secondaryNumOneTarget),
    ]);
  await page.evaluate(
    async ({
      primaryAccount,
      primaryOrigin,
      secondaryAccounts,
      secondaryOrigin,
    }) => {
      const dappConnection =
        globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection;
      await dappConnection.upsertConnection({
        accountsInfo: [primaryAccount],
        imageURL: '',
        origin: primaryOrigin,
        storageType: 'injectedProvider',
      });
      await dappConnection.upsertConnection({
        accountsInfo: secondaryAccounts,
        imageURL: '',
        origin: secondaryOrigin,
        storageType: 'injectedProvider',
      });
    },
    {
      primaryAccount: primaryNumOneInfo,
      primaryOrigin: simulatedDAppOrigin,
      secondaryAccounts: [secondaryNumZeroInfo, secondaryNumOneInfo],
      secondaryOrigin: simulatedDAppSecondaryOrigin,
    },
  );

  await drainPerfTrace(page, devOnlyPassword);
  const connectionList = await openDAppConnectionList(page);
  const connectionItems = connectionList.locator(
    visibleTestIDSelector(DAppConnectionTestIDs.ConnectionListItem),
  );
  await connectionItems
    .nth(1)
    .waitFor({ state: 'visible', timeout: pageTimeoutMs });
  assert.equal(
    await connectionItems.count(),
    2,
    'DApp connection list must render both simulated origins',
  );

  const scenarios = [
    {
      origin: simulatedDAppOrigin,
      targets: [homeTarget, primaryNumOneTarget],
    },
    {
      origin: simulatedDAppSecondaryOrigin,
      targets: [secondaryNumZeroTarget, secondaryNumOneTarget],
    },
  ];
  for (const scenario of scenarios) {
    const hostname = new URL(scenario.origin).hostname;
    const connectionItem = connectionItems.filter({ hasText: hostname });
    assert.equal(
      await connectionItem.count(),
      1,
      `DApp connection list must render one card for ${scenario.origin}`,
    );
    const accountCards = connectionItem.locator(
      visibleTestIDSelector(DAppConnectionTestIDs.AccountListItem),
    );
    await accountCards
      .nth(1)
      .waitFor({ state: 'visible', timeout: pageTimeoutMs });
    assert.equal(
      await accountCards.count(),
      2,
      `${scenario.origin} must render enabledNum 0 and 1`,
    );
    for (const [num, target] of scenario.targets.entries()) {
      await assertAccountSelectorStateConsistent(page, target, {
        assertUI: false,
        num,
        sceneName: 'discover',
        sceneUrl: scenario.origin,
      });
    }
  }
  const initializationTrace = await drainPerfTrace(page, devOnlyPassword);
  assertTraceHealth({
    ...initializationTrace,
    phase: 'dapp-multi-origin-initialization',
  });
  for (const scenario of scenarios) {
    assert.ok(
      initializationTrace.events.some(
        (event) =>
          event.event === 'providerSubtreeCommit' &&
          event.perfDebugName === `dapp-connection-list:${scenario.origin}` &&
          event.enabledNum?.join(',') === '0,1',
      ),
      `${scenario.origin} must mount one profiled Discover provider for enabledNum 0 and 1`,
    );
  }

  const mapsBeforeSelection = await Promise.all(
    scenarios.map(({ origin }) =>
      page.evaluate(
        ({ sceneUrl }) =>
          globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.getAccountSelectorMap(
            { sceneUrl },
          ),
        { sceneUrl: origin },
      ),
    ),
  );
  const secondaryConnectionItem = connectionItems.filter({
    hasText: new URL(simulatedDAppSecondaryOrigin).hostname,
  });
  const secondaryAccountCards = secondaryConnectionItem.locator(
    visibleTestIDSelector(DAppConnectionTestIDs.AccountListItem),
  );
  await page.evaluate(
    ({ origin }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const methodKey = 'serviceDApp.updateConnectionSession';
      const originalUpdateConnectionSession =
        api.serviceDApp.updateConnectionSession;
      globalThis.$$accountSelectorE2EDAppUpdateHistory = [];
      globalThis.$$accountSelectorE2EOriginalDAppUpdate =
        originalUpdateConnectionSession;
      api._proxyServiceCache[methodKey] = async (...args) => {
        const [params] = args;
        if (params.origin === origin) {
          globalThis.$$accountSelectorE2EDAppUpdateHistory.push({
            at: Date.now(),
            params,
          });
        }
        return originalUpdateConnectionSession(...args);
      };
    },
    { origin: simulatedDAppSecondaryOrigin },
  );
  await drainPerfTrace(page, devOnlyPassword);
  await secondaryAccountCards
    .nth(1)
    .locator(visibleTestIDSelector(AccountSelectorTestIDs.dappAccountName))
    .click({ timeout: pageTimeoutMs });
  await getUniqueVisibleByTestID(page, AccountManagerTestIDs.walletList);
  const wallet = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.wallet(secondaryNumOneUpdatedTarget.walletId),
  );
  await wallet.click({ timeout: pageTimeoutMs });
  const account = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.accountItem(secondaryNumOneUpdatedTarget.index),
  );
  await account.click({ timeout: pageTimeoutMs });
  await page.waitForFunction(
    async ({ expectedIndexedAccountId, origin }) => {
      const map =
        await globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.getAccountSelectorMap(
          { sceneUrl: origin },
        );
      const snapshot =
        globalThis.$$appGlobals.$$accountSelectorE2EStateAccessor?.getSnapshot?.(
          {
            num: 1,
            sceneName: 'discover',
            sceneUrl: origin,
          },
        );
      return Boolean(
        map?.[1]?.indexedAccountId === expectedIndexedAccountId &&
        snapshot?.selected?.indexedAccountId === expectedIndexedAccountId &&
        snapshot.active?.ready &&
        snapshot.active.indexedAccountId === expectedIndexedAccountId,
      );
    },
    {
      expectedIndexedAccountId: secondaryNumOneUpdatedTarget.indexedAccountId,
      origin: simulatedDAppSecondaryOrigin,
    },
    { timeout: pageTimeoutMs },
  );
  await page.waitForTimeout(500);
  await page.waitForFunction(
    ({ expectedIndexedAccountId, origin }) =>
      globalThis.$$accountSelectorE2EDAppUpdateHistory?.some(
        ({ params }) =>
          params.origin === origin &&
          params.accountSelectorNum === 1 &&
          params.updatedAccountInfo?.indexedAccountId ===
            expectedIndexedAccountId,
      ),
    {
      expectedIndexedAccountId: secondaryNumOneUpdatedTarget.indexedAccountId,
      origin: simulatedDAppSecondaryOrigin,
    },
    { timeout: pageTimeoutMs },
  );
  const dappUpdateHistory = await page.evaluate(() => {
    const api = globalThis.$$appGlobals.$backgroundApiProxy;
    const methodKey = 'serviceDApp.updateConnectionSession';
    const history = globalThis.$$accountSelectorE2EDAppUpdateHistory;
    api._proxyServiceCache[methodKey] =
      globalThis.$$accountSelectorE2EOriginalDAppUpdate;
    delete globalThis.$$accountSelectorE2EDAppUpdateHistory;
    delete globalThis.$$accountSelectorE2EOriginalDAppUpdate;
    return history;
  });
  assert.equal(
    dappUpdateHistory.length,
    1,
    'One Discover account selection must update one DApp session',
  );
  await assertAccountSelectorStateConsistent(
    page,
    secondaryNumOneUpdatedTarget,
    {
      assertUI: false,
      num: 1,
      sceneName: 'discover',
      sceneUrl: simulatedDAppSecondaryOrigin,
    },
  );
  const selectionTrace = await collectSelectionOperationTrace(
    page,
    devOnlyPassword,
    {
      expectActiveReload: true,
      num: 1,
      reason: 'userSelectAccount',
      sceneName: 'discover',
    },
  );
  assertSelectionOperationBudget(selectionTrace, {
    expectedActiveReloads: 1,
    expectedSelectionUpdates: 1,
    label: 'Discover secondary origin num 1 account selection',
    num: 1,
    reason: 'userSelectAccount',
    sceneName: 'discover',
  });

  const mapsAfterSelection = await Promise.all(
    scenarios.map(({ origin }) =>
      page.evaluate(
        ({ sceneUrl }) =>
          globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.getAccountSelectorMap(
            { sceneUrl },
          ),
        { sceneUrl: origin },
      ),
    ),
  );
  assert.deepEqual(
    [
      selectedAccountIdentity(mapsAfterSelection[0]?.[0]),
      selectedAccountIdentity(mapsAfterSelection[0]?.[1]),
      selectedAccountIdentity(mapsAfterSelection[1]?.[0]),
    ],
    [
      selectedAccountIdentity(mapsBeforeSelection[0]?.[0]),
      selectedAccountIdentity(mapsBeforeSelection[0]?.[1]),
      selectedAccountIdentity(mapsBeforeSelection[1]?.[0]),
    ],
    'Updating one Discover origin/num must not mutate the other three selections',
  );
  assert.equal(
    mapsAfterSelection[1]?.[1]?.indexedAccountId,
    secondaryNumOneUpdatedTarget.indexedAccountId,
    'The selected Discover origin/num must persist its new account',
  );

  await closeDAppConnectionList(page);
  await deleteSimulatedDAppConnection(page, simulatedDAppOrigin);
  await deleteSimulatedDAppConnection(page, simulatedDAppSecondaryOrigin);
  const trace = mergePerfTrace(
    connectionTrace,
    initializationTrace,
    selectionTrace,
  );
  assertTraceHealth({ ...trace, phase: 'dapp-multi-origin' });
  return trace;
}

async function runSimulatedDAppScenario(page, devOnlyPassword, fixture) {
  const homeSelection = await readPersistedSelection(page);
  const target = findFixtureTarget(fixture, homeSelection);
  const connectionTrace = await openAndApproveSimulatedDAppConnection(
    page,
    devOnlyPassword,
    { expectedSelection: target },
  );
  await drainPerfTrace(page, devOnlyPassword);
  await openSimulatedDAppAccountSelector(page);

  const initializationTrace = await collectPerfTraceUntil(
    page,
    devOnlyPassword,
    (events) =>
      events.some(
        (event) =>
          event.event === 'storageInitResult' &&
          event.sceneName === 'discover' &&
          event.outcome !== 'error-finalized',
      ) &&
      events.some(
        (event) =>
          event.event === 'effectsStateObserved' &&
          event.num === 0 &&
          event.sceneName === 'discover' &&
          event.selection?.networkId === 'evm--1' &&
          event.selection?.hasWallet === true,
      ),
  );
  assertTraceHealth({ ...initializationTrace, phase: 'dapp-initialization' });
  await assertAccountSelectorStateConsistent(page, target, {
    sceneName: 'discover',
    sceneUrl: simulatedDAppOrigin,
  });

  await page.evaluate(
    ({ origin }) => {
      const eventBus = globalThis.$$appGlobals.$appEventBus;
      eventBus.emit('DAppNetworkUpdate', {
        networkId: 'evm--137',
        num: 0,
        sceneName: 'discover',
        sceneUrl: `${origin}.wrong`,
      });
      eventBus.emit('DAppNetworkUpdate', {
        networkId: 'evm--137',
        num: 1,
        sceneName: 'discover',
        sceneUrl: origin,
      });
    },
    { origin: simulatedDAppOrigin },
  );
  await page.waitForTimeout(500);
  const ignoredEventTrace = await drainPerfTrace(page, devOnlyPassword);
  assert.deepEqual(
    ignoredEventTrace.events.filter(
      (event) =>
        event.event === 'selectionUpdateRequested' &&
        event.reason === 'dappNetworkEvent',
    ),
    [],
    'Mismatched DApp sceneUrl/num events must not update selection',
  );

  await page.evaluate(
    async ({ origin }) => {
      await globalThis.$$appGlobals.$backgroundApiProxy.serviceDApp.switchConnectedNetwork(
        {
          newNetworkId: 'evm--137',
          oldNetworkId: 'evm--1',
          origin,
          scope: 'ethereum',
        },
      );
    },
    { origin: simulatedDAppOrigin },
  );
  const updateTrace = await collectPerfTraceUntil(
    page,
    devOnlyPassword,
    (events) =>
      events.some(
        (event) =>
          event.event === 'selectionUpdateResult' &&
          event.reason === 'dappNetworkEvent',
      ) &&
      events.some(
        (event) =>
          event.event === 'effectsStateObserved' &&
          event.num === 0 &&
          event.sceneName === 'discover' &&
          event.selection?.networkId === 'evm--137',
      ) &&
      events.some(
        (event) =>
          event.event === 'activeReloadResult' &&
          event.num === 0 &&
          event.sceneName === 'discover',
      ),
  );
  const dappMap = await page.evaluate(
    ({ origin }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.dappConnection.getAccountSelectorMap(
        { sceneUrl: origin },
      ),
    { origin: simulatedDAppOrigin },
  );
  assert.equal(
    dappMap?.[0]?.networkId,
    'evm--137',
    'Simulated DApp connection must persist the switched network',
  );
  const dappRequests = updateTrace.events.filter(
    (event) =>
      event.event === 'selectionUpdateRequested' &&
      event.reason === 'dappNetworkEvent',
  );
  assert.equal(
    dappRequests.length,
    1,
    'A DApp network update must enter selection update exactly once',
  );
  assertSelectionOperationBudget(updateTrace, {
    expectedActiveReloads: 1,
    expectedSelectionUpdates: 1,
    label: 'DApp network selection',
    reason: 'dappNetworkEvent',
    sceneName: 'discover',
  });
  await assertAccountSelectorStateConsistent(page, target, {
    sceneName: 'discover',
    sceneUrl: simulatedDAppOrigin,
  });

  const trace = mergePerfTrace(
    connectionTrace,
    initializationTrace,
    ignoredEventTrace,
    updateTrace,
  );
  assertTraceHealth({ ...trace, phase: 'simulated-dapp' });
  await closeSimulatedDAppAccountSelector(page);
  await deleteSimulatedDAppConnection(page);
  return trace;
}

async function openBulkSendAddressInput(page, target) {
  await switchAppTab(page, 'Home');
  await page.evaluate(
    ({ indexedAccountId }) => {
      globalThis.$$appGlobals.$rootAppNavigation.navigate(
        'main',
        {
          screen: 'Home',
          params: {
            screen: 'TabHomeBulkSendAddressesInput',
            params: {
              accountId: undefined,
              bulkSendMode: 'oneToMany',
              indexedAccountId,
              networkId: 'evm--1',
            },
          },
        },
        { pop: true },
      );
    },
    { indexedAccountId: target.indexedAccountId },
  );
  await page.waitForFunction(
    () => {
      let state =
        globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
      while (state?.routes?.length) {
        const route = state.routes[state.index ?? 0];
        if (!route) break;
        if (route.name === 'TabHomeBulkSendAddressesInput') return true;
        state = route.state;
      }
      return false;
    },
    undefined,
    { timeout: pageTimeoutMs },
  );
  await getUniqueVisibleByTestID(
    page,
    AddressInputTestIDs.accountSelectorButton,
  );
}

async function closeBulkSendAddressInput(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.navigate(
      'main',
      {
        screen: 'Home',
        params: { screen: 'TabHome' },
      },
      { pop: true },
    );
  });
  await page.waitForFunction(
    () => {
      let state =
        globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
      while (state?.routes?.length) {
        const route = state.routes[state.index ?? 0];
        if (!route) break;
        if (route.name === 'TabHome') return true;
        state = route.state;
      }
      return false;
    },
    undefined,
    { timeout: pageTimeoutMs },
  );
  await waitForHomeShell(page);
}

async function openSendAddressInput(page, senderTarget) {
  await page.evaluate(
    async ({ indexedAccountId }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const { accounts } =
        await api.serviceAccount.getAccountsByIndexedAccounts({
          deriveType: 'default',
          indexedAccountIds: [indexedAccountId],
          networkId: 'evm--1',
        });
      const account = accounts[0];
      if (!account?.id) {
        throw new Error(`Missing Send sender account ${indexedAccountId}`);
      }
      const token = await api.serviceToken.getNativeToken({
        accountId: account.id,
        networkId: 'evm--1',
      });
      globalThis.$$appGlobals.$rootAppNavigation.pushModal(
        'SignatureConfirmModal',
        {
          screen: 'TxDataInput',
          params: {
            accountId: account.id,
            isNFT: false,
            networkId: 'evm--1',
            token,
          },
        },
      );
    },
    { indexedAccountId: senderTarget.indexedAccountId },
  );
  await page.waitForFunction(
    () => {
      let state =
        globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
      while (state?.routes?.length) {
        const route = state.routes[state.index ?? 0];
        if (!route) break;
        if (route.name === 'TxDataInput') return true;
        state = route.state;
      }
      return false;
    },
    undefined,
    { timeout: pageTimeoutMs },
  );
  await getUniqueVisibleByTestID(page, SendTestIDs.dataInputPage);
}

async function closeSendFlow(page) {
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pop();
  });
  await waitForNoVisibleTestID(page, SendTestIDs.amountInput);
  await getUniqueVisibleByTestID(page, SendTestIDs.dataInputPage);
  await page.evaluate(() => {
    globalThis.$$appGlobals.$rootAppNavigation.pop();
  });
  await waitForNoVisibleTestID(page, SendTestIDs.dataInputPage);
  await waitForHomeShell(page);
}

async function runSendAddressInputScenario(page, devOnlyPassword, fixture) {
  const senderTarget = {
    fixtureId: fixture.wallets[0].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
    walletId: fixture.wallets[0].walletId,
  };
  const recipientAddress =
    fixture.addressFixtures[fixture.wallets[1].fixtureId][0]['evm--1'].default;
  await selectWalletAccount(page, senderTarget);
  await selectNetwork(page, 'evm--1');
  await assertAccountSelectorStateConsistent(page, senderTarget);
  await drainPerfTrace(page, devOnlyPassword);
  await openSendAddressInput(page, senderTarget);
  const initializationTrace = await drainPerfTrace(page, devOnlyPassword);
  assertTraceHealth({
    ...initializationTrace,
    phase: 'send-address-input-initialization',
  });
  assert.ok(
    initializationTrace.events.some(
      (event) =>
        event.event === 'providerSubtreeCommit' &&
        event.perfDebugName === 'send-address-input' &&
        event.enabledNum?.join(',') === '0',
    ),
    'Send must mount addressInput enabledNum 0',
  );
  const snapshot = await readAccountSelectorStateSnapshot(page, {
    num: 0,
    sceneName: 'addressInput',
    sceneUrl: '',
  });
  assert.equal(
    snapshot?.selected?.indexedAccountId,
    undefined,
    'Send addressInput must not inherit a selected recipient account',
  );

  await getUniqueVisibleByTestID(page, SendTestIDs.recipientInput, {
    timeout: 5000,
  });
  const accountTab = await getUniqueVisibleByTestID(
    page,
    SendTestIDs.recipientQuickSelectAccountTab,
    { timeout: 5000 },
  );
  await accountTab.click({ timeout: pageTimeoutMs });
  const recipient = await getUniqueVisibleByTestID(
    page,
    SendTestIDs.recipientItem(recipientAddress),
  );
  await recipient.click({ timeout: pageTimeoutMs });
  await page.waitForFunction(
    () => {
      let state =
        globalThis.$$appGlobals.$navigationRef?.current?.getRootState();
      while (state?.routes?.length) {
        const route = state.routes[state.index ?? 0];
        if (!route) break;
        if (route.name === 'TxAmountInput') return true;
        state = route.state;
      }
      return false;
    },
    undefined,
    { timeout: pageTimeoutMs },
  );
  await getUniqueVisibleByTestID(page, SendTestIDs.amountInput);
  const selectionTrace = await drainPerfTrace(page, devOnlyPassword);
  await closeSendFlow(page);
  const closeTrace = await drainPerfTrace(page, devOnlyPassword);
  const trace = mergePerfTrace(initializationTrace, selectionTrace, closeTrace);
  assertTraceHealth({ ...trace, phase: 'send-address-input' });
  return trace;
}

async function runBulkSendAccountRemovalScenario(
  page,
  devOnlyPassword,
  fixture,
) {
  const removedTarget = {
    fixtureId: fixture.wallets[1].fixtureId,
    index: 1,
    indexedAccountId: fixture.wallets[1].indexedAccountIds[1],
    walletId: fixture.wallets[1].walletId,
  };
  await selectWalletAccount(page, removedTarget);
  await selectNetwork(page, 'evm--1');
  await assertAccountSelectorStateConsistent(page, removedTarget);
  await drainPerfTrace(page, devOnlyPassword);
  await openBulkSendAddressInput(page, removedTarget);
  const initialTrace = await drainPerfTrace(page, devOnlyPassword);
  assertTraceHealth({
    ...initialTrace,
    phase: 'bulk-send-address-input-initialization',
  });
  assert.ok(
    initialTrace.events.some(
      (event) =>
        event.event === 'providerSubtreeCommit' &&
        event.perfDebugName === 'bulk-send-address-input' &&
        event.enabledNum?.join(',') === '0,1',
    ),
    'BulkSend must mount addressInput enabledNum 0 and 1',
  );
  for (const num of [0, 1]) {
    const snapshot = await readAccountSelectorStateSnapshot(page, {
      num,
      sceneName: 'addressInput',
      sceneUrl: '',
    });
    assert.equal(
      snapshot?.selected?.indexedAccountId,
      undefined,
      `BulkSend addressInput num ${num} must start without an account`,
    );
  }

  await drainPerfTrace(page, devOnlyPassword);
  const selectorButton = await getUniqueVisibleByTestID(
    page,
    AddressInputTestIDs.accountSelectorButton,
  );
  await selectorButton.click({ timeout: pageTimeoutMs });
  await getUniqueVisibleByTestID(page, AccountManagerTestIDs.walletList);
  const wallet = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.wallet(removedTarget.walletId),
  );
  await wallet.click({ timeout: pageTimeoutMs });
  const account = await getUniqueVisibleByTestID(
    page,
    AccountManagerTestIDs.accountItem(removedTarget.index),
  );
  await account.click({ timeout: pageTimeoutMs });
  await assertAccountSelectorStateConsistent(page, removedTarget, {
    assertPersistence: false,
    assertUI: false,
    num: 0,
    sceneName: 'addressInput',
    sceneUrl: '',
  });
  const selectionTrace = await collectSelectionOperationTrace(
    page,
    devOnlyPassword,
    {
      expectActiveReload: true,
      num: 0,
      reason: 'userSelectAccount',
      sceneName: 'addressInput',
    },
  );
  assertSelectionOperationBudget(selectionTrace, {
    expectedActiveReloads: 1,
    expectedSelectionUpdates: 1,
    label: 'BulkSend addressInput account selection',
    num: 0,
    reason: 'userSelectAccount',
    sceneName: 'addressInput',
  });

  await drainPerfTrace(page, devOnlyPassword);
  await page.evaluate(
    async ({ indexedAccountId }) => {
      const serviceAccount =
        globalThis.$$appGlobals.$backgroundApiProxy.serviceAccount;
      const indexedAccount = await serviceAccount.getIndexedAccountSafe({
        id: indexedAccountId,
      });
      if (!indexedAccount) {
        throw new Error(`Missing BulkSend removal account ${indexedAccountId}`);
      }
      await serviceAccount.removeAccount({ indexedAccount });
    },
    { indexedAccountId: removedTarget.indexedAccountId },
  );
  await page.waitForFunction(
    () => {
      const snapshot =
        globalThis.$$appGlobals.$$accountSelectorE2EStateAccessor?.getSnapshot?.(
          {
            num: 0,
            sceneName: 'addressInput',
            sceneUrl: '',
          },
        );
      return Boolean(
        snapshot &&
        !snapshot.selected?.walletId &&
        !snapshot.selected?.indexedAccountId &&
        !snapshot.selected?.othersWalletAccountId &&
        !snapshot.active?.walletId &&
        !snapshot.active?.indexedAccountId,
      );
    },
    undefined,
    { timeout: pageTimeoutMs },
  );
  const removalTrace = await collectSelectionOperationTrace(
    page,
    devOnlyPassword,
    {
      expectActiveReload: true,
      num: 0,
      reason: 'removeAccountSelectionClear',
      sceneName: 'addressInput',
    },
  );
  assertSelectionOperationBudget(removalTrace, {
    expectedActiveReloads: 1,
    expectedSelectionUpdates: 1,
    label: 'BulkSend removed account clearing',
    num: 0,
    reason: 'removeAccountSelectionClear',
    sceneName: 'addressInput',
  });
  assert.ok(
    removalTrace.events.some(
      (event) =>
        event.event === 'autoSelectAccountResult' &&
        event.num === 0 &&
        event.outcome === 'cleared-removed-account' &&
        event.sceneName === 'addressInput',
    ),
    'BulkSend must clear the removed account without choosing a fallback',
  );
  const persistedAddressInput = await readPersistedSelection(
    page,
    'addressInput',
    0,
    '',
  );
  assert.equal(
    persistedAddressInput?.indexedAccountId,
    undefined,
    'BulkSend addressInput must not persist the removed account',
  );
  const numOneSnapshot = await readAccountSelectorStateSnapshot(page, {
    num: 1,
    sceneName: 'addressInput',
    sceneUrl: '',
  });
  assert.equal(
    numOneSnapshot?.selected?.indexedAccountId,
    undefined,
    'Removing num 0 must leave BulkSend addressInput num 1 empty',
  );

  await closeBulkSendAddressInput(page);
  await page.waitForTimeout(1000);
  const closeTrace = await drainPerfTrace(page, devOnlyPassword);
  const trace = mergePerfTrace(
    initialTrace,
    selectionTrace,
    removalTrace,
    closeTrace,
  );
  assertTraceHealth({ ...trace, phase: 'bulk-send-account-removal' });
  return trace;
}

async function removeSelectedAccountAndWaitForFallback(page, fixture) {
  const selectedTarget = {
    index: 1,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[1],
    walletId: fixture.wallets[0].walletId,
  };
  log('auto-select: select account scheduled for removal');
  await selectWalletAccount(page, selectedTarget);
  log('auto-select: remove selected indexed account');
  await page.evaluate(
    async ({ indexedAccountId }) => {
      const api = globalThis.$$appGlobals.$backgroundApiProxy;
      const indexedAccount = await api.serviceAccount.getIndexedAccountSafe({
        id: indexedAccountId,
      });
      await api.serviceAccount.removeAccount({ indexedAccount });
    },
    { indexedAccountId: selectedTarget.indexedAccountId },
  );
  log('auto-select: wait for account fallback');
  await page.waitForFunction(
    async ({ removedId }) => {
      const selected =
        await globalThis.$$appGlobals.$backgroundApiProxy.simpleDb.accountSelector.getSelectedAccount(
          { num: 0, sceneName: 'home' },
        );
      return Boolean(
        selected?.indexedAccountId && selected.indexedAccountId !== removedId,
      );
    },
    { removedId: selectedTarget.indexedAccountId },
    { timeout: pageTimeoutMs },
  );
  const fallbackTarget = {
    fixtureId: fixture.wallets[0].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
    walletId: fixture.wallets[0].walletId,
  };
  await waitForPersistedSelection(page, {
    indexedAccountId: fallbackTarget.indexedAccountId,
    walletId: fallbackTarget.walletId,
  });
  await assertAccountSelectorStateConsistent(page, fallbackTarget);
  log('auto-select: account fallback completed');
}

async function removeSelectedWalletAndWaitForFallback(
  page,
  fixture,
  devOnlyPassword,
) {
  const removedWallet = fixture.wallets[1];
  log('auto-select: select wallet scheduled for removal');
  await selectWalletAccount(page, {
    index: 0,
    indexedAccountId: removedWallet.indexedAccountIds[0],
    walletId: removedWallet.walletId,
  });
  log('auto-select: remove isolated E2E wallet');
  await page.evaluate(
    ({ password, walletId }) =>
      globalThis.$$appGlobals.$backgroundApiProxy.serviceE2E.removeAccountSelectorE2EWallet(
        {
          $$devOnlyPassword: password,
          walletId,
        },
      ),
    { password: devOnlyPassword, walletId: removedWallet.walletId },
  );
  log('auto-select: wait for wallet fallback');
  const fallbackTarget = {
    fixtureId: fixture.wallets[0].fixtureId,
    index: 0,
    indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
    walletId: fixture.wallets[0].walletId,
  };
  await waitForPersistedSelection(page, {
    indexedAccountId: fallbackTarget.indexedAccountId,
    walletId: fallbackTarget.walletId,
  });
  await assertAccountSelectorStateConsistent(page, fallbackTarget);
  log('auto-select: wallet fallback completed');
}

async function runStressInteractions(page, fixture, devOnlyPassword) {
  const targets = [
    {
      fixtureId: fixture.wallets[0].fixtureId,
      index: 0,
      indexedAccountId: fixture.wallets[0].indexedAccountIds[0],
      walletId: fixture.wallets[0].walletId,
    },
    {
      fixtureId: fixture.wallets[1].fixtureId,
      index: 1,
      indexedAccountId: fixture.wallets[1].indexedAccountIds[1],
      walletId: fixture.wallets[1].walletId,
    },
    {
      fixtureId: fixture.wallets[0].fixtureId,
      index: 1,
      indexedAccountId: fixture.wallets[0].indexedAccountIds[1],
      walletId: fixture.wallets[0].walletId,
    },
    {
      fixtureId: fixture.wallets[1].fixtureId,
      index: 0,
      indexedAccountId: fixture.wallets[1].indexedAccountIds[0],
      walletId: fixture.wallets[1].walletId,
    },
  ];

  const traces = [];
  for (let index = 0; index < iterations; index += 1) {
    const target = targets[index % targets.length];
    const previousAccount = await readPersistedSelection(page);
    await drainPerfTrace(page, devOnlyPassword);
    await selectWalletAccount(page, target);
    await assertAccountSelectorStateConsistent(page, target);
    const accountChanged =
      previousAccount?.walletId !== target.walletId ||
      previousAccount?.indexedAccountId !== target.indexedAccountId;
    const accountTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: accountChanged,
        reason: 'userSelectAccount',
      },
    );
    assertSelectionOperationBudget(accountTrace, {
      expectedActiveReloads: accountChanged ? 1 : 0,
      expectedSelectionUpdates: accountChanged ? 1 : 0,
      label: `account selection ${index + 1}`,
      reason: 'userSelectAccount',
    });
    const walletChanged = previousAccount?.walletId !== target.walletId;
    assertSelectionOperationBudget(accountTrace, {
      expectedActiveReloads: 0,
      expectedSelectionUpdates: walletChanged ? 1 : 0,
      label: `wallet focus selection ${index + 1}`,
      reason: 'userSelectWallet',
    });
    traces.push(accountTrace);
    await drainPerfTrace(page, devOnlyPassword);
    await selectWalletAccount(page, target);
    await assertAccountSelectorStateConsistent(page, target);
    const noOpAccountTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: false,
        reason: 'userSelectAccount',
      },
    );
    assertSelectionOperationBudget(noOpAccountTrace, {
      expectedActiveReloads: 0,
      expectedSelectionUpdates: 0,
      label: `no-op account selection ${index + 1}`,
      reason: 'userSelectAccount',
    });
    assertSelectionOperationBudget(noOpAccountTrace, {
      expectedActiveReloads: 0,
      expectedSelectionUpdates: 0,
      label: `no-op wallet focus selection ${index + 1}`,
      reason: 'userSelectWallet',
    });
    traces.push(noOpAccountTrace);
    log(
      `stress: verify DApp connection after account switch ${index + 1}/${iterations}`,
    );
    traces.push(
      await openAndApproveSimulatedDAppConnection(page, devOnlyPassword, {
        assertInitializationDetails: false,
        cleanupConnection: true,
        expectedNetworkId: null,
        expectedSelection: target,
        writeArtifacts: false,
      }),
    );
    const networkId = expectedNetworks[index % expectedNetworks.length];
    const previousNetwork = await readPersistedSelection(page);
    await drainPerfTrace(page, devOnlyPassword);
    await selectNetwork(page, networkId);
    await assertAccountSelectorStateConsistent(page, target);
    const networkChanged = previousNetwork?.networkId !== networkId;
    const networkTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: networkChanged,
        reason: 'userSelectNetwork',
      },
    );
    assertSelectionOperationBudget(networkTrace, {
      expectedActiveReloads: networkChanged ? 1 : 0,
      expectedSelectionUpdates: networkChanged ? 1 : 0,
      label: `network selection ${index + 1}/${networkId}`,
      reason: 'userSelectNetwork',
    });
    traces.push(networkTrace);
    await drainPerfTrace(page, devOnlyPassword);
    await selectNetwork(page, networkId);
    await assertAccountSelectorStateConsistent(page, target);
    const noOpNetworkTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: false,
        reason: 'userSelectNetwork',
      },
    );
    assertSelectionOperationBudget(noOpNetworkTrace, {
      expectedActiveReloads: 0,
      expectedSelectionUpdates: 0,
      label: `no-op network selection ${index + 1}/${networkId}`,
      reason: 'userSelectNetwork',
    });
    traces.push(noOpNetworkTrace);
    traces.push(
      await verifyAllNetworkDeriveAddresses(
        page,
        target,
        networkId,
        devOnlyPassword,
      ),
    );
    if (index % 3 === 2) {
      await assertSwapConsumer(page, target);
    }
  }
  return mergePerfTrace(...traces);
}

async function closeResidualE2EBrowserContexts(browser, phase) {
  const contexts = browser.contexts();
  const tabCount = contexts.reduce(
    (count, context) => count + context.pages().length,
    0,
  );
  if (contexts.length || tabCount) {
    log(
      `${phase}: close ${tabCount} residual tab(s) in ${contexts.length} E2E context(s)`,
    );
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
  assert.equal(
    browser.contexts().length,
    0,
    `${phase}: residual E2E browser contexts must be empty`,
  );
  log(`${phase}: verified 0 residual E2E tabs`);
}

async function runCycle({ browser, cycle, rendererUrl }) {
  const devOnlyPassword = getDevOnlyPassword();
  await closeResidualE2EBrowserContexts(browser, `cycle#${cycle} preflight`);
  const context = await browser.newContext();
  assert.equal(
    context.pages().length,
    0,
    `cycle#${cycle}: a new E2E context must start without tabs`,
  );
  await context.addInitScript(
    ({ key }) => {
      globalThis.localStorage.setItem(key, 'wallet');
    },
    { key: walletModeStorageKey },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(pageTimeoutMs);

  const pageErrors = [];
  const cdpExceptions = [];
  page.on('pageerror', (error) =>
    pageErrors.push({
      message: error.message,
      name: error.name,
      stack: error.stack,
    }),
  );
  const cdp = await context.newCDPSession(page);
  await Promise.all([cdp.send('Runtime.enable'), cdp.send('Debugger.enable')]);
  await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    cdpExceptions.push({
      description: exceptionDetails.exception?.description,
      exceptionId: exceptionDetails.exceptionId,
      frames: collectCdpStackFrames(exceptionDetails.stackTrace),
      lineNumber: exceptionDetails.lineNumber,
      text: exceptionDetails.text,
      url: exceptionDetails.url,
    });
  });

  try {
    await page.goto(rendererUrl, {
      timeout: pageTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);
    await configurePerfTrace(page, devOnlyPassword);
    await drainPerfTrace(page, devOnlyPassword);

    log(`cycle#${cycle}: create isolated HD wallet fixture`);
    const fixture = await createFixture(page, devOnlyPassword);
    assert.deepEqual(
      fixture.addressFixtures,
      expectedAccountAddressFixtures,
      'Deterministic wallet addresses must match the golden vectors',
    );
    await waitForPersistedSelection(page, {
      walletId: fixture.wallets[0].walletId,
    });
    await page.waitForTimeout(500);

    log(`cycle#${cycle}: reload and verify atom/storage initialization`);
    await page.goto(rendererUrl, {
      timeout: pageTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);
    await waitForHomeShell(page);
    const initTrace = await collectPerfTraceUntil(
      page,
      devOnlyPassword,
      (events) => events.some((event) => event.event === 'storageInitResult'),
    );
    assertTraceHealth({ ...initTrace, phase: 'initialization' });
    assert.ok(
      initTrace.events.some((event) => event.event === 'storageInitResult'),
      'Initialization trace must contain storageInitResult',
    );
    const restoredSelection = await readPersistedSelection(page);
    const restoredTarget = findFixtureTarget(fixture, restoredSelection);
    await assertAccountSelectorStateConsistent(page, restoredTarget);

    log(`cycle#${cycle}: verify Send address input account selection`);
    const sendAddressInputTrace = await runSendAddressInputScenario(
      page,
      devOnlyPassword,
      fixture,
    );

    log(`cycle#${cycle}: verify Perps account synchronization`);
    const perpsScenarioTrace = await runPerpsAccountSyncScenario(
      page,
      devOnlyPassword,
      fixture,
    );
    await page.goto(rendererUrl, {
      timeout: pageTimeoutMs,
      waitUntil: 'domcontentloaded',
    });
    await waitForAppReady(page);
    await waitForHomeShell(page);
    await configurePerfTrace(page, devOnlyPassword);
    const perpsResetTrace = await collectPerfTraceUntil(
      page,
      devOnlyPassword,
      (events) => events.some((event) => event.event === 'storageInitResult'),
    );
    const postPerpsSelection = await readPersistedSelection(page);
    await assertAccountSelectorStateConsistent(
      page,
      findFixtureTarget(fixture, postPerpsSelection),
    );
    const perpsTrace = perpsScenarioTrace;
    log(`cycle#${cycle}: verify Swap multi-num and custom-network refresh`);
    const multiNumResult = await runMultiNumAndCustomNetworkScenario(
      page,
      devOnlyPassword,
      cycle,
      fixture,
    );
    log(
      `cycle#${cycle}: verify simulated DApp connection modal and Discover network update`,
    );
    const dappTrace = await runSimulatedDAppScenario(
      page,
      devOnlyPassword,
      fixture,
    );
    log(`cycle#${cycle}: verify Discover multi-origin and multi-num isolation`);
    const multiOriginDAppTrace = await runMultiOriginDAppScenario(
      page,
      devOnlyPassword,
      fixture,
    );
    log(
      `cycle#${cycle}: run ${iterations} wallet/account/network/derive iterations`,
    );
    const repeatedDAppTrace = await runStressInteractions(
      page,
      fixture,
      devOnlyPassword,
    );
    log(`cycle#${cycle}: run latest-wins account/network/derive bursts`);
    await drainPerfTrace(page, devOnlyPassword);
    await runRapidSelectionBursts(page, fixture);
    await page.waitForTimeout(1000);
    const burstTrace = await drainPerfTrace(page, devOnlyPassword);
    assertLatestWinsBurstBudget(burstTrace);
    const stressTrace = mergePerfTrace(repeatedDAppTrace, burstTrace);
    assertTraceHealth({ ...stressTrace, phase: 'stress' });

    log(`cycle#${cycle}: verify BulkSend account removal semantics`);
    const bulkSendRemovalTrace = await runBulkSendAccountRemovalScenario(
      page,
      devOnlyPassword,
      fixture,
    );

    log(`cycle#${cycle}: verify account and wallet removal auto-selection`);
    await removeSelectedAccountAndWaitForFallback(page, fixture);
    const accountRemovalTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: true,
        reason: 'autoSelectNextAccount',
      },
    );
    assertSelectionOperationBudget(accountRemovalTrace, {
      expectedActiveReloads: 1,
      expectedSelectionUpdates: 1,
      label: 'selected account removal fallback',
      reason: 'autoSelectNextAccount',
    });
    await removeSelectedWalletAndWaitForFallback(
      page,
      fixture,
      devOnlyPassword,
    );
    const walletRemovalTrace = await collectSelectionOperationTrace(
      page,
      devOnlyPassword,
      {
        expectActiveReload: true,
        reason: 'autoSelectNextAccount',
      },
    );
    assertSelectionOperationBudget(walletRemovalTrace, {
      expectedActiveReloads: 1,
      expectedSelectionUpdates: 1,
      label: 'selected wallet removal fallback',
      reason: 'autoSelectNextAccount',
    });
    await page.waitForTimeout(2300);
    const autoSelectTrace = mergePerfTrace(
      accountRemovalTrace,
      walletRemovalTrace,
      await drainPerfTrace(page, devOnlyPassword),
    );
    assertTraceHealth({ ...autoSelectTrace, phase: 'auto-select' });
    assert.ok(
      autoSelectTrace.events.some(
        (event) => event.event === 'autoSelectAccountResult',
      ),
      'Removal flow must produce autoSelectAccountResult',
    );
    assert.ok(
      autoSelectTrace.events.some(
        (event) =>
          event.event === 'autoSelectAccountResult' &&
          event.source === 'wallet-update',
      ),
      'Wallet removal must complete wallet-update auto-selection',
    );

    const preReloadEvents = [
      ...initTrace.events,
      ...sendAddressInputTrace.events,
      ...perpsTrace.events,
    ];
    assertTraceRequestResultPairs(preReloadEvents);
    assertStaleReloadPostProcessPairs(preReloadEvents);
    const preReloadSummary = buildTraceSummary(preReloadEvents);
    assert.deepEqual(
      preReloadSummary.fanout.selectionTransitions.duplicateConsumers,
      [],
      'A pre-reload selection transition must not commit twice in the same consumer',
    );
    assert.deepEqual(
      preReloadSummary.fanout.activeReloads.duplicateConsumers,
      [],
      'A pre-reload active reload must not commit twice in the same consumer',
    );

    const allEvents = [
      ...perpsResetTrace.events,
      ...multiNumResult.trace.events,
      ...dappTrace.events,
      ...multiOriginDAppTrace.events,
      ...stressTrace.events,
      ...bulkSendRemovalTrace.events,
      ...autoSelectTrace.events,
    ];
    assertTraceRequestResultPairs(allEvents);
    assertStaleReloadPostProcessPairs(allEvents);
    const summary = buildTraceSummary(allEvents);
    const performanceBudgets = evaluatePerformanceBudgets(summary);
    assert.deepEqual(
      summary.fanout.selectionTransitions.duplicateConsumers,
      [],
      'A selection transition must not commit twice in the same consumer',
    );
    assert.deepEqual(
      summary.fanout.activeReloads.duplicateConsumers,
      [],
      'An active reload must not commit twice in the same consumer',
    );
    const report = {
      cycle,
      cdpExceptionCount: cdpExceptions.length,
      cdpExceptions,
      iterations,
      pageErrorCount: pageErrors.length,
      pageErrors,
      phaseSummaries: {
        autoSelect: buildTraceSummary(autoSelectTrace.events),
        bulkSendRemoval: buildTraceSummary(bulkSendRemovalTrace.events),
        dapp: buildTraceSummary(dappTrace.events),
        dappMultiOrigin: buildTraceSummary(multiOriginDAppTrace.events),
        initialization: buildTraceSummary(initTrace.events),
        multiNumCustomNetwork: buildTraceSummary(multiNumResult.trace.events),
        perps: buildTraceSummary(perpsTrace.events),
        postPerpsReset: buildTraceSummary(perpsResetTrace.events),
        sendAddressInput: buildTraceSummary(sendAddressInputTrace.events),
        stress: buildTraceSummary(stressTrace.events),
      },
      performanceBudgets,
      summary,
    };
    fs.writeFileSync(
      path.join(artifactDir, `cycle-${cycle}-summary.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(artifactDir, `cycle-${cycle}-trace.json`),
      `${JSON.stringify(
        {
          phases: {
            autoSelect: autoSelectTrace,
            bulkSendRemoval: bulkSendRemovalTrace,
            dapp: dappTrace,
            dappMultiOrigin: multiOriginDAppTrace,
            initialization: initTrace,
            multiNumCustomNetwork: multiNumResult.trace,
            perps: perpsTrace,
            postPerpsReset: perpsResetTrace,
            sendAddressInput: sendAddressInputTrace,
            stress: stressTrace,
          },
        },
        null,
        2,
      )}\n`,
    );
    assertPerformanceBudgets(performanceBudgets);
    assert.deepEqual(pageErrors, [], 'Web page emitted uncaught errors');
    assert.deepEqual(
      cdpExceptions,
      [],
      'CDP Runtime emitted uncaught exceptions',
    );
    log(
      `cycle#${cycle}: passed (${summary.totalEvents} trace events, ` +
        `${summary.providerRenders.commitCount} provider commits)`,
    );
    return report;
  } catch (error) {
    const screenshotPath = path.join(artifactDir, `cycle-${cycle}-failure.png`);
    fs.writeFileSync(
      path.join(artifactDir, `cycle-${cycle}-exceptions.json`),
      `${JSON.stringify({ cdpExceptions, pageErrors }, null, 2)}\n`,
    );
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => {});
    log(`cycle#${cycle}: failure screenshot ${screenshotPath}`);
    throw error;
  } finally {
    await context.close().catch(() => {});
    assert.equal(
      browser.contexts().length,
      0,
      `cycle#${cycle}: E2E context cleanup left residual tabs`,
    );
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const { child: rendererProcess, rendererUrl } = await startWebRenderer();
  let browser;
  let cleanupPromise;
  const cleanup = () => {
    cleanupPromise ||= (async () => {
      if (browser) {
        await closeResidualE2EBrowserContexts(browser, 'shutdown').catch(
          () => {},
        );
        await browser.close().catch(() => {});
      }
      await stopProcess(rendererProcess);
    })();
    return cleanupPromise;
  };
  const handleSignal = (signal) => {
    log(`${signal}: clean E2E tabs before exit`);
    void cleanup().finally(() => {
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  };
  const handleSigInt = () => handleSignal('SIGINT');
  const handleSigTerm = () => handleSignal('SIGTERM');
  process.once('SIGINT', handleSigInt);
  process.once('SIGTERM', handleSigTerm);
  try {
    browser = await launchBrowser();
    await closeResidualE2EBrowserContexts(browser, 'startup preflight');
    if (configuredCycles === 0) {
      for (let cycle = 1; ; cycle += 1) {
        await runCycle({ browser, cycle, rendererUrl });
      }
    } else {
      for (let cycle = 1; cycle <= configuredCycles; cycle += 1) {
        await runCycle({ browser, cycle, rendererUrl });
      }
    }
  } finally {
    await cleanup();
    process.off('SIGINT', handleSigInt);
    process.off('SIGTERM', handleSigTerm);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
