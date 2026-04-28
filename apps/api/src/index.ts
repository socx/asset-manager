import { createApp } from './app';
import { env } from './env';
import { seedDefaultSettings } from './lib/settings';

const app = createApp();

void seedDefaultSettings();

const server = app.listen(env.API_PORT, () => {
  console.log(`[api] Server listening on http://localhost:${env.API_PORT}`);
  console.log(`[api] Environment: ${env.NODE_ENV}`);
});

const shutdown = (signal: string) => {
  console.log(`[api] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('[api] Server closed');
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
