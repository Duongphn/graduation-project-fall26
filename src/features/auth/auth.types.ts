export const accountStatuses = ['PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED'] as const;

export type AccountStatus = (typeof accountStatuses)[number];
