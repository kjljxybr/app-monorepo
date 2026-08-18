import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { AccountSelectorAutoSelectScene } from './autoSelect';
import { AccountSelectorListDataScene } from './listData';
import { AccountSelectorPerfScene } from './perf';
import { AccountSelectorRenderScene } from './render';
import { AccountSelectorStaleDropScene } from './staleDrop';
import { AccountSelectorStorageScene } from './storage';

describe('account selector development-only logger scenes', () => {
  it('does not emit performance or storage logs in production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const perfScene = new AccountSelectorPerfScene();
      const storageScene = new AccountSelectorStorageScene();
      const autoSelectScene = new AccountSelectorAutoSelectScene();
      const renderScene = new AccountSelectorRenderScene();
      const perfEmit = jest.spyOn(perfScene, '_emitLog');
      const storageEmit = jest.spyOn(storageScene, '_emitLog');
      const autoSelectEmit = jest.spyOn(autoSelectScene, '_emitLog');
      const renderEmit = jest.spyOn(renderScene, '_emitLog');

      perfScene.trace('selectionStateUpdated', { num: 0, transitionId: 1 });
      perfScene.renderAccountSelectorModal({
        num: 0,
        sceneName: 'home',
      });
      storageScene.updateSelectedAccount({
        newSelectedAccount: { networkId: 'evm--1' },
        num: 0,
        oldSelectedAccount: { networkId: 'btc--0' },
        sceneName: 'home',
        sceneUrl: undefined,
      });
      autoSelectScene.currentSelectedAccount({
        selectedAccount: { walletId: 'wallet-id' },
      });
      renderScene.selectAccount({
        accountId: 'account-id',
        networkId: 'network-id',
        walletId: 'wallet-id',
      });

      expect(perfEmit).not.toHaveBeenCalled();
      expect(storageEmit).not.toHaveBeenCalled();
      expect(autoSelectEmit).not.toHaveBeenCalled();
      expect(renderEmit).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('still emits list data logs in production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const listDataScene = new AccountSelectorListDataScene();
      const listDataEmit = jest.spyOn(listDataScene, '_emitLog');

      listDataScene.focusedWalletMissing({ focusedWallet: 'wallet-id' });
      listDataScene.buildAccountsData({
        accountsLength: 3,
        title: 'Wallet',
        walletId: 'hd-1',
      });

      expect(listDataEmit).toHaveBeenCalledTimes(2);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('keeps identifiers out of list data payloads', () => {
    const listDataScene = new AccountSelectorListDataScene();
    const payload = listDataScene.fixDeriveTypesForInitAccountSelectorMap({
      fixedDeriveType: 'default',
      globalDeriveType: 'default',
      selectedAccount: {
        deriveType: 'default',
        indexedAccountId: 'hd-1--0',
        networkId: 'evm--1',
        walletId: 'hd-1',
      },
    });

    expect(JSON.stringify(payload)).not.toContain('hd-1');
  });

  it('still emits stale-drop logs in production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const staleDropScene = new AccountSelectorStaleDropScene();
      const staleDropEmit = jest.spyOn(staleDropScene, '_emitLog');

      staleDropScene.selectionUpdateDropped({
        current: { networkId: 'evm--1' },
        expected: { networkId: 'btc--0' },
        num: 0,
        reason: 'syncFromScene',
        sceneName: 'discover',
        staleGuard: 'revision',
        suppressedSinceLastLog: 0,
      });
      staleDropScene.storageSideEffectDropped({
        num: 0,
        outcome: 'stale-before-event',
        primaryPersisted: true,
        reason: 'confirmAccountSelect',
        sceneName: 'home',
        suppressedSinceLastLog: 2,
        syncedHome: false,
      });
      staleDropScene.repeatedStaleDropsDetected({
        consecutiveCount: 3,
        num: 0,
        reason: 'syncFromScene',
        sceneName: 'discover',
      });

      expect(staleDropEmit).toHaveBeenCalledTimes(3);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('keeps identifiers out of stale-drop payloads', () => {
    const staleDropScene = new AccountSelectorStaleDropScene();
    const payload = staleDropScene.selectionUpdateDropped({
      current: {
        deriveType: 'default',
        indexedAccountId: 'hd-1--0',
        networkId: 'evm--1',
        walletId: 'hd-1',
      },
      expected: undefined,
      num: 0,
      reason: 'syncFromScene',
      sceneName: 'discover',
      staleGuard: 'selection',
      suppressedSinceLastLog: 0,
    });

    expect(JSON.stringify(payload)).not.toContain('hd-1');
  });

  it('produces an identical payload for repeated identical drops', () => {
    const staleDropScene = new AccountSelectorStaleDropScene();
    const args = {
      current: { deriveType: 'default', networkId: 'evm--1' },
      expected: { deriveType: 'default', networkId: 'btc--0' },
      num: 0,
      reason: 'syncHomeAndSwapSelectedAccount',
      sceneName: 'swap',
      staleGuard: 'revision',
      suppressedSinceLastLog: 0,
    };

    // The log transport only collapses byte-identical consecutive messages, so a
    // varying field (a revision timestamp, a counter) would defeat it entirely.
    expect(JSON.stringify(staleDropScene.selectionUpdateDropped(args))).toEqual(
      JSON.stringify(staleDropScene.selectionUpdateDropped(args)),
    );
  });

  it('formats performance traces as one structured record', () => {
    const perfScene = new AccountSelectorPerfScene();

    expect(
      perfScene.trace('selectionStateUpdated', { num: 0, transitionId: 1 }),
    ).toEqual([
      {
        event: 'selectionStateUpdated',
        num: 0,
        runtimeRole: platformEnv.runtimeRole,
        transitionId: 1,
      },
    ]);
  });
});
