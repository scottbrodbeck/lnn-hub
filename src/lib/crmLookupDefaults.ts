// Hardcoded default options for CRM lookups. Free-text entry is also allowed
// in the UI; these are convenience suggestions, not a closed set.

export const DEFAULT_DEAL_SOURCES: string[] = [
  'Referral',
  'Inbound — website',
  'Inbound — email',
  'Outbound — cold call',
  'Outbound — cold email',
  'Trade show / event',
  'Partner',
  'Existing customer',
  'Other',
];

export const DEFAULT_LOST_REASONS: string[] = [
  'Price / budget',
  'Timing',
  'Lost to competitor',
  'No decision / went silent',
  'Not a fit',
  'Other',
];
