/**
 * Deep-merge `source` into `target`.
 * - Skips null / undefined / empty-string values from source
 * - Recursively merges nested plain objects
 * - Arrays from source replace arrays in target (no element-level merge)
 * - Primitives from source overwrite target
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];

    if (srcVal === null || srcVal === undefined || srcVal === '') continue;

    const tgtVal = result[key];

    if (
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}
