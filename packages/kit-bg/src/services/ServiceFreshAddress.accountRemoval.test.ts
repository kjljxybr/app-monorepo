import ServiceFreshAddress from './ServiceFreshAddress';

jest.mock('@onekeyhq/shared/src/background/backgroundDecorators', () => ({
  backgroundClass: () => (target: unknown) => target,
  backgroundMethod:
    () => (_target: unknown, _key: unknown, descriptor: PropertyDescriptor) =>
      descriptor,
}));

jest.mock('./ServiceBase', () => ({
  __esModule: true,
  default: class ServiceBase {
    backgroundApi: any;

    constructor({ backgroundApi }: { backgroundApi: any }) {
      this.backgroundApi = backgroundApi;
    }
  },
}));

jest.mock('@onekeyhq/shared/src/eventBus/appEventBus', () => ({
  EAppEventBusNames: {
    AccountRemove: 'AccountRemove',
    WalletRemove: 'WalletRemove',
    WalletUpdate: 'WalletUpdate',
  },
  appEventBus: {
    on: jest.fn(),
  },
}));

jest.mock('@onekeyhq/shared/src/utils/accountUtils', () => ({
  __esModule: true,
  default: {
    getWalletIdFromAccountId: jest.fn(),
    isEnabledBtcFreshAddress: jest.fn(() => true),
  },
}));

jest.mock('@onekeyhq/shared/src/utils/networkUtils', () => ({
  __esModule: true,
  default: {
    isBTCNetwork: jest.fn(() => true),
  },
}));

jest.mock('../states/jotai/atoms', () => ({
  settingsPersistAtom: {
    get: jest.fn(async () => ({ enableBTCFreshAddress: true })),
  },
}));

jest.mock('../dbs/local/localDb', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../vaults/factory', () => ({
  vaultFactory: {},
}));

function buildBackgroundApi() {
  return {
    serviceAccount: {
      getDBAccountSafe: jest.fn(),
      getIndexedAccountSafe: jest.fn(),
      getNetworkAccountsInSameIndexedAccountIdWithDeriveTypes: jest.fn(),
    },
    serviceAccountProfile: {
      fetchAccountDetails: jest.fn(),
    },
    simpleDb: {
      btcFreshAddressMeta: {
        getRecord: jest.fn(),
      },
      localHistory: {
        getLocalPendingHistoryByNetwork: jest.fn(),
      },
    },
  };
}

describe('ServiceFreshAddress account-removal races', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stops when the indexed account is removed after reading the DB account', async () => {
    const backgroundApi = buildBackgroundApi();
    backgroundApi.serviceAccount.getDBAccountSafe.mockResolvedValue({
      id: 'account-1',
      indexedAccountId: 'indexed-account-1',
    });
    backgroundApi.serviceAccount.getIndexedAccountSafe.mockResolvedValue(
      undefined,
    );
    const service = new ServiceFreshAddress({ backgroundApi });
    const syncByIndexedAccount = jest.spyOn(
      service,
      'syncBTCFreshAddressByIndexedAccountId',
    );

    await expect(
      service.syncBTCFreshAddressByAccountId({
        accountId: 'account-1',
        networkId: 'btc--0',
      }),
    ).resolves.toBeUndefined();

    expect(
      backgroundApi.serviceAccount.getIndexedAccountSafe,
    ).toHaveBeenCalledWith({ id: 'indexed-account-1' });
    expect(syncByIndexedAccount).not.toHaveBeenCalled();
  });

  it('stops before enumerating accounts when the indexed account is removed', async () => {
    const backgroundApi = buildBackgroundApi();
    backgroundApi.serviceAccount.getIndexedAccountSafe.mockResolvedValue(
      undefined,
    );
    const service = new ServiceFreshAddress({ backgroundApi });

    await expect(
      service.syncBTCFreshAddressByIndexedAccountId({
        indexedAccountId: 'indexed-account-1',
        networkId: 'btc--0',
      }),
    ).resolves.toBeUndefined();

    expect(
      backgroundApi.serviceAccount
        .getNetworkAccountsInSameIndexedAccountIdWithDeriveTypes,
    ).not.toHaveBeenCalled();
  });

  it('stops before reading fresh-address metadata when the account is removed', async () => {
    const backgroundApi = buildBackgroundApi();
    backgroundApi.serviceAccount.getDBAccountSafe.mockResolvedValue(undefined);
    const service = new ServiceFreshAddress({ backgroundApi });

    await expect(
      service.syncBTCFreshAddress({
        accountId: 'account-1',
        deriveType: 'default',
        networkId: 'btc--0',
      }),
    ).resolves.toBeUndefined();

    expect(
      backgroundApi.simpleDb.btcFreshAddressMeta.getRecord,
    ).not.toHaveBeenCalled();
    expect(
      backgroundApi.serviceAccountProfile.fetchAccountDetails,
    ).not.toHaveBeenCalled();
  });
});
