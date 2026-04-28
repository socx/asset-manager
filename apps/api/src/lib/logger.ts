import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import Transport from 'winston-transport';
import { prisma } from '@asset-manager/db';
import { env } from '../env';
import { getTraceId } from './traceContext';

const SERVICE = 'api';

// ── Custom levels (adds `fatal` above `error`) ────────────────────────────────

const CUSTOM_LEVELS = {
  levels: { fatal: 0, error: 1, warn: 2, info: 3, http: 4, debug: 5 },
  colors: {
    fatal: 'magenta',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    debug: 'blue',
  },
};

winston.addColors(CUSTOM_LEVELS.colors);

// ── DB transport — persists warn / error / fatal to system_logs ───────────────

const DB_LEVEL_SET = new Set(['warn', 'error', 'fatal']);

class DBTransport extends Transport {
  log(info: winston.Logform.TransformableInfo, callback: () => void): void {
    callback(); // never block the logging pipeline

    if (!DB_LEVEL_SET.has(info.level)) return;

    setImmediate(() => {
      // Strip internal winston symbols and well-known format fields from context
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { level, message, traceId, service: _s, timestamp: _t, ...rest } = info as Record<string, unknown>;
      const context = Object.keys(rest).length ? rest : undefined;

      prisma.systemLog
        .create({
          data: {
            level: level as 'warn' | 'error' | 'fatal',
            service: SERVICE,
            message: String(message),
            traceId: traceId ? String(traceId) : null,
            context: context as object | undefined,
          },
        })
        .catch(() => {
          // Silently discard — DB transport failures must never crash the logger
        });
    });
  }
}

// ── Formats ───────────────────────────────────────────────────────────────────

/** Injects `service` and `traceId` into every log record. */
const injectFields = winston.format((info) => {
  info.service = SERVICE;
  info.traceId = getTraceId() ?? (info.traceId as string | undefined) ?? null;
  return info;
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  injectFields(),
  winston.format.json(),
);

const devFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  injectFields(),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, traceId, ...meta }) => {
    const trace = traceId ? ` [${String(traceId).slice(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${String(timestamp)}${trace} [${level}]: ${String(message)}${metaStr}`;
  }),
);

// ── Transports ────────────────────────────────────────────────────────────────

const isTest = env.NODE_ENV === 'test';
const isDev = env.NODE_ENV === 'development';

const transports: Transport[] = [];

if (!isTest) {
  transports.push(
    new winston.transports.Console({
      format: isDev ? devFormat : jsonFormat,
    }),
    new DailyRotateFile({
      filename: 'logs/api-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      zippedArchive: true,
      format: jsonFormat,
    }),
    new DBTransport(),
  );
}

// ── Logger instance ───────────────────────────────────────────────────────────

export type CustomLogger = winston.Logger & { fatal: winston.LeveledLogMethod };

export const logger = winston.createLogger({
  levels: CUSTOM_LEVELS.levels,
  level: isDev ? 'debug' : 'info',
  silent: isTest,
  transports,
}) as CustomLogger;
