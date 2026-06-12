export function normalizeMagazineLuizaStoreSlug(value: string): string | null {
  const storeSlug = value.trim().toLowerCase();

  return /^[a-z0-9_-]{3,80}$/.test(storeSlug) ? storeSlug : null;
}
