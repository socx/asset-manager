import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './env';
import { logger } from './lib/logger';
import { traceIdMiddleware } from './middleware/traceId';
import { healthHandler } from './routes/health';
import { router } from './routes';
import { swaggerSpec } from './lib/swagger';

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

  // Attach trace ID to every request
  app.use(traceIdMiddleware);

  // Health check — no auth required, not versioned
  app.get('/health', healthHandler);

  // API v1 routes
  app.use('/api/v1', router);

  // API docs — non-production only
  if (env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api/docs.json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
  }

  // Global error handler — must be defined last
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('[api] Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
  });

  return app;
}
