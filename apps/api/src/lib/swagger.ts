import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Asset Manager API',
      version: '1.0.0',
      description:
        'REST API for the Asset Manager platform. ' +
        'All endpoints are prefixed with `/api/v1`. ' +
        'Most authenticated routes require a Bearer access token obtained from `POST /auth/login`.  \n\n' +
        '**Admin routes** additionally require `system_admin` or `super_admin` role **and** a recent ' +
        'step-up re-authentication (`POST /auth/step-up`).',
      contact: { name: 'Platform Team' },
    },
    servers: [{ url: '/api/v1', description: 'Current environment' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token obtained from POST /auth/login',
        },
      },
      schemas: {
        // ── Shared primitives ─────────────────────────────────────────────────
        Message: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', example: 'Operation completed successfully.' } },
        },
        MessageWithCode: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            code: { type: 'string', example: 'EMAIL_NOT_VERIFIED' },
          },
        },
        ValidationError: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', example: 'Validation failed.' },
            errors: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
              example: { email: ['Invalid email address.'] },
            },
          },
        },
        // ── User ──────────────────────────────────────────────────────────────
        UserProfile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['super_admin', 'system_admin', 'asset_manager', 'asset_owner'] },
          },
        },
        AdminUser: {
          allOf: [
            { $ref: '#/components/schemas/UserProfile' },
            {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['pending_verification', 'active', 'disabled'] },
                mfaEnabled: { type: 'boolean' },
                lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        // ── Tokens ────────────────────────────────────────────────────────────
        LoginResponse: {
          type: 'object',
          required: ['accessToken', 'user'],
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: { $ref: '#/components/schemas/UserProfile' },
          },
        },
        MfaRequiredResponse: {
          type: 'object',
          required: ['mfaRequired', 'sessionChallenge'],
          properties: {
            mfaRequired: { type: 'boolean', example: true },
            sessionChallenge: { type: 'string', format: 'uuid' },
          },
        },
        // ── Sessions ──────────────────────────────────────────────────────────
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            ipAddress: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Admin: Settings ───────────────────────────────────────────────────
        SystemSetting: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'MAX_LOGIN_ATTEMPTS' },
            value: { type: 'string', example: '5' },
            description: { type: 'string', nullable: true },
          },
        },
        // ── Admin: Audit log ──────────────────────────────────────────────────
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'BigInt as string' },
            actorId: { type: 'string', format: 'uuid', nullable: true },
            actorRole: { type: 'string', nullable: true },
            action: { type: 'string', example: 'USER_LOGIN_SUCCESS' },
            entityType: { type: 'string', example: 'user' },
            entityId: { type: 'string', nullable: true },
            oldValue: { type: 'object', nullable: true },
            newValue: { type: 'object', nullable: true },
            ipAddress: { type: 'string', nullable: true },
            userAgent: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Admin: System log ─────────────────────────────────────────────────
        SystemLog: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'BigInt as string' },
            level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
            service: { type: 'string', example: 'api' },
            message: { type: 'string' },
            context: { type: 'object', nullable: true },
            traceId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        // ── Pagination cursor ─────────────────────────────────────────────────
        CursorPage: {
          type: 'object',
          properties: {
            nextCursor: { type: 'string', nullable: true, description: 'Pass as `cursor` to fetch the next page. Null if no more pages.' },
          },
        },
      },
      parameters: {
        CursorParam: {
          name: 'cursor',
          in: 'query',
          schema: { type: 'string' },
          description: 'Opaque cursor returned from the previous page for keyset pagination.',
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          description: 'Maximum number of records to return.',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid access token.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } },
        },
        Forbidden: {
          description: 'Insufficient permissions or step-up authentication required.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MessageWithCode' } } },
        },
        NotFound: {
          description: 'Resource not found.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } },
        },
        BadRequest: {
          description: 'Invalid input.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } },
        },
        Conflict: {
          description: 'Conflict — resource already exists.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Registration, login, token management' },
      { name: 'Sessions', description: 'Refresh tokens and active session management' },
      { name: 'MFA', description: 'Multi-factor authentication (TOTP)' },
      { name: 'Password', description: 'Password reset flow' },
      { name: 'Admin · Users', description: 'User CRUD — requires admin role + step-up' },
      { name: 'Admin · Settings', description: 'Platform configuration — requires admin role + step-up' },
      { name: 'Admin · Audit Logs', description: 'Immutable audit trail — requires admin role + step-up' },
      { name: 'Admin · System Logs', description: 'Structured application logs — requires admin role + step-up' },
      { name: 'Health', description: 'Service health check' },
    ],
  },
  // Glob patterns pointing at all route files that contain @openapi JSDoc
  apis: [
    `${__dirname}/../routes/health.ts`,
    `${__dirname}/../routes/auth/*.ts`,
    `${__dirname}/../routes/admin/*.ts`,
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
