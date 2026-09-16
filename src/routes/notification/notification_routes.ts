import {
	Hono,
} from 'hono';

import type {
	AppEnv,
} from '../../types/env';

import {
	NotificationService,
	NotificationServiceError,
} from '../../services/notification/notification_service';

import {
	PushService,
} from '../../services/notification/push_service';

import {
	errorResponse,
	successResponse,
} from '../../utils/response';

/**
 * 现在通知的实时传输由 FCM 完成。
 *
 * 因此前端已经不再使用：
 * - GET /api/notifications/cursor
 * - GET /api/notifications/poll
 * - PATCH /api/notifications/:id/read
 *
 * 本文件只保留“系统公告发布”内部接口。
 */
export const internalNotificationRoutes =
	new Hono<AppEnv>();

internalNotificationRoutes.post(
	'/system',
	async (c) => {
		const secret =
			c.env
				.SYSTEM_NOTIFICATION_SECRET
				.trim();

		const authorization =
			c.req.header(
				'Authorization',
			);

		if (
			!secret ||
			authorization !==
				`Bearer ${secret}`
		) {
			return errorResponse(
				'Unauthorized',
				401,
			);
		}

		const body =
			await readJsonBody(
				c.req.raw,
			);

		const service =
			new NotificationService(
				c.env.DB,
			);

		const result =
			await service
				.createSystemNotification(
					body,
				);

		const push =
			new PushService(c.env);

		if (
			result.dispatch.kind ===
			'broadcast'
		) {
			c.executionCtx.waitUntil(
				push
					.sendSystemBroadcast({
						defaultText:
							result.dispatch
								.defaultText,
						translations:
							result.dispatch
								.translations,
					})
					.catch((error) => {
						console.error(
							'[SystemNotification] push failed',
							error,
						);
					}),
			);
		} else {
			c.executionCtx.waitUntil(
				push
					.sendSystemToUser({
						receiverId:
							result.dispatch
								.receiverId,
						notificationId:
							result.dispatch
								.notificationId,
						defaultText:
							result.dispatch
								.defaultText,
						translations:
							result.dispatch
								.translations,
					})
					.catch((error) => {
						console.error(
							'[SystemNotification] push failed',
							error,
						);
					}),
			);
		}

		return successResponse(
			{
				createdCount:
					result.createdCount,
			},
			201,
		);
	},
);

async function readJsonBody(
	request: Request,
): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new NotificationServiceError(
			'Invalid JSON body',
			400,
		);
	}
}
