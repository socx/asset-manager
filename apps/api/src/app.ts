import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env';
import { logger } from './lib/logger';
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

  // Parse cookies (needed for HttpOnly refresh token)
  app.use(cookieParser());

  // Health check — no auth required, not versioned
  app.get('/health', healthHandler);

  // API v1 routes
  app.use('/api/v1', router);

  // Global error handler — must be defined last
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('[api] Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
  });

  return app;
}
