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
	FriendService,
	FriendServiceError,
} from '../services/friend_service';

import {
	successResponse,
} from '../utils/response';

const IMAGE_CACHE_CONTROL =
	'private, max-age=31536000, immutable';

/**
 * 与 auth_routes / user_routes 风格统一，使用 default export。
 */
const friendRoutes =
	new Hono<AppEnv>();

// ============================================================
// Authentication
// ============================================================

/**
 * 好友系统所有接口都需要登录。
 * authMiddleware 会从 Authorization: Bearer <token>
 * 中取得 JWT，并把 userId 放入 c.get('userId')。
 */
friendRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// GET /api/friends
// 好友列表
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
// 好友状态
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
// 收到的好友申请
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
// 已发送的好友申请
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
// 发送好友申请
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
// 接受申请
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
// 拒绝申请
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
// 取消自己发出的申请
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
// 查看好友公开衣柜
// ============================================================

/**
 * 可选：
 * ?category=上衣
 * ?q=Uniqlo
 *
 * visibility 不允许由客户端控制，Service 永远固定为 public。
 */
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
// 获取好友公开衣物图片。
// ============================================================

friendRoutes.get(
	'/:friendId/clothing/:clothingId/image',
	async (c) => {
		const service =
			new FriendService(c.env.DB);

		/**
		 * 这里会检查：
		 * 1. 当前用户和 friendId 是好友
		 * 2. clothing 属于 friendId
		 * 3. clothing.visibility == public
		 */
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

		/**
		 * 通过 D1 中保存的 R2 object key 获取真正图片。
		 */
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

		// Flutter URL 使用 ?v=<updatedAt> 版本化，安全使用长缓存。
		// 强制覆盖旧 R2 object 里可能存在的 max-age=3600。
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
// 修改好友备注
// ============================================================

/**
 * Body:
 * {
 *   "remark": "妈妈"
 * }
 */
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
// 删除好友
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
