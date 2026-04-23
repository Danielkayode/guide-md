import { pathToFileURL } from 'node:url';

globalThis.import = {
  meta: {
    url: typeof __filename !== 'undefined' ? pathToFileURL(__filename).href : 'file://'
  }
};
