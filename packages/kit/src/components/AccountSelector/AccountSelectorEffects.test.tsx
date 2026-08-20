/** @jest-environment jsdom */

import { act, render, waitFor } from '@testing-library/react';
import { createStore } from 'jotai';

import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { EAccountSelectorSceneName } from '@onekeyhq/shared/types';

import {
  AccountSelectorJotaiProvider,
  accountSelectorStorageReadyAtom,
  defaultSelectedAccount,
  selectedAccountsAtom,
} from '../../states/jotai/contexts/accountSelector/atoms';

import { AccountSelectorEffects } from './AccountSelectorEffects';

const mockGetGlobalDeriveType: jest.MockedFunction<
  () => Promise<string | undefined>
> = jest.fn();
const mockShouldUseGlobalDeriveType: jest.MockedFunction<
  () => Promise<boolean>
> = jest.fn();
const mockIsDeriveTypeAvailableForNetwork: jest.MockedFunction<
  () => Promise<boolean>
> = jest.fn();
const mockIsInTransferImportOrBackupRestoreFlow: jest.MockedFunction<
  () => Promise<boolean>
> = jest.fn();
const mockShouldSyncHomeAndSwapSelectedAccount: jest.MockedFunction<
  () => Promise<boolean>
> = jest.fn();

// Import-time surface of actions.tsx, mirrored from actions.test.tsx: these
// modules never run in this test but must not load their real dependencies.
jest.mock('@onekeyhq/kit/src/components/Hardware/Hardware', () => ({
  CommonDeviceLoading: jest.fn(() => null),
}));

jest.mock(
  '@onekeyhq/kit/src/provider/Container/ThirdPartyHardwareUiStateContainer/ledgerCoreAppsReadyUtils',
  () => ({
    shouldContinueLedgerAutoCreateForCoreAppsCheckResult: jest.fn(() => false),
  }),
);

jest.mock(
  '@onekeyhq/kit/src/provider/Container/ThirdPartyHardwareUiStateContainer/LedgerInstallCoreAppsDialog',
  () => ({
    ensureLedgerCoreAppsReady: jest.fn(),
  }),
);

jest.mock('@onekeyhq/kit/src/utils/toastExistingWalletSwitch', () => ({
  toastExistingWalletSwitch: jest.fn(),
}));

jest.mock('@onekeyhq/shared/src/platformEnv', () => ({
  __esModule: true,
  default: {
    isDesktop: true,
    isDev: false,
    isExtensionBackgroundServiceWorker: false,
    isJest: true,
    isNative: false,
    isWeb: false,
    isWebDappMode: false,
  },
}));

jest.mock('@onekeyhq/shared/src/storage/instance/webColdStartStorage', () => ({
  flushColdStartCacheNow: jest.fn(async () => undefined),
}));

jest.mock('@onekeyhq/shared/src/storage/instance/syncStorageInstance', () => ({
  coldStartCacheStorage: {
    delete: jest.fn(),
    getObject: jest.fn(),
    setObject: jest.fn(),
  },
}));

jest.mock(
  '@onekeyhq/kit/src/views/Onboarding/pages/ConnectHardwareWallet/qrHiddenCreateGuideDialog',
  () => ({
    __esModule: true,
    default: jest.fn(),
  }),
);

// The only mocked internal of AccountSelectorEffects: this hook reaches
// usePromiseResult -> useRouteIsFocused -> @react-navigation focus context and
// '@onekeyhq/components' runtime hooks that the repo-wide componentsMock does
// not provide. The auto-select hooks that consume it stay real and are gated
// inert by storageReady=false.
jest.mock('./hooks/useAccountSelectorAvailableNetworks', () => ({
  useAccountSelectorAvailableNetworks: jest.fn(() => ({
    networkIds: [],
    defaultNetworkId: undefined,
  })),
}));

jest.mock('@onekeyhq/kit/src/background/instance/backgroundApiProxy', () => ({
  __esModule: true,
  default: {
    serviceAccountSelector: {
      getGlobalDeriveType: () => mockGetGlobalDeriveType(),
      shouldSyncHomeAndSwapSelectedAccount: () =>
        mockShouldSyncHomeAndSwapSelectedAccount(),
      shouldUseGlobalDeriveType: () => mockShouldUseGlobalDeriveType(),
    },
    serviceNetwork: {
      isDeriveTypeAvailableForNetwork: () =>
        mockIsDeriveTypeAvailableForNetwork(),
    },
    servicePrimeTransfer: {
      isInTransferImportOrBackupRestoreFlow: () =>
        mockIsInTransferImportOrBackupRestoreFlow(),
    },
  },
}));

jest.mock('@onekeyhq/shared/src/logger/logger', () => {
  const noopLogger = new Proxy(jest.fn(), {
    apply: () => undefined,
    get: () => noopLogger,
  });

  return {
    defaultLogger: noopLogger,
  };
});

describe('AccountSelectorEffects num-filtered events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGlobalDeriveType.mockResolvedValue('default');
    mockShouldUseGlobalDeriveType.mockResolvedValue(true);
    mockIsDeriveTypeAvailableForNetwork.mockResolvedValue(true);
    mockIsInTransferImportOrBackupRestoreFlow.mockResolvedValue(false);
    mockShouldSyncHomeAndSwapSelectedAccount.mockResolvedValue(false);
  });

  it('drops a DAppNetworkUpdate for an unmounted num and applies one for its own num once', async () => {
    const sceneName = EAccountSelectorSceneName.home;
    const sceneUrl = '';
    const store = createStore();
    // Not ready on purpose: the DAppNetworkUpdate handler must not depend on
    // storage readiness, while the storage/auto-select side effects stay inert.
    store.set(accountSelectorStorageReadyAtom(), false);
    store.set(selectedAccountsAtom(), { 0: defaultSelectedAccount() });

    render(
      <AccountSelectorJotaiProvider
        store={store}
        config={{ sceneName, sceneUrl }}
      >
        <AccountSelectorEffects num={0} />
      </AccountSelectorJotaiProvider>,
    );
    // Settle mount-time effects before counting selection writes.
    await act(async () => {});

    let selectionWriteCount = 0;
    const unsubscribe = store.sub(selectedAccountsAtom(), () => {
      selectionWriteCount += 1;
    });
    const selectionsBeforeEvents = store.get(selectedAccountsAtom());

    try {
      // Only a num-0 effects instance is mounted (the registry shrink covered
      // in jotaiContextStore.test.ts is what makes this state reachable), so a
      // matching event addressed to num 1 must be dropped entirely.
      await act(async () => {
        appEventBus.emit(EAppEventBusNames.DAppNetworkUpdate, {
          networkId: 'evm--1',
          num: 1,
          sceneName,
          sceneUrl,
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      expect(mockGetGlobalDeriveType).not.toHaveBeenCalled();
      expect(store.get(selectedAccountsAtom())).toBe(selectionsBeforeEvents);
      expect(selectionWriteCount).toBe(0);

      // The same event addressed to the mounted num commits exactly once.
      await act(async () => {
        appEventBus.emit(EAppEventBusNames.DAppNetworkUpdate, {
          networkId: 'evm--1',
          num: 0,
          sceneName,
          sceneUrl,
        });
      });
      await waitFor(() => {
        expect(store.get(selectedAccountsAtom())[0]?.networkId).toBe('evm--1');
      });

      expect(selectionWriteCount).toBe(1);
      expect(mockGetGlobalDeriveType).toHaveBeenCalledTimes(1);
      expect(store.get(selectedAccountsAtom())[1]).toBeUndefined();
    } finally {
      unsubscribe();
    }
  });
});
