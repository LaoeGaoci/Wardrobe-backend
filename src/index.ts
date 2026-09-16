import {
  Hono,
} from 'hono';

import type {
  AppEnv,
} from './types/env';

// ============================================================
// Routes
// ============================================================

import authRoutes
  from './routes/auth_routes';

import userRoutes
  from './routes/user_routes';

import {
  clothingRoutes,
} from './routes/clothing_routes';

import friendRoutes
  from './routes/friend_routes';

import recommendationRoutes
  from './routes/recommendation_routes';

import notificationRoutes, {
  internalNotificationRoutes,
} from './routes/notification_routes';

// ============================================================
// Service Errors
// ============================================================

import {
  UserServiceError,
} from './services/user_service';

import {
  ClothingServiceError,
} from './services/clothing_service';

import {
  FriendServiceError,
} from './services/friend_service';

import {
  RecommendationServiceError,
} from './services/recommendation_service';

import {
  NotificationServiceError,
} from './services/notification_service';

// ============================================================
// Utils
// ============================================================

import {
  errorResponse,
} from './utils/response';

// ============================================================
// App
// ============================================================

const app =
  new Hono<AppEnv>();

// ============================================================
// Register routes
// ============================================================

app.route(
  '/api/auth',
  authRoutes,
);

app.route(
  '/api/users',
  userRoutes,
);

app.route(
  '/api/clothing',
  clothingRoutes,
);

app.route(
  '/api/friends',
  friendRoutes,
);

app.route(
  '/api/recommendations',
  recommendationRoutes,
);

app.route(
  '/api/notifications',
  notificationRoutes,
);

app.route(
  '/api/internal/notifications',
  internalNotificationRoutes,
);

// ============================================================
// 404
// ============================================================

app.notFound(() => {
  return errorResponse(
    'Not found',
    404,
  );
});

// ============================================================
// Global error handler
// ============================================================

app.onError(
  (error) => {
    if (
      error instanceof
      NotificationServiceError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      RecommendationServiceError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      FriendServiceError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      ClothingServiceError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      UserServiceError
    ) {
      return errorResponse(
        error.message,
        error.status,
      );
    }

    console.error(
      error,
    );

    return errorResponse(
      'Internal server error',
      500,
    );
  },
);

export default app;
