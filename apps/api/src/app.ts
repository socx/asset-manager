import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './env';
import { healthHandler } from './routes/health';
import { router } from './routes';

export function createApp(): Application {
  const app = express();

  // Trust first proxy (Nginx in production)
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS — only allow the configured frontend origin
  app.use(
    cors({
      origin: env.APP_BASE_URL,
      credentials: true,
    }),
  );

  // Body size limits (prevent large payload attacks)
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Health check — no auth required, not versioned
  app.get('/health', healthHandler);

  // API v1 routes
  app.use('/api/v1', router);

  return app;
}
