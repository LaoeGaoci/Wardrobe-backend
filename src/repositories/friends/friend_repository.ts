import type {
	FriendRequestRow,
	FriendRequestWithUsersRow,
	FriendWithUserRow,
	FriendshipRow,
} from '../../types/friends/friend';

export class FriendRepository {
	constructor(
		private readonly db: D1Database,
	) { }

	// ============================================================
	// Friendships
	// ============================================================

	/**
	 * 判断 ownerId 是否已经把 friendId
	 * 作为好友。
	 *
	 * 因为好友关系建立时会创建双向记录，
	 * 所以正常情况下：
	 *
	 * A -> B
	 * B -> A
	 *
	 * 都会存在。
	 */
	async isFriend(
		ownerId: string,
		friendId: string,
	): Promise<boolean> {
		const row =
			await this.db
				.prepare(`
					SELECT 1 AS value
					FROM friendships
					WHERE owner_id = ?
					  AND friend_id = ?
					LIMIT 1
				`)
				.bind(
					ownerId,
					friendId,
				)
				.first<{
					value: number;
				}>();

		return row !== null;
	}

	/**
	 * 获取一条原始好友关系。
	 */
	async findFriendship(
		ownerId: string,
		friendId: string,
	): Promise<FriendshipRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						id,
						owner_id,
						friend_id,
						nickname,
						created_at
					FROM friendships
					WHERE owner_id = ?
					  AND friend_id = ?
					LIMIT 1
				`)
				.bind(
					ownerId,
					friendId,
				)
				.first<FriendshipRow>();

		return row ?? null;
	}

	/**
	 * 获取一个好友，同时 JOIN users，
	 * 用于返回完整 FriendRelation。
	 */
	async findFriendWithUser(
		ownerId: string,
		friendId: string,
	): Promise<FriendWithUserRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						f.id AS friendship_id,
						f.friend_id AS friend_id,
						f.nickname AS nickname,
						f.created_at AS friendship_created_at,

						u.username AS username,
						u.email AS email,
						u.avatar_url AS avatar_url

					FROM friendships f

					INNER JOIN users u
						ON u.id = f.friend_id

					WHERE f.owner_id = ?
					  AND f.friend_id = ?

					LIMIT 1
				`)
				.bind(
					ownerId,
					friendId,
				)
				.first<FriendWithUserRow>();

		return row ?? null;
	}

	/**
	 * 获取当前用户的全部好友。
	 *
	 * 直接 JOIN users，
	 * 防止 Flutter 出现：
	 *
	 * GET /friends
	 * GET /users/A
	 * GET /users/B
	 * GET /users/C
	 *
	 * 这种 N+1 请求。
	 */
	async findFriends(
		ownerId: string,
	): Promise<FriendWithUserRow[]> {
		const result =
			await this.db
				.prepare(`
					SELECT
						f.id AS friendship_id,
						f.friend_id AS friend_id,
						f.nickname AS nickname,
						f.created_at AS friendship_created_at,

						u.username AS username,
						u.email AS email,
						u.avatar_url AS avatar_url

					FROM friendships f

					INNER JOIN users u
						ON u.id = f.friend_id

					WHERE f.owner_id = ?

					ORDER BY
						CASE
							WHEN TRIM(f.nickname) != ''
							THEN f.nickname
							ELSE u.username
						END
						COLLATE NOCASE ASC
				`)
				.bind(
					ownerId,
				)
				.all<FriendWithUserRow>();

		return result.results ?? [];
	}

	/**
	 * 修改“我给好友设置的备注”。
	 *
	 * 只修改：
	 *
	 * currentUser -> friend
	 *
	 * 不修改：
	 *
	 * friend -> currentUser
	 */
	async updateRemark(
		ownerId: string,
		friendId: string,
		remark: string,
	): Promise<boolean> {
		const result =
			await this.db
				.prepare(`
					UPDATE friendships
					SET nickname = ?
					WHERE owner_id = ?
					  AND friend_id = ?
				`)
				.bind(
					remark,
					ownerId,
					friendId,
				)
				.run();

		return result.meta.changes > 0;
	}

	/**
	 * 删除好友。
	 *
	 * A 删除 B 后：
	 *
	 * A -> B
	 * B -> A
	 *
	 * 两行都需要删除。
	 */
	async deleteFriendshipPair(
		userA: string,
		userB: string,
	): Promise<boolean> {
		const result =
			await this.db
				.prepare(`
					DELETE FROM friendships
					WHERE
						(
							owner_id = ?
							AND friend_id = ?
						)
						OR
						(
							owner_id = ?
							AND friend_id = ?
						)
				`)
				.bind(
					userA,
					userB,
					userB,
					userA,
				)
				.run();

		return result.meta.changes > 0;
	}

	// ============================================================
	// Friend Requests
	// ============================================================

	/**
	 * 查询两个用户之间某个方向的
	 * pending 申请。
	 *
	 * sender -> receiver
	 */
	async findPendingRequest(
		senderId: string,
		receiverId: string,
	): Promise<FriendRequestRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						id,
						sender_id,
						receiver_id,
						message,
						status,
						created_at,
						updated_at
					FROM friend_requests
					WHERE sender_id = ?
					  AND receiver_id = ?
					  AND status = 'pending'
					ORDER BY created_at DESC
					LIMIT 1
				`)
				.bind(
					senderId,
					receiverId,
				)
				.first<FriendRequestRow>();

		return row ?? null;
	}

	/**
	 * 查询“当前用户收到的某一个 pending 申请”。
	 *
	 * 接受、拒绝时使用。
	 *
	 * receiver_id 必须等于 JWT 当前用户，
	 * 防止用户处理别人的申请。
	 */
	async findPendingReceivedRequest(
		requestId: string,
		receiverId: string,
	): Promise<FriendRequestRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						id,
						sender_id,
						receiver_id,
						message,
						status,
						created_at,
						updated_at
					FROM friend_requests
					WHERE id = ?
					  AND receiver_id = ?
					  AND status = 'pending'
					LIMIT 1
				`)
				.bind(
					requestId,
					receiverId,
				)
				.first<FriendRequestRow>();

		return row ?? null;
	}

	/**
	 * 查询“当前用户发送的某一个 pending 申请”。
	 *
	 * 取消申请时使用。
	 */
	async findPendingSentRequest(
		requestId: string,
		senderId: string,
	): Promise<FriendRequestRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						id,
						sender_id,
						receiver_id,
						message,
						status,
						created_at,
						updated_at
					FROM friend_requests
					WHERE id = ?
					  AND sender_id = ?
					  AND status = 'pending'
					LIMIT 1
				`)
				.bind(
					requestId,
					senderId,
				)
				.first<FriendRequestRow>();

		return row ?? null;
	}

	/**
	 * 查询一个申请，并 JOIN 发送者和接收者。
	 */
	async findRequestWithUsers(
		requestId: string,
	): Promise<FriendRequestWithUsersRow | null> {
		const row =
			await this.db
				.prepare(`
					SELECT
						fr.id,
						fr.sender_id,
						fr.receiver_id,
						fr.message,
						fr.status,
						fr.created_at,
						fr.updated_at,

						sender.username
							AS sender_username,
						sender.email
							AS sender_email,
						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,
						receiver.email
							AS receiver_email,
						receiver.avatar_url
							AS receiver_avatar_url

					FROM friend_requests fr

					INNER JOIN users sender
						ON sender.id = fr.sender_id

					INNER JOIN users receiver
						ON receiver.id = fr.receiver_id

					WHERE fr.id = ?

					LIMIT 1
				`)
				.bind(
					requestId,
				)
				.first<FriendRequestWithUsersRow>();

		return row ?? null;
	}

	/**
	 * 当前用户收到的所有 pending 申请。
	 */
	async findReceivedRequests(
		receiverId: string,
	): Promise<FriendRequestWithUsersRow[]> {
		const result =
			await this.db
				.prepare(`
					SELECT
						fr.id,
						fr.sender_id,
						fr.receiver_id,
						fr.message,
						fr.status,
						fr.created_at,
						fr.updated_at,

						sender.username
							AS sender_username,
						sender.email
							AS sender_email,
						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,
						receiver.email
							AS receiver_email,
						receiver.avatar_url
							AS receiver_avatar_url

					FROM friend_requests fr

					INNER JOIN users sender
						ON sender.id = fr.sender_id

					INNER JOIN users receiver
						ON receiver.id = fr.receiver_id

					WHERE fr.receiver_id = ?
					  AND fr.status = 'pending'

					ORDER BY fr.created_at DESC
				`)
				.bind(
					receiverId,
				)
				.all<FriendRequestWithUsersRow>();

		return result.results ?? [];
	}

	/**
	 * 当前用户发送的所有 pending 申请。
	 */
	async findSentRequests(
		senderId: string,
	): Promise<FriendRequestWithUsersRow[]> {
		const result =
			await this.db
				.prepare(`
					SELECT
						fr.id,
						fr.sender_id,
						fr.receiver_id,
						fr.message,
						fr.status,
						fr.created_at,
						fr.updated_at,

						sender.username
							AS sender_username,
						sender.email
							AS sender_email,
						sender.avatar_url
							AS sender_avatar_url,

						receiver.username
							AS receiver_username,
						receiver.email
							AS receiver_email,
						receiver.avatar_url
							AS receiver_avatar_url

					FROM friend_requests fr

					INNER JOIN users sender
						ON sender.id = fr.sender_id

					INNER JOIN users receiver
						ON receiver.id = fr.receiver_id

					WHERE fr.sender_id = ?
					  AND fr.status = 'pending'

					ORDER BY fr.created_at DESC
				`)
				.bind(
					senderId,
				)
				.all<FriendRequestWithUsersRow>();

		return result.results ?? [];
	}

	/**
	 * 创建好友申请。
	 */
	async createRequest(
		input: {
			id: string;
			senderId: string;
			receiverId: string;
			message: string;
			notificationId: string;
		},
	): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(`
				INSERT INTO friend_requests (
					id,
					sender_id,
					receiver_id,
					message,
					status
				)
				VALUES (
					?,
					?,
					?,
					?,
					'pending'
				)
			`)
				.bind(
					input.id,
					input.senderId,
					input.receiverId,
					input.message,
				),

			this.db
				.prepare(`
				INSERT INTO notifications (
					id,
					receiver_id,
					type,
					resource_id,
					sender_id
				)
				VALUES (
					?,
					?,
					'friend_request',
					?,
					?
				)
			`)
				.bind(
					input.notificationId,
					input.receiverId,
					input.id,
					input.senderId,
				),
		]);
	}

	/**
	 * 接受好友申请。
	 *
	 * 一次 batch 完成：
	 *
	 * 1. request pending -> accepted
	 * 2. receiver -> sender 好友关系
	 * 3. sender -> receiver 好友关系
	 *
	 * D1 batch 中的语句会按顺序执行。
	 *
	 * INSERT OR IGNORE：
	 * 防止因为异常数据重复创建好友关系。
	 */
	async acceptRequest(
		request: FriendRequestRow,
		firstFriendshipId: string,
		secondFriendshipId: string,
	): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(`
					UPDATE friend_requests
					SET
						status = 'accepted',
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ?
					  AND receiver_id = ?
					  AND status = 'pending'
				`)
				.bind(
					request.id,
					request.receiver_id,
				),

			this.db
				.prepare(`
					INSERT OR IGNORE
					INTO friendships (
						id,
						owner_id,
						friend_id,
						nickname
					)
					VALUES (?, ?, ?, '')
				`)
				.bind(
					firstFriendshipId,
					request.receiver_id,
					request.sender_id,
				),

			this.db
				.prepare(`
					INSERT OR IGNORE
					INTO friendships (
						id,
						owner_id,
						friend_id,
						nickname
					)
					VALUES (?, ?, ?, '')
				`)
				.bind(
					secondFriendshipId,
					request.sender_id,
					request.receiver_id,
				),
			this.db
				.prepare(`
					UPDATE notifications
					SET read_at =
						COALESCE(
							read_at,
							CURRENT_TIMESTAMP
						)
					WHERE type = 'friend_request'
					AND resource_id = ?
					AND receiver_id = ?
				`)
				.bind(
					request.id,
					request.receiver_id,
				),
		]);
	}

	/**
	 * 拒绝申请。
	 *
	 * 不删除历史记录，
	 * 只改成 rejected。
	 */
	async rejectRequest(
		requestId: string,
		receiverId: string,
	): Promise<boolean> {
		const result =
			await this.db
				.prepare(`
					UPDATE friend_requests
					SET
						status = 'rejected',
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ?
					  AND receiver_id = ?
					  AND status = 'pending'
				`)
				.bind(
					requestId,
					receiverId,
				)
				.run();

		return result.meta.changes > 0;
	}

	/**
	 * 取消自己发出的申请。
	 *
	 * 与接受/拒绝不同：
	 *
	 * “取消”表示发送者撤回，
	 * 所以直接删除 pending 记录。
	 */
	async cancelSentRequest(
		requestId: string,
		senderId: string,
	): Promise<boolean> {
		const result =
			await this.db
				.prepare(`
					DELETE FROM friend_requests
					WHERE id = ?
					  AND sender_id = ?
					  AND status = 'pending'
				`)
				.bind(
					requestId,
					senderId,
				)
				.run();

		return result.meta.changes > 0;
	}
}