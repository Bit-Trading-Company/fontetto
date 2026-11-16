import type { Provider } from '../types.ts';
import { dafont } from './dafont/index.ts';

/** Every font source fontetto knows. Add a provider here and it shows up everywhere. */
export const PROVIDERS: Record<string, Provider> = { dafont };

export const DEFAULT_PROVIDER = 'dafont';

export function provider(id: string = DEFAULT_PROVIDER): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  return p;
}
