import {
	Hono,
} from 'hono';

import type {
	AppEnv,
} from '../../types/env';

import {
	authMiddleware,
} from '../../middleware/auth';

import {
	RecommendationService,
	RecommendationServiceError,
} from '../../services/friends/recommendation_service';

import {
	PushService,
} from '../../services/notification/push_service';

import {
	successResponse,
} from '../../utils/response';

const IMAGE_CACHE_CONTROL =
	'private, max-age=31536000, immutable';

const recommendationRoutes =
	new Hono<AppEnv>();

// ============================================================
// Authentication
// ============================================================

recommendationRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// POST /api/recommendations
// ============================================================

recommendationRoutes.post(
	'/',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const body =
			await readJsonBody(c.req.raw);

		const recommendation =
			await service.sendRecommendation(
				c.get('userId'),
				body,
			);

		/**
		 * 推荐写入 D1 后再异步发送 FCM。
		 * Push 失败不影响推荐本身的创建结果。
		 */
		const push =
			new PushService(c.env);

		c.executionCtx.waitUntil(
			push
				.sendRecommendation({
					receiverId:
						recommendation
							.toUser.id,
					senderUsername:
						recommendation
							.fromUser
							.username,
					resourceId:
						recommendation.id,
				})
				.catch((error) => {
					console.error(
						'[Recommendation] push failed',
						error,
					);
				}),
		);

		return successResponse(
			{
				recommendation,
			},
			201,
		);
	},
);

// ============================================================
// GET /api/recommendations/unread
// ============================================================

recommendationRoutes.get(
	'/unread',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service.listUnread(
				c.get('userId'),
			);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET /api/recommendations/unread-count
// ============================================================

recommendationRoutes.get(
	'/unread-count',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const count =
			await service.getUnreadCount(
				c.get('userId'),
			);

		return successResponse({
			count,
		});
	},
);

// ============================================================
// GET /api/recommendations/received
// ============================================================

recommendationRoutes.get(
	'/received',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service.listReceived(
				c.get('userId'),
			);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET /api/recommendations/sent
// ============================================================

recommendationRoutes.get(
	'/sent',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service.listSent(
				c.get('userId'),
			);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET /api/recommendations/:recommendationId/clothing/:clothingId/image
// ============================================================

recommendationRoutes.get(
	'/:recommendationId/clothing/:clothingId/image',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const clothing =
			await service
				.getRecommendationClothingForImage(
					c.get('userId'),
					c.req.param(
						'recommendationId',
					),
					c.req.param(
						'clothingId',
					),
				);

		if (!clothing.image_url) {
			throw new RecommendationServiceError(
				'Recommendation clothing image not found',
				404,
			);
		}

		const object =
			await c.env.IMAGES.get(
				clothing.image_url,
			);

		if (!object) {
			throw new RecommendationServiceError(
				'Recommendation clothing image not found',
				404,
			);
		}

		const headers =
			new Headers();

		headers.set(
			'Content-Type',
			object.httpMetadata
				?.contentType ??
				'application/octet-stream',
		);

		headers.set(
			'Cache-Control',
			IMAGE_CACHE_CONTROL,
		);

		if (object.httpEtag) {
			headers.set(
				'ETag',
				object.httpEtag,
			);
		}

		headers.set(
			'Content-Length',
			String(object.size),
		);

		return new Response(
			object.body,
			{
				status: 200,
				headers,
			},
		);
	},
);

// ============================================================
// PATCH /api/recommendations/:id/read
// ============================================================

recommendationRoutes.patch(
	'/:id/read',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendation =
			await service.markAsRead(
				c.get('userId'),
				c.req.param('id'),
			);

		return successResponse({
			recommendation,
		});
	},
);

// ============================================================
// GET /api/recommendations/:id
// ============================================================

recommendationRoutes.get(
	'/:id',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendation =
			await service.getRecommendation(
				c.get('userId'),
				c.req.param('id'),
			);

		return successResponse({
			recommendation,
		});
	},
);

// ============================================================
// JSON helper
// ============================================================

async function readJsonBody(
	request: Request,
): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new RecommendationServiceError(
			'Invalid JSON body',
			400,
		);
	}
}

export default recommendationRoutes;
