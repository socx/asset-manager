// Sets required environment variables before any module (including env.ts) is loaded in tests.
process.env['NODE_ENV'] = 'test';
process.env['APP_BASE_URL'] = 'http://localhost:5173';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/asset_manager_test';
process.env['JWT_ACCESS_SECRET'] = 'test_jwt_secret_that_is_at_least_32_characters_long';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['SELF_REGISTRATION_ENABLED'] = 'true';
