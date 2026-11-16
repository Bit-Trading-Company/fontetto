import type { License, LicenseFilter, LicenseKind } from '../types.ts';

/** Expand a licence filter preset into the kinds it allows. */
export function licenseKinds(filter: LicenseFilter | undefined): LicenseKind[] | undefined {
  if (!filter) return undefined;
  if (filter === 'commercial') return ['open', 'free'];
  if (filter === 'open') return ['open'];
  return filter;
}

/** "✓ commercial", "✗ personal only", "? check terms" — the one thing a designer must know. */
export function commercialLabel(license: License): string {
  if (license.commercial === true) return 'commercial ok';
  if (license.commercial === false) return license.kind === 'personal' ? 'personal use only' : 'not free for commercial use';
  return 'check terms';
}
