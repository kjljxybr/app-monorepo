import { appEventBus } from '@onekeyhq/shared/src/eventBus/appEventBus';

import { SimpleDbEntityAccountSelector } from './SimpleDbEntityAccountSelector';

import type { IAccountSelectorPersistInfo } from './SimpleDbEntityAccountSelector';

describe('SimpleDbEntityAccountSelector global derive type persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // The write-side half of the loop cut for the GlobalDeriveTypeUpdate chain:
  // event -> receiver sync -> autoSave -> saveGlobalDeriveType writes the value
  // it just received. Re-emitting on that equal-value write would hand every UI
  // runtime a fresh event for a value it already holds; together with the
  // receiver-side noop short-circuit this gate is what terminates the chain.
  it('emits GlobalDeriveTypeUpdate only when the saved value actually changes', async () => {
    jest.useFakeTimers();
    const entity = new SimpleDbEntityAccountSelector();
    let rawData: IAccountSelectorPersistInfo = {
      selectorInfo: {},
      globalDeriveTypesMap: {},
    };
    jest
      .spyOn(entity, 'setRawData')
      .mockImplementation(async (dataOrBuilder) => {
        rawData =
          typeof dataOrBuilder === 'function'
            ? await dataOrBuilder(rawData)
            : dataOrBuilder;
        return rawData;
      });
    const emitSpy = jest
      .spyOn(appEventBus, 'emit')
      .mockImplementation(() => true);

    await entity.saveGlobalDeriveType({
      networkId: 'evm--1',
      deriveType: 'BIP44',
    });
    jest.runAllTimers();
    expect(emitSpy).toHaveBeenCalledTimes(1);

    // Writing back the value already stored must not schedule another event.
    await entity.saveGlobalDeriveType({
      networkId: 'evm--1',
      deriveType: 'BIP44',
    });
    jest.runAllTimers();
    expect(emitSpy).toHaveBeenCalledTimes(1);

    // The gate compares values, it is not a once-only latch.
    await entity.saveGlobalDeriveType({
      networkId: 'evm--1',
      deriveType: 'BIP86',
    });
    jest.runAllTimers();
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });
});
