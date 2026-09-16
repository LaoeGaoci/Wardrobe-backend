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
	from './routes/user/auth_routes';

import userRoutes
	from './routes/user/user_routes';

import {
	clothingRoutes,
} from './routes/clothing/clothing_routes';

import friendRoutes
	from './routes/friends/friend_routes';

import recommendationRoutes
	from './routes/friends/recommendation_routes';

import pushRoutes
	from './routes/notification/push_routes';

import {
	internalNotificationRoutes,
} from './routes/notification/notification_routes';

// ============================================================
// Service Errors
// ============================================================

import {
	UserServiceError,
} from './services/user/user_service';

import {
	ClothingServiceError,
} from './services/clothing/clothing_service';

import {
	FriendServiceError,
} from './services/friends/friend_service';

import {
	RecommendationServiceError,
} from './services/friends/recommendation_service';

import {
	NotificationServiceError,
} from './services/notification/notification_service';

import {
	PushDeviceServiceError,
} from './services/notification/push_device_service';

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

/**
 * Flutter FCM device registration:
 *
 * POST /api/push/devices/register
 * POST /api/push/devices/unregister
 */
app.route(
	'/api/push',
	pushRoutes,
);

/**
 * Public notification polling routes were removed.
 *
 * Real-time notification delivery is now:
 * Cloudflare Worker -> FCM -> Android.
 *
 * D1 notifications remains the durable notification/event record.
 */
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
			PushDeviceServiceError
		) {
			return errorResponse(
				error.message,
				error.status,
			);
		}

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
