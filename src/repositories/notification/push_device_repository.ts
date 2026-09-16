import type {
	PushDeviceRow,
	PushLocale,
	PushPlatform,
} from '../../types/notification/push';

export class PushDeviceRepository {
	constructor(
		private readonly db: D1Database,
	) {}

	// ============================================================
	// Register / upsert
	// ============================================================

	async upsert(
		input: {
			id: string;
			userId: string;
			platform: PushPlatform;
			token: string;
			locale: PushLocale;
		},
	): Promise<void> {
		await this.db
			.prepare(`
				INSERT INTO push_devices (
					id,
					user_id,
					provider,
					platform,
					token,
					locale,
					created_at,
					updated_at
				)
				VALUES (
					?,
					?,
					'fcm',
					?,
					?,
					?,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				)
				ON CONFLICT(token)
				DO UPDATE SET
					user_id = excluded.user_id,
					provider = excluded.provider,
					platform = excluded.platform,
					locale = excluded.locale,
					updated_at = CURRENT_TIMESTAMP
			`)
			.bind(
				input.id,
				input.userId,
				input.platform,
				input.token,
				input.locale,
			)
			.run();
	}

	// ============================================================
	// Delete
	// ============================================================

	async deleteForUser(
		userId: string,
		token: string,
	): Promise<boolean> {
		const result =
			await this.db
				.prepare(`
					DELETE FROM push_devices
					WHERE user_id = ?
					  AND token = ?
				`)
				.bind(
					userId,
					token,
				)
				.run();

		return result.meta.changes > 0;
	}

	async deleteByToken(
		token: string,
	): Promise<void> {
		await this.db
			.prepare(`
				DELETE FROM push_devices
				WHERE token = ?
			`)
			.bind(token)
			.run();
	}

	// ============================================================
	// Query
	// ============================================================

	async findByUserId(
		userId: string,
	): Promise<PushDeviceRow[]> {
		const result =
			await this.db
				.prepare(`
					SELECT
						id,
						user_id,
						provider,
						platform,
						token,
						locale,
						created_at,
						updated_at
					FROM push_devices
					WHERE user_id = ?
					  AND provider = 'fcm'
					ORDER BY updated_at DESC
				`)
				.bind(userId)
				.all<PushDeviceRow>();

		return result.results ?? [];
	}

	async findAll(): Promise<
		PushDeviceRow[]
	> {
		const result =
			await this.db
				.prepare(`
					SELECT
						id,
						user_id,
						provider,
						platform,
						token,
						locale,
						created_at,
						updated_at
					FROM push_devices
					WHERE provider = 'fcm'
					ORDER BY updated_at DESC
				`)
				.all<PushDeviceRow>();

		return result.results ?? [];
	}
}
