const assert = require('node:assert/strict');
const test = require('node:test');

const { evaluateRegressionGate } = require('./render-baseline-compare.e2e');

function buildChurnPhase({
  reloadDurationTotalMs = 10,
  reloadsStarted = 1,
  renderedComponents = 10,
} = {}) {
  return {
    actualDurationAvailable: true,
    actualDurationMs: { median: 5 },
    commits: { median: 2 },
    diagnostics: {
      reloadDurationTotalMs: { median: reloadDurationTotalMs },
      reloadsStarted: { median: reloadsStarted },
    },
    phase: 'background-churn',
    renderedComponents: { median: renderedComponents },
    wallMs: { median: 900 },
  };
}

function buildRetentionPhase({ retainedEventListeners = 0 } = {}) {
  return {
    actualDurationAvailable: true,
    actualDurationMs: { median: 5 },
    commits: { median: 2 },
    diagnostics: {
      retainedDocuments: { median: 0 },
      retainedDomNodes: { median: 0 },
      retainedEventListeners: { median: retainedEventListeners },
      retainedJsHeapBytes: { median: 0 },
    },
    phase: 'selector-retention',
    renderedComponents: { median: 10 },
    wallMs: { median: 900 },
  };
}

test('regression gate rejects redundant reload fan-out even when rendering improves', () => {
  const verdict = evaluateRegressionGate(
    [buildChurnPhase()],
    [buildChurnPhase({ reloadsStarted: 2, renderedComponents: 1 })],
    1.3,
  );

  assert.equal(verdict.pass, false);
  assert.match(verdict.failures.join('\n'), /reloadsStarted/);
});

test('regression gate warns when reload duration regresses', () => {
  const verdict = evaluateRegressionGate(
    [buildChurnPhase()],
    [buildChurnPhase({ reloadDurationTotalMs: 20 })],
    1.3,
  );

  assert.equal(verdict.pass, true);
  assert.match(verdict.warnings.join('\n'), /reloadDurationTotalMs/);
});

test('regression gate warns when selector cycles retain event listeners', () => {
  const verdict = evaluateRegressionGate(
    [buildRetentionPhase()],
    [buildRetentionPhase({ retainedEventListeners: 1 })],
    1.3,
  );

  assert.equal(verdict.pass, true);
  assert.match(verdict.warnings.join('\n'), /retainedEventListeners/);
});
