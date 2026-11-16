import os from 'node:os';
import path from 'node:path';

const env = process.env;
const home = os.homedir();

/** HTTP and download cache. Safe to delete at any time. */
export const cacheDir = (): string =>
  env.FONTETTO_CACHE ?? path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'fontetto');

/** Your tags. Point FONTETTO_TAGS at a file in a repo to share tags with a team. */
export const tagsFile = (): string =>
  env.FONTETTO_TAGS ??
  path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'fontetto', 'tags.json');
