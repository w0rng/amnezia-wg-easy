'use strict';

import {Server, wireGuard} from '@/services/Server';

// Start the Web UI server so the process stays alive
new Server();


wireGuard.getConfig()
  .catch((err: Error) => {
    console.error(err);
    process.exit(1);
  });

// Handle terminate signal
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received.');
  try {
    await wireGuard.Shutdown();
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
});

// Handle interrupt signal
process.on('SIGINT', () => {
  console.log('SIGINT signal received.');
});
