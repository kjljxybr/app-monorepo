import { BaseScene } from '../../../base/baseScene';
import { LogToLocal } from '../../../base/decorators';

// Failures a user can notice, kept out of the dev-only scenes on purpose.
// These are the cases where the app stops doing something the user asked for
// and cannot recover on its own, so a support report needs them in the exported
// log. Payloads carry no account identifiers.
export class AccountSelectorFailureScene extends BaseScene {
  @LogToLocal({ level: 'warn' })
  public activationFailed({
    connectionKind,
    errorMessage,
    errorName,
    num,
    phase,
    sceneName,
  }: {
    // walletConnect / evmEIP6963 / evmInjected. The failure modes have nothing
    // in common: a relay timeout, a provider that never announced itself, and a
    // missing window global are three different investigations.
    connectionKind: string;
    errorMessage: string | undefined;
    errorName: string | undefined;
    num: number;
    // Which step threw: connector activation or the peer-wallet sync that
    // follows it. They fail for different reasons and need different fixes.
    phase: string;
    sceneName: string | undefined;
  }) {
    return [
      'accountSelector external account activation failed',
      { connectionKind, errorMessage, errorName, num, phase, sceneName },
    ];
  }

  // The connector was activated but the peer wallet sync never ran, and nothing
  // will retry it: the effect only re-runs when the external account id or
  // network id changes, and neither did. Cancellation from an unmount or a
  // dependency change is deliberately not logged here — that path re-runs on
  // its own and would drown this one out on every account switch.
  @LogToLocal({ level: 'warn' })
  public peerSyncSkipped({
    connectionKind,
    num,
    reason,
    sceneName,
  }: {
    connectionKind: string;
    num: number;
    // Which half of the active account moved out from under the sync while it
    // waited: the account or the network. They point at different owners.
    reason: string;
    sceneName: string | undefined;
  }) {
    return [
      'accountSelector external peer wallet sync skipped',
      { connectionKind, num, reason, sceneName },
    ];
  }

  // One entry per selection that visibly did nothing, carrying both halves of
  // the answer: `outcome` is which check rejected it, `entry` is which UI asked.
  // Reading a support log should not require correlating two separate lines.
  //   stale* .............. superseded by a newer selection; expected during
  //                         fast switching, and the user sees their newer pick
  //   unavailable-wallet .. the wallet is gone or a mock; nothing will happen
  //   wallet-check-error .. the wallet lookup itself threw
  @LogToLocal({ level: 'warn' })
  public accountSelectRejected({
    entry,
    num,
    outcome,
    reason,
    sceneName,
    walletKind,
  }: {
    entry: string;
    num: number;
    outcome: string;
    reason: string | undefined;
    sceneName: string | undefined;
    // hd / hw / qr / imported / watching / external. An unavailable hardware
    // wallet usually means a disconnected device, an unavailable hd wallet
    // means missing data — same outcome, different investigation.
    walletKind: string;
  }) {
    return [
      'accountSelector account selection rejected',
      { entry, num, outcome, reason, sceneName, walletKind },
    ];
  }
}
