/** @jest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';

import { useAutoSelectDeriveType } from './useAutoSelectDeriveType';

type IGlobalSyncResult = {
  globalDeriveType: string | undefined;
  selectionResult: { outcome: string } | undefined;
};

const mockSyncLocalDeriveTypeFromGlobal: jest.MockedFunction<
  () => Promise<IGlobalSyncResult>
> = jest.fn();
const mockGetSelectedAccount: jest.MockedFunction<
  () => { deriveType: string | undefined; networkId: string | undefined }
> = jest.fn();
const mockUpdateSelectedAccountDeriveType: jest.MockedFunction<
  (params: unknown) => Promise<{ outcome: string }>
> = jest.fn();
const mockGetDeriveInfoItemsOfNetwork: jest.MockedFunction<
  () => Promise<{ value: string }[]>
> = jest.fn();
const mockGetDeriveTypeOrFallbackToGlobal: jest.MockedFunction<
  () => Promise<string | undefined>
> = jest.fn();

jest.mock('@onekeyhq/shared/src/eventBus/appEventBus', () => ({
  EAppEventBusNames: { GlobalDeriveTypeUpdate: 'GlobalDeriveTypeUpdate' },
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
      getDeriveInfoItemsOfNetwork: () => mockGetDeriveInfoItemsOfNetwork(),
      getDeriveTypeOrFallbackToGlobal: () =>
        mockGetDeriveTypeOrFallbackToGlobal(),
    },
  },
}));

jest.mock('../../../states/jotai/contexts/accountSelector', () => ({
  useAccountSelectorSceneInfo: () => ({
    sceneName: 'home',
    sceneUrl: undefined,
  }),
  useAccountSelectorStorageReadyAtom: () => [true],
  useActiveAccount: () => ({
    activeAccount: {
      deriveInfo: undefined,
      isOthersWallet: false,
      network: { id: 'evm--1' },
    },
  }),
}));

jest.mock('../../../states/jotai/contexts/accountSelector/actions', () => ({
  useAccountSelectorActions: () => ({
    current: {
      getSelectedAccount: () => mockGetSelectedAccount(),
      syncLocalDeriveTypeFromGlobal: () => mockSyncLocalDeriveTypeFromGlobal(),
      updateSelectedAccountDeriveType: (params: unknown) =>
        mockUpdateSelectedAccountDeriveType(params),
    },
  }),
}));

jest.mock('../../../states/jotai/contexts/accountSelector/perfDebug', () => ({
  getAccountSelectorPerfTimestamp: () => 0,
  getNextAccountSelectorPerfOperationId: () => 1,
  isAccountSelectorPerfDebugEnabled: () => false,
}));

describe('useAutoSelectDeriveType global sync outcome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDeriveInfoItemsOfNetwork.mockResolvedValue([{ value: 'default' }]);
    mockGetDeriveTypeOrFallbackToGlobal.mockResolvedValue('default');
    mockUpdateSelectedAccountDeriveType.mockResolvedValue({
      outcome: 'commit',
    });
  });

  it('falls back when the global sync went stale and no derive type landed', async () => {
    mockSyncLocalDeriveTypeFromGlobal.mockResolvedValue({
      globalDeriveType: 'default',
      selectionResult: { outcome: 'stale' },
    });
    mockGetSelectedAccount.mockReturnValue({
      deriveType: undefined,
      networkId: 'evm--1',
    });

    renderHook(() => useAutoSelectDeriveType({ num: 0 }));

    await waitFor(() => {
      expect(mockUpdateSelectedAccountDeriveType).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'autoDeriveFallback' }),
      );
    });
  });

  it('leaves a newer derive type alone when the global sync went stale', async () => {
    mockSyncLocalDeriveTypeFromGlobal.mockResolvedValue({
      globalDeriveType: 'default',
      selectionResult: { outcome: 'stale' },
    });
    mockGetSelectedAccount.mockReturnValue({
      deriveType: 'ledgerLive',
      networkId: 'evm--1',
    });

    renderHook(() => useAutoSelectDeriveType({ num: 0 }));

    await waitFor(() => {
      expect(mockSyncLocalDeriveTypeFromGlobal).toHaveBeenCalled();
    });
    expect(mockUpdateSelectedAccountDeriveType).not.toHaveBeenCalled();
  });

  it('stops after a global sync that actually landed', async () => {
    mockSyncLocalDeriveTypeFromGlobal.mockResolvedValue({
      globalDeriveType: 'default',
      selectionResult: { outcome: 'commit' },
    });
    mockGetSelectedAccount.mockReturnValue({
      deriveType: undefined,
      networkId: 'evm--1',
    });

    renderHook(() => useAutoSelectDeriveType({ num: 0 }));

    await waitFor(() => {
      expect(mockSyncLocalDeriveTypeFromGlobal).toHaveBeenCalled();
    });
    expect(mockUpdateSelectedAccountDeriveType).not.toHaveBeenCalled();
  });
});
