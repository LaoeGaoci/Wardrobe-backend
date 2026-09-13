import {
	Hono,
} from 'hono';

import type {
	AppEnv,
} from '../types/env';

import {
	authMiddleware,
} from '../middleware/auth';

import {
	RecommendationService,
	RecommendationServiceError,
} from '../services/recommendation_service';

import {
	successResponse,
} from '../utils/response';

/**
 * 推荐系统 Router。
 */
const recommendationRoutes =
	new Hono<AppEnv>();

// ============================================================
// Authentication
// ============================================================

/**
 * 所有：
 *
 * /api/recommendations/*
 *
 * 都要求：
 *
 * Authorization:
 * Bearer <token>
 */
recommendationRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// POST /api/recommendations
//
// 发送推荐
// ============================================================

recommendationRoutes.post(
	'/',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const body =
			await readJsonBody(
				c.req.raw,
			);

		const recommendation =
			await service
				.sendRecommendation(
					c.get(
						'userId',
					),

					body,
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
//
// 首页堆叠未读推荐信
// ============================================================

recommendationRoutes.get(
	'/unread',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service
				.listUnread(
					c.get(
						'userId',
					),
				);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET /api/recommendations/unread-count
//
// 未读数量
// ============================================================

recommendationRoutes.get(
	'/unread-count',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const count =
			await service
				.getUnreadCount(
					c.get(
						'userId',
					),
				);

		return successResponse({
			count,
		});
	},
);

// ============================================================
// GET /api/recommendations/received
//
// 收到的推荐历史
// ============================================================

recommendationRoutes.get(
	'/received',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service
				.listReceived(
					c.get(
						'userId',
					),
				);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET /api/recommendations/sent
//
// 发出的推荐历史
// ============================================================

recommendationRoutes.get(
	'/sent',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendations =
			await service
				.listSent(
					c.get(
						'userId',
					),
				);

		return successResponse({
			recommendations,
		});
	},
);

// ============================================================
// GET
// /api/recommendations/:recommendationId/clothing/:clothingId/image
//
// 查看推荐历史中的衣物图片。
// ============================================================

recommendationRoutes.get(
	'/:recommendationId/clothing/:clothingId/image',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		/**
		 * Service 会检查：
		 *
		 * 1. recommendation 存在
		 *
		 * 2. recommendation_items
		 *    确实包含 clothingId
		 *
		 * 3. 当前用户是 sender
		 *    或 receiver
		 */
		const clothing =
			await service
				.getRecommendationClothingForImage(
					c.get(
						'userId',
					),

					c.req.param(
						'recommendationId',
					),

					c.req.param(
						'clothingId',
					),
				);

		if (
			!clothing.image_url
		) {
			throw new RecommendationServiceError(
				'Recommendation clothing image not found',
				404,
			);
		}

		/**
		 * clothing.image_url
		 * 实际保存 R2 object key。
		 */
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

			object.httpMetadata
				?.cacheControl ??
				'private, max-age=3600',
		);

		if (
			object.httpEtag
		) {
			headers.set(
				'ETag',
				object.httpEtag,
			);
		}

		headers.set(
			'Content-Length',
			String(
				object.size,
			),
		);

		return new Response(
			object.body,
			{
				status:
					200,

				headers,
			},
		);
	},
);

// ============================================================
// PATCH /api/recommendations/:id/read
//
// 标记已读。
// ============================================================

recommendationRoutes.patch(
	'/:id/read',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendation =
			await service
				.markAsRead(
					c.get(
						'userId',
					),

					c.req.param(
						'id',
					),
				);

		return successResponse({
			recommendation,
		});
	},
);

// ============================================================
// GET /api/recommendations/:id
//
// 推荐详情。
// ============================================================

/**
 * 这条动态路由放在：
 *
 * /unread
 * /received
 * /sent
 * /unread-count
 *
 * 之后，
 * 避免结构上产生歧义。
 */
recommendationRoutes.get(
	'/:id',
	async (c) => {
		const service =
			new RecommendationService(
				c.env.DB,
			);

		const recommendation =
			await service
				.getRecommendation(
					c.get(
						'userId',
					),

					c.req.param(
						'id',
					),
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