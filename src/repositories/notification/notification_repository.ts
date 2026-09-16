import type {
	PushNotificationType,
} from '../../types/notification/push';

export class NotificationRepository {
	constructor(
		private readonly db: D1Database,
	) {}

	// ============================================================
	// Resource notification lookup
	// ============================================================

	/**
	 * friend_request notification 由现有 FriendRepository
	 * 与好友申请一起写入同一 D1 batch；
	 * recommendation notification 由现有 D1 trigger 创建。
	 *
	 * PushService 使用这里取得 notificationId，
	 * 再把它放进 FCM data payload。
	 */
	async findIdByResource(
		receiverId: string,
		type: Exclude<
			PushNotificationType,
			'system_notification'
		>,
		resourceId: string,
	): Promise<string | null> {
		const row =
			await this.db
				.prepare(`
					SELECT id
					FROM notifications
					WHERE receiver_id = ?
					  AND type = ?
					  AND resource_id = ?
					LIMIT 1
				`)
				.bind(
					receiverId,
					type,
					resourceId,
				)
				.first<{
					id: string;
				}>();

		return row?.id ?? null;
	}

	// ============================================================
	// System notification persistence
	// ============================================================

	async createSystemForUser(
		input: {
			id: string;
			receiverId: string;
			title: string;
			message: string;
		},
	): Promise<void> {
		await this.db
			.prepare(`
				INSERT INTO notifications (
					id,
					receiver_id,
					type,
					resource_id,
					sender_id,
					title,
					message
				)
				VALUES (
					?,
					?,
					'system_notification',
					NULL,
					NULL,
					?,
					?
				)
			`)
			.bind(
				input.id,
				input.receiverId,
				input.title,
				input.message,
			)
			.run();
	}

	async broadcastSystem(
		title: string,
		message: string,
	): Promise<number> {
		const result =
			await this.db
				.prepare(`
					INSERT INTO notifications (
						id,
						receiver_id,
						type,
						resource_id,
						sender_id,
						title,
						message
					)
					SELECT
						lower(hex(randomblob(16))),
						id,
						'system_notification',
						NULL,
						NULL,
						?,
						?
					FROM users
				`)
				.bind(
					title,
					message,
				)
				.run();

		return result.meta.changes;
	}
}
