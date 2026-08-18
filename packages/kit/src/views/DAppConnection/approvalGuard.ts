// The connection modal approves the account held in React state, while the
// newest observation arrives through a ref. State can lag the ref across a
// render, and approval spans several awaits (bot-wallet lookup, warning
// dialog), so the two are re-compared before anything is written.
export function isApprovalAccountSuperseded({
  approvingAccountId,
  latestAccountId,
}: {
  approvingAccountId: string | undefined;
  latestAccountId: string | undefined;
}): boolean {
  // No observation yet, or nothing being approved: there is nothing to
  // contradict, and blocking here would strand a legitimate approval.
  if (!latestAccountId || !approvingAccountId) {
    return false;
  }
  return latestAccountId !== approvingAccountId;
}
