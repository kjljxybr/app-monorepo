import { isApprovalAccountSuperseded } from './approvalGuard';

describe('DApp connection approval guard', () => {
  it('blocks approval when the observed account moved on', () => {
    expect(
      isApprovalAccountSuperseded({
        approvingAccountId: 'hd-1--0',
        latestAccountId: 'hd-1--1',
      }),
    ).toBe(true);
  });

  it('allows approval when the observed account still matches', () => {
    expect(
      isApprovalAccountSuperseded({
        approvingAccountId: 'hd-1--0',
        latestAccountId: 'hd-1--0',
      }),
    ).toBe(false);
  });

  it('allows approval before any account has been observed', () => {
    expect(
      isApprovalAccountSuperseded({
        approvingAccountId: 'hd-1--0',
        latestAccountId: undefined,
      }),
    ).toBe(false);
  });

  it('allows approval when the observation has no account yet', () => {
    // An account still creating its address reports no id; that is a reason to
    // disable the button, not to reject an approval already in flight.
    expect(
      isApprovalAccountSuperseded({
        approvingAccountId: undefined,
        latestAccountId: 'hd-1--0',
      }),
    ).toBe(false);
  });
});
