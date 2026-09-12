import { Hono } from 'hono';

import type {
  AppEnv,
} from './types/env';

import authRoutes
  from './routes/auth_routes';

import userRoutes
  from './routes/user_routes';

import {
  UserServiceError,
} from './services/user_service';

import {
  errorResponse,
} from './utils/response';

const app =
  new Hono<AppEnv>();

app.route(
  '/api/auth',
  authRoutes,
);

app.route(
  '/api/users',
  userRoutes,
);

app.notFound(() => {
  return errorResponse(
    'Not found',
    404,
  );
});

app.onError((error) => {
  if (
    error instanceof
    UserServiceError
  ) {
    return errorResponse(
      error.message,
      error.status,
    );
  }

  console.error(error);

  return errorResponse(
    'Internal server error',
    500,
  );
});

export default app;