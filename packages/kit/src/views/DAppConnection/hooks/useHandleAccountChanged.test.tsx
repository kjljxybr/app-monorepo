/* eslint-disable import/first */

const mockSelectedAccountsAtom = Symbol('selectedAccountsAtom');
function createMockAccountSelectorStore(
  selectedAccount: Record<string, string | undefined>,
) {
  return {
    get: jest.fn((atom: unknown) =>
      atom === mockSelectedAccountsAtom ? { 0: selectedAccount } : undefined,
    ),
  };
}

let mockContextStore = createMockAccountSelectorStore({});
let mockActiveAccount = {
  account: { address: '0x1', id: 'account-1' },
  dbAccount: undefined,
  deriveType: 'default',
  indexedAccount: { id: 'indexed-account-1' },
  network: { id: 'evm--1' },
  wallet: { id: 'wallet-1' },
};

jest.mock('use-debounce', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    useThrottledCallback: (callback: () => void) => {
      const callbackRef = React.useRef(callback);
      callbackRef.current = callback;
      return React.useMemo(() => () => callbackRef.current(), []);
    },
  };
});

jest.mock('@onekeyhq/kit/src/states/jotai/contexts/accountSelector', () => ({
  defaultSelectedAccount: () => ({}),
  selectedAccountsAtom: () => mockSelectedAccountsAtom,
  useActiveAccount: () => ({ activeAccount: mockActiveAccount }),
  useAccountSelectorContextData: () => ({ store: mockContextStore }),
}));

import { renderHook } from '@testing-library/react-native';

import { useHandleDiscoveryAccountChanged } from './useHandleAccountChanged';

describe('useHandleDiscoveryAccountChanged', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContextStore = createMockAccountSelectorStore({});
    mockActiveAccount = {
      account: { address: '0x1', id: 'account-1' },
      dbAccount: undefined,
      deriveType: 'default',
      indexedAccount: { id: 'indexed-account-1' },
      network: { id: 'evm--1' },
      wallet: { id: 'wallet-1' },
    };
  });

  it('reads the latest selected account when the active account changes', () => {
    const firstSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-1',
      networkId: 'evm--1',
      walletId: 'wallet-1',
    };
    const latestSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-2',
      networkId: 'evm--1',
      walletId: 'wallet-2',
    };
    mockContextStore = createMockAccountSelectorStore(firstSelectedAccount);
    const handleAccountChanged = jest.fn();

    const { rerender } = renderHook(
      (_props: Record<string, never>) =>
        useHandleDiscoveryAccountChanged({
          handleAccountChanged,
          num: 0,
        }),
      { initialProps: {} },
    );

    expect(handleAccountChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedAccount: firstSelectedAccount }),
      0,
    );

    mockContextStore = createMockAccountSelectorStore(latestSelectedAccount);
    rerender({});
    expect(handleAccountChanged).toHaveBeenCalledTimes(1);

    mockActiveAccount = {
      ...mockActiveAccount,
      account: { address: '0x2', id: 'account-2' },
      indexedAccount: { id: 'indexed-account-2' },
      wallet: { id: 'wallet-2' },
    };
    rerender({});

    expect(handleAccountChanged).toHaveBeenCalledTimes(2);
    expect(handleAccountChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedAccount: latestSelectedAccount }),
      0,
    );
  });

  it('does not write a stale active account while a new selection is reloading', () => {
    const firstSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-1',
      networkId: 'evm--1',
      walletId: 'wallet-1',
    };
    const latestSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-2',
      networkId: 'evm--1',
      walletId: 'wallet-2',
    };
    mockContextStore = createMockAccountSelectorStore(firstSelectedAccount);
    const handleAccountChanged = jest.fn();
    const { rerender } = renderHook(
      (_props: Record<string, never>) =>
        useHandleDiscoveryAccountChanged({
          handleAccountChanged,
          num: 0,
        }),
      { initialProps: {} },
    );
    expect(handleAccountChanged).toHaveBeenCalledTimes(1);

    mockContextStore = createMockAccountSelectorStore(latestSelectedAccount);
    mockActiveAccount = {
      ...mockActiveAccount,
      account: { address: '0x-stale', id: 'account-1' },
    };
    rerender({});
    expect(handleAccountChanged).toHaveBeenCalledTimes(1);

    mockActiveAccount = {
      account: { address: '0x2', id: 'account-2' },
      dbAccount: undefined,
      deriveType: 'default',
      indexedAccount: { id: 'indexed-account-2' },
      network: { id: 'evm--1' },
      wallet: { id: 'wallet-2' },
    };
    rerender({});
    expect(handleAccountChanged).toHaveBeenCalledTimes(2);
    expect(handleAccountChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedAccount: latestSelectedAccount }),
      0,
    );
  });

  it('reads selection from the current provider store after the origin changes', () => {
    const firstSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-1',
      networkId: 'evm--1',
      walletId: 'wallet-1',
    };
    const latestSelectedAccount = {
      deriveType: 'default',
      indexedAccountId: 'indexed-account-2',
      networkId: 'evm--1',
      walletId: 'wallet-2',
    };
    mockContextStore = createMockAccountSelectorStore(firstSelectedAccount);
    const handleAccountChanged = jest.fn();
    const { rerender } = renderHook(
      (_props: Record<string, never>) =>
        useHandleDiscoveryAccountChanged({
          handleAccountChanged,
          num: 0,
        }),
      { initialProps: {} },
    );
    expect(handleAccountChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedAccount: firstSelectedAccount }),
      0,
    );

    mockContextStore = createMockAccountSelectorStore(latestSelectedAccount);
    mockActiveAccount = {
      account: { address: '0x2', id: 'account-2' },
      dbAccount: undefined,
      deriveType: 'default',
      indexedAccount: { id: 'indexed-account-2' },
      network: { id: 'evm--1' },
      wallet: { id: 'wallet-2' },
    };
    rerender({});

    expect(handleAccountChanged).toHaveBeenCalledTimes(2);
    expect(handleAccountChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedAccount: latestSelectedAccount }),
      0,
    );
  });
});
