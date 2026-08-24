const assert = require('node:assert/strict');
const test = require('node:test');

const {
  diffResourceSnapshots,
  resolveFixtureScale,
  summarize,
  summarizeIterationDiagnostics,
} = require('./render-commit-baseline.e2e');

test('resolveFixtureScale supports larger account fixtures with bounded wallets', () => {
  assert.deepEqual(
    resolveFixtureScale({ accountsPerWallet: '10', walletCount: '2' }),
    { accountsPerWallet: 10, walletCount: 2 },
  );
  assert.throws(
    () => resolveFixtureScale({ accountsPerWallet: '1', walletCount: '2' }),
    /accountsPerWallet/,
  );
  assert.throws(
    () => resolveFixtureScale({ accountsPerWallet: '2', walletCount: '4' }),
    /walletCount/,
  );
});

test('diffResourceSnapshots reports only retained resource growth', () => {
  assert.deepEqual(
    diffResourceSnapshots(
      {
        documents: 3,
        domNodes: 100,
        eventListeners: 40,
        jsHeapUsedBytes: 10_000,
      },
      {
        documents: 2,
        domNodes: 112,
        eventListeners: 45,
        jsHeapUsedBytes: 9000,
      },
    ),
    {
      retainedDocuments: 0,
      retainedDomNodes: 12,
      retainedEventListeners: 5,
      retainedJsHeapBytes: 0,
    },
  );
});

test('summarize uses the conventional median for an even sample count', () => {
  assert.deepEqual(
    summarize([1, 1, 1, 114, 235, 915, 1149, 1149, 1376, 2056]),
    {
      max: 2056,
      median: 575,
      min: 1,
    },
  );
});

test('summarize preserves the middle sample for an odd sample count', () => {
  assert.deepEqual(summarize([9, 3, 5]), {
    max: 9,
    median: 5,
    min: 3,
  });
});

test('summarizeIterationDiagnostics keeps per-emit reload count and duration distributions', () => {
  assert.deepEqual(
    summarizeIterationDiagnostics([
      {
        reloadDurationMaxMs: 7,
        reloadDurationTotalMs: 10,
        reloadsCompleted: 2,
        reloadsFailed: 0,
        reloadsStarted: 2,
      },
      {
        reloadDurationMaxMs: 4,
        reloadDurationTotalMs: 4,
        reloadsCompleted: 1,
        reloadsFailed: 0,
        reloadsStarted: 1,
      },
      {
        reloadDurationMaxMs: 6,
        reloadDurationTotalMs: 6,
        reloadsCompleted: 1,
        reloadsFailed: 0,
        reloadsStarted: 1,
      },
    ]),
    {
      reloadDurationMaxMs: { max: 7, median: 6, min: 4 },
      reloadDurationTotalMs: { max: 10, median: 6, min: 4 },
      reloadsCompleted: { max: 2, median: 1, min: 1 },
      reloadsFailed: { max: 0, median: 0, min: 0 },
      reloadsStarted: { max: 2, median: 1, min: 1 },
    },
  );
});
