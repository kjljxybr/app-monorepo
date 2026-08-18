import testIDValues from './testIDValues.json';

const { deriveTypeSelectorTriggerPrefix, ...staticTestIDs } = testIDValues;

export const AccountSelectorTestIDs = {
  ...staticTestIDs,
  deriveTypeSelectorTrigger: (pathTemplate: string) =>
    `${deriveTypeSelectorTriggerPrefix}${pathTemplate}`,
} as const;
