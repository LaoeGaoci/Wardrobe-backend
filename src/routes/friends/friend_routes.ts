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
	FriendService,
	FriendServiceError,
} from '../../services/friends/friend_service';

import {
	PushService,
} from '../../services/notification/push_service';

import {
	successResponse,
} from '../../utils/response';

const IMAGE_CACHE_CONTROL =
	'private, max-age=31536000, immutable';

const friendRoutes =
	new Hono<AppEnv>();

// ============================================================
// Authentication
// ============================================================

friendRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// GET /api/friends
// ============================================================

friendRoutes.get(
	'/',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const friends =
			await service.listFriends(
				c.get('userId'),
			);

		return successResponse({
			friends,
		});
	},
);

// ============================================================
// GET /api/friends/status/:userId
// ============================================================

friendRoutes.get(
	'/status/:userId',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const status =
			await service.getFriendStatus(
				c.get('userId'),
				c.req.param('userId'),
			);

		return successResponse({
			status,
		});
	},
);

// ============================================================
// GET /api/friends/requests/received
// ============================================================

friendRoutes.get(
	'/requests/received',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const requests =
			await service.listReceivedRequests(
				c.get('userId'),
			);

		return successResponse({
			requests,
		});
	},
);

// ============================================================
// GET /api/friends/requests/sent
// ============================================================

friendRoutes.get(
	'/requests/sent',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const requests =
			await service.listSentRequests(
				c.get('userId'),
			);

		return successResponse({
			requests,
		});
	},
);

// ============================================================
// POST /api/friends/requests
// ============================================================

friendRoutes.post(
	'/requests',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const body =
			await readJsonBody(c.req.raw);

		const request =
			await service.sendFriendRequest(
				c.get('userId'),
				body,
			);

		/**
		 * 业务写入成功后再异步发送 Push。
		 *
		 * Push 失败不能回滚好友申请，也不能让 API 返回失败。
		 */
		const push =
			new PushService(c.env);

		c.executionCtx.waitUntil(
			push
				.sendFriendRequest({
					receiverId:
						request.toUser.id,
					senderUsername:
						request.fromUser
							.username,
					resourceId:
						request.id,
				})
				.catch((error) => {
					console.error(
						'[FriendRequest] push failed',
						error,
					);
				}),
		);

		return successResponse(
			{
				request,
			},
			201,
		);
	},
);

// ============================================================
// POST /api/friends/requests/:requestId/accept
// ============================================================

friendRoutes.post(
	'/requests/:requestId/accept',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const friend =
			await service.acceptFriendRequest(
				c.get('userId'),
				c.req.param('requestId'),
			);

		return successResponse({
			friend,
		});
	},
);

// ============================================================
// POST /api/friends/requests/:requestId/reject
// ============================================================

friendRoutes.post(
	'/requests/:requestId/reject',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		await service.rejectFriendRequest(
			c.get('userId'),
			c.req.param('requestId'),
		);

		return successResponse({
			success: true,
		});
	},
);

// ============================================================
// DELETE /api/friends/requests/:requestId
// ============================================================

friendRoutes.delete(
	'/requests/:requestId',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		await service.cancelFriendRequest(
			c.get('userId'),
			c.req.param('requestId'),
		);

		return successResponse({
			success: true,
		});
	},
);

// ============================================================
// GET /api/friends/:friendId/clothing
// ============================================================

friendRoutes.get(
	'/:friendId/clothing',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const clothes =
			await service.listFriendClothing(
				c.get('userId'),
				c.req.param('friendId'),
				{
					category:
						c.req.query('category'),
					query:
						c.req.query('q'),
				},
			);

		return successResponse({
			clothes,
		});
	},
);

// ============================================================
// GET /api/friends/:friendId/clothing/:clothingId/image
// ============================================================

friendRoutes.get(
	'/:friendId/clothing/:clothingId/image',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const clothing =
			await service.getFriendPublicClothing(
				c.get('userId'),
				c.req.param('friendId'),
				c.req.param('clothingId'),
			);

		if (!clothing.image_url) {
			throw new FriendServiceError(
				'Clothing image not found',
				404,
			);
		}

		const object =
			await c.env.IMAGES.get(
				clothing.image_url,
			);

		if (!object) {
			throw new FriendServiceError(
				'Clothing image not found',
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
// PATCH /api/friends/:friendId
// ============================================================

friendRoutes.patch(
	'/:friendId',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		const body =
			await readJsonBody(c.req.raw);

		const friend =
			await service.updateRemark(
				c.get('userId'),
				c.req.param('friendId'),
				body,
			);

		return successResponse({
			friend,
		});
	},
);

// ============================================================
// DELETE /api/friends/:friendId
// ============================================================

friendRoutes.delete(
	'/:friendId',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		await service.removeFriend(
			c.get('userId'),
			c.req.param('friendId'),
		);

		return successResponse({
			success: true,
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
		throw new FriendServiceError(
			'Invalid JSON body',
			400,
		);
	}
}

export default friendRoutes;
