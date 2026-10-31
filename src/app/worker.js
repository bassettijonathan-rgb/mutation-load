// Entry point of the Web Worker: the simulation server, wired to postMessage.
// Also answers 'validate' with runs of the Validation tab's checks.

import { createSimServer } from './server.js';
import { runValidation } from './validation.js';

const handle = createSimServer((msg) => self.postMessage(msg));

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'validate') {
    runValidation((p) => self.postMessage({ type: 'validation-progress', ...p }), msg.only ?? null)
      .then((result) => self.postMessage({ type: 'validation', result }))
      .catch((err) => self.postMessage({ type: 'error', message: String(err) }));
    return;
  }
  handle(msg);
};
