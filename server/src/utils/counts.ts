/** One number per status (0 when the aggregate has no row for it), for the StatusTabs. */
export const zeroFilledCounts = <S extends string>(
  statuses: readonly S[],
  rows: ReadonlyArray<{ _id: unknown; count: number }>,
): Record<S, number> => {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<S, number>;
  for (const row of rows) {
    if (typeof row._id === 'string' && row._id in counts) counts[row._id as S] = row.count;
  }
  return counts;
};
