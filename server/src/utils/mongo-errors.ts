interface MongoErrorLike {
  code?: unknown;
  message?: unknown;
  keyPattern?: Record<string, unknown>;
}

const asDuplicateKeyError = (error: unknown): MongoErrorLike | undefined => {
  const candidate = error as MongoErrorLike | null | undefined;
  return candidate && candidate.code === 11000 ? candidate : undefined;
};

/** The index that rejected a duplicate key (E11000), e.g. "name_unique", or undefined. */
export const duplicateKeyIndex = (error: unknown): string | undefined => {
  const duplicate = asDuplicateKeyError(error);
  if (!duplicate || typeof duplicate.message !== 'string') return undefined;
  return /index: (\S+)/.exec(duplicate.message)?.[1];
};

/** True for a duplicate key error (E11000), optionally only on the named index. */
export const isDuplicateKeyError = (error: unknown, indexName?: string): boolean =>
  asDuplicateKeyError(error) !== undefined &&
  (indexName === undefined || duplicateKeyIndex(error) === indexName);

/** The fields of the violated unique key, e.g. ["name"]. Empty when it is not E11000. */
export const duplicateKeyFields = (error: unknown): string[] =>
  Object.keys(asDuplicateKeyError(error)?.keyPattern ?? {});
