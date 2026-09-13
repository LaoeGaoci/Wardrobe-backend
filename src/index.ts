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

/**
 * 用户认证：
 *
 * /api/auth/*
 */
app.route(
	'/api/auth',
	authRoutes,
);

/**
 * 用户模块：
 *
 * /api/users/*
 */
app.route(
	'/api/users',
	userRoutes,
);

/**
 * 当前用户自己的衣柜：
 *
 * /api/clothing/*
 */
app.route(
	'/api/clothing',
	clothingRoutes,
);

/**
 * 好友系统：
 *
 * /api/friends/*
 */
app.route(
	'/api/friends',
	friendRoutes,
);

/**
 * 推荐系统：
 *
 * /api/recommendations/*
 */
app.route(
	'/api/recommendations',
	recommendationRoutes,
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
		/**
		 * 推荐系统业务错误。
		 */
		if (
			error instanceof
			RecommendationServiceError
		) {
			return errorResponse(
				error.message,
				error.status,
			);
		}

		/**
		 * 好友模块业务错误。
		 */
		if (
			error instanceof
			FriendServiceError
		) {
			return errorResponse(
				error.message,
				error.status,
			);
		}

		/**
		 * 衣柜模块业务错误。
		 */
		if (
			error instanceof
			ClothingServiceError
		) {
			return errorResponse(
				error.message,
				error.status,
			);
		}

		/**
		 * 用户模块业务错误。
		 */
		if (
			error instanceof
			UserServiceError
		) {
			return errorResponse(
				error.message,
				error.status,
			);
		}

		/**
		 * 未知异常不要直接返回给客户端。
		 */
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