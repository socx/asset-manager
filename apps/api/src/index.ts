import { createApp } from './app';
import { env } from './env';
import { seedDefaultSettings } from './lib/settings';
import { logger } from './lib/logger';

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

// Capture unhandled errors as fatal log entries
process.on('uncaughtException', (err) => {
  logger.fatal('[process] Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal('[process] Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});
