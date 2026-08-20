import { isEqual, isUndefined, omitBy } from 'lodash';

import type {
  IAccountSelectorSelectedAccount,
  IAccountSelectorSelectedAccountsMap,
} from '@onekeyhq/kit-bg/src/dbs/simple/entity/SimpleDbEntityAccountSelector';

// Selections cross the UI <-> background boundary as JSON on extension, and JSON
// drops keys whose value is undefined. The in-memory defaultSelectedAccount()
// carries six explicit undefined keys, so a bare isEqual() between a value that
// came back from background and an in-memory one always reports a difference
// there while reporting equality on desktop/web. Every comparison that mixes the
// two sources must go through these helpers so the verdict is platform
// independent.
export function isSameSelectedAccount(
  first: IAccountSelectorSelectedAccount | undefined,
  second: IAccountSelectorSelectedAccount | undefined,
) {
  return isEqual(omitBy(first, isUndefined), omitBy(second, isUndefined));
}

function collectDefinedSelectedAccounts(
  selectedAccountsMap: IAccountSelectorSelectedAccountsMap | undefined,
) {
  const result: Record<string, IAccountSelectorSelectedAccount> = {};
  Object.entries(selectedAccountsMap ?? {}).forEach(
    ([numKey, selectedAccount]) => {
      // An undefined slot and a missing slot are the same map after a JSON hop.
      if (!isUndefined(selectedAccount)) {
        result[numKey] = selectedAccount;
      }
    },
  );
  return result;
}

export function isSameSelectedAccountsMap(
  first: IAccountSelectorSelectedAccountsMap | undefined,
  second: IAccountSelectorSelectedAccountsMap | undefined,
) {
  const firstMap = collectDefinedSelectedAccounts(first);
  const secondMap = collectDefinedSelectedAccounts(second);
  const firstNumKeys = Object.keys(firstMap);
  if (firstNumKeys.length !== Object.keys(secondMap).length) {
    return false;
  }
  return firstNumKeys.every(
    (numKey) =>
      Object.prototype.hasOwnProperty.call(secondMap, numKey) &&
      isSameSelectedAccount(firstMap[numKey], secondMap[numKey]),
  );
}
