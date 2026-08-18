/** @jest-environment jsdom */

import { renderHook } from '@testing-library/react';

import { OneKeyLocalError } from '@onekeyhq/shared/src/errors';

import { useAccountSelectorAvailableNetworks } from './useAccountSelectorAvailableNetworks';

const mockGetAllNetworkIds: jest.MockedFunction<
  () => Promise<{ networkIds: string[] }>
> = jest.fn();
let capturedLoader: (() => Promise<string[]>) | undefined;

jest.mock('@onekeyhq/shared/src/eventBus/appEventBus', () => ({
  EAppEventBusNames: { AddedCustomNetwork: 'AddedCustomNetwork' },
  appEventBus: { off: jest.fn(), on: jest.fn() },
}));

jest.mock('@onekeyhq/shared/src/logger/logger', () => {
  const noopLogger: unknown = new Proxy(jest.fn(), {
    apply: () => undefined,
    get: () => noopLogger,
  });
  return { defaultLogger: noopLogger };
});

jest.mock('../../../background/instance/backgroundApiProxy', () => ({
  __esModule: true,
  default: {
    serviceNetwork: {
      getAllNetworkIds: () => mockGetAllNetworkIds(),
    },
  },
}));

jest.mock('../../../hooks/usePromiseResult', () => ({
  usePromiseResult: (fn: () => Promise<string[]>) => {
    capturedLoader = fn;
    return { result: [], run: jest.fn() };
  },
}));

jest.mock('../../../states/jotai/contexts/accountSelector', () => ({
  useAccountSelectorAvailableNetworksByNum: () => undefined,
  useAccountSelectorSceneInfo: () => ({ sceneName: 'home' }),
}));

jest.mock('../../../states/jotai/contexts/accountSelector/perfDebug', () => ({
  getAccountSelectorPerfTimestamp: () => 0,
  getNextAccountSelectorPerfOperationId: () => 1,
  isAccountSelectorPerfDebugEnabled: () => false,
}));

describe('useAccountSelectorAvailableNetworks all network ids cache', () => {
  // The module level cache is shared across renders, so a single mount walks
  // through both the fresh window and the expiry in one sequence.
  it('serves a fresh cache and reloads once it outlives its max age', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockGetAllNetworkIds.mockResolvedValue({ networkIds: ['evm--1'] });

    renderHook(() => useAccountSelectorAvailableNetworks({ num: 0 }));
    const loader = capturedLoader;
    if (!loader) {
      throw new OneKeyLocalError('network ids loader was not captured');
    }

    await loader();
    expect(mockGetAllNetworkIds).toHaveBeenCalledTimes(1);

    now += 60 * 1000;
    await loader();
    expect(mockGetAllNetworkIds).toHaveBeenCalledTimes(1);

    now += 5 * 60 * 1000;
    await loader();
    expect(mockGetAllNetworkIds).toHaveBeenCalledTimes(2);

    jest.restoreAllMocks();
  });
});
