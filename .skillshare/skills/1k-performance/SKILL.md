---
name: 1k-performance
description: Performance optimization for React/React Native — re-renders, memoization, FlashList, memory leaks, and bundle size.
allowed-tools: Read, Grep, Glob
---

# OneKey Performance Optimization

Performance optimization patterns and best practices for React/React Native applications in the OneKey monorepo.

## Quick Reference

| Category | Key Optimization | When to Use |
|----------|------------------|-------------|
| **Concurrent Requests** | Limit to 3-5, use `executeBatched` | Multiple API calls, network-heavy operations |
| **Bridge Optimization** | Minimize crossings, batch data | React Native bridge overhead, iOS/Android |
| **List Rendering** | FlashList, windowSize={5}, content-visibility | Lists with 100+ items |
| **Memoization** | memo, useMemo, useCallback | Expensive computations, prevent re-renders |
| **Heavy Operations** | InteractionManager, setTimeout | UI blocking operations |

## Account Selector Render Baseline

Use the repository's cross-branch A/B harness when changing Account Selector
rendering, selection synchronization, or related provider/effect behavior:

```bash
yarn test:e2e:web:render-baseline:compare
```

The command compares a pinned `x` baseline commit with the current committed
`HEAD`, runs both measurements back-to-back, and applies the render regression
gate. The default gate fails when the candidate median for rendered components
or React commits in any measured phase exceeds the same-run baseline by more
than `1.3x`. Duration and wall-clock metrics are warnings because they are more
sensitive to machine noise.

Before running:

- Commit the candidate changes. A dirty worktree is reported but uncommitted
  changes are intentionally excluded from the measurement.
- Keep the machine otherwise idle so the two back-to-back samples remain
  comparable.
- Allow enough time and disk space for the disposable baseline/candidate
  clones and their dependencies.

Primary files:

- `apps/web/e2e/render-baseline-compare.e2e.js`: A/B driver, pinned baseline,
  clone preparation, comparison tables, and regression gate.
- `apps/web/e2e/render-commit-baseline.e2e.js`: browser measurement harness and
  per-phase React render metrics.
- `apps/web/e2e/render-baselines/README.md`: recorded baselines, methodology,
  interpretation, environment knobs, and re-pinning policy.

Results and per-run logs are written under `.tmp/render-baseline/`. Prefer the
one-command comparison over running the measurement harness directly when the
goal is to decide whether a candidate regressed against the recorded baseline.

## Critical Performance Rules

### ❌ FORBIDDEN: Too Many Concurrent Requests

```typescript
// ❌ BAD - Can freeze UI with 15+ requests
const requests = items.map(item => fetchData(item));
await Promise.all(requests);
```

### ✅ CORRECT: Batched Execution with Concurrency Limit

```typescript
async function executeBatched<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = 3,
): Promise<Array<PromiseSettledResult<T>>> {
  const results: Array<PromiseSettledResult<T>> = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((task) => task()),
    );
    results.push(...batchResults);
  }
  return results;
}

const tasks = items.map(item => () => fetchData(item));
await executeBatched(tasks, 3); // Max 3 concurrent
```

## 🚨 Built-in Optimizations

**Already Optimized - NO ACTION NEEDED:**

| Component | Optimization | Details |
|-----------|--------------|---------|
| `ListView` | `windowSize={5}` | Auto-limits visible items |
| `Tabs` | `contentVisibility: 'hidden'` | Hides inactive tabs |
| `Dialog` | `contentVisibility: 'hidden'` | Hides when closed |

## Detailed Guide

For comprehensive performance optimization strategies, see [performance.md](references/rules/performance.md).

Topics covered:
- Concurrent request control
- React Native bridge optimization
- Heavy operations offloading
- List rendering (windowSize, FlashList, content-visibility)
- Memoization & callbacks
- State updates optimization
- Image optimization
- Async operations & race conditions
- Real-world iOS AppHang case study

## Related Skills

- `/1k-coding-patterns` - General coding patterns and conventions
- `/1k-sentry` - Sentry error analysis (includes performance issues)
