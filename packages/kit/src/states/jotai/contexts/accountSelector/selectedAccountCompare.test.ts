import type {
  IAccountSelectorSelectedAccount,
  IAccountSelectorSelectedAccountsMap,
} from '@onekeyhq/kit-bg/src/dbs/simple/entity/SimpleDbEntityAccountSelector';

import {
  isSameSelectedAccount,
  isSameSelectedAccountsMap,
} from './selectedAccountCompare';

// Extension keeps UI and background in separate JS runtimes and moves payloads
// between them as JSON, which silently drops every key whose value is undefined.
function bridgeThroughBackground<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSelectedAccount(
  indexedAccountId: string,
): IAccountSelectorSelectedAccount {
  return {
    walletId: 'hd-1',
    indexedAccountId,
    othersWalletAccountId: undefined,
    networkId: 'evm--1',
    deriveType: 'default',
    focusedWallet: 'hd-1',
  };
}

const allUndefinedSelectedAccount: IAccountSelectorSelectedAccount = {
  walletId: undefined,
  indexedAccountId: undefined,
  othersWalletAccountId: undefined,
  networkId: undefined,
  deriveType: undefined,
  focusedWallet: undefined,
};

describe('isSameSelectedAccount', () => {
  it('treats a bridged selection as the same as its in-memory source', () => {
    const selectedAccount = createSelectedAccount('hd-1--0');
    expect(
      isSameSelectedAccount(
        selectedAccount,
        bridgeThroughBackground(selectedAccount),
      ),
    ).toBe(true);
  });

  it('treats an all-undefined selection and an empty bridged one as the same', () => {
    expect(
      isSameSelectedAccount(
        allUndefinedSelectedAccount,
        bridgeThroughBackground(allUndefinedSelectedAccount),
      ),
    ).toBe(true);
  });

  it('still reports a different account value as different', () => {
    expect(
      isSameSelectedAccount(
        createSelectedAccount('hd-1--0'),
        bridgeThroughBackground(createSelectedAccount('hd-1--1')),
      ),
    ).toBe(false);
  });

  it('still reports a dropped defined value as different', () => {
    const selectedAccount = createSelectedAccount('hd-1--0');
    expect(
      isSameSelectedAccount(selectedAccount, {
        ...selectedAccount,
        networkId: undefined,
      }),
    ).toBe(false);
  });
});

describe('isSameSelectedAccountsMap', () => {
  it('treats a bridged map as the same as its in-memory source', () => {
    const selectedAccountsMap: IAccountSelectorSelectedAccountsMap = {
      0: createSelectedAccount('hd-1--0'),
      1: createSelectedAccount('hd-1--1'),
    };
    expect(
      isSameSelectedAccountsMap(
        selectedAccountsMap,
        bridgeThroughBackground(selectedAccountsMap),
      ),
    ).toBe(true);
  });

  it('treats an undefined slot and a missing slot as the same', () => {
    expect(isSameSelectedAccountsMap({ 0: undefined }, {})).toBe(true);
  });

  it('treats an empty map and an undefined map as the same', () => {
    expect(isSameSelectedAccountsMap(undefined, {})).toBe(true);
  });

  it('still reports a different account value as different', () => {
    expect(
      isSameSelectedAccountsMap(
        { 0: createSelectedAccount('hd-1--0') },
        bridgeThroughBackground({ 0: createSelectedAccount('hd-1--1') }),
      ),
    ).toBe(false);
  });

  it('still reports an extra num slot as different', () => {
    const selectedAccount = createSelectedAccount('hd-1--0');
    expect(
      isSameSelectedAccountsMap(
        { 0: selectedAccount },
        bridgeThroughBackground({
          0: selectedAccount,
          1: createSelectedAccount('hd-1--1'),
        }),
      ),
    ).toBe(false);
  });

  it('still reports a missing num slot as different', () => {
    const selectedAccount = createSelectedAccount('hd-1--0');
    expect(
      isSameSelectedAccountsMap(
        { 0: selectedAccount, 1: createSelectedAccount('hd-1--1') },
        { 0: selectedAccount },
      ),
    ).toBe(false);
  });

  it('still reports a selection moved to another num slot as different', () => {
    const selectedAccount = createSelectedAccount('hd-1--0');
    expect(
      isSameSelectedAccountsMap({ 0: selectedAccount }, { 1: selectedAccount }),
    ).toBe(false);
  });

  it('treats a bridged default selection slot as unchanged', () => {
    const selectedAccountsMap: IAccountSelectorSelectedAccountsMap = {
      0: allUndefinedSelectedAccount,
    };
    expect(
      isSameSelectedAccountsMap(
        selectedAccountsMap,
        bridgeThroughBackground(selectedAccountsMap),
      ),
    ).toBe(true);
  });
});
