import type {
	ClothingListFilters,
	ClothingRow,
	CreateClothingRecord,
	UpdateClothingRecord,
} from '../types/clothing';

export class ClothingRepository {
	constructor(
		private readonly db: D1Database,
	) {}

	// ============================================================
	// Query
	// ============================================================

	async findOwnedById(
		id: string,
		ownerId: string,
	): Promise<ClothingRow | null> {
		const row = await this.db
			.prepare(`
				SELECT
					id,
					owner_id,
					location,
					brand,
					category,
					color,
					season,
					price,
					image_url,
					visibility,
					created_at,
					updated_at
				FROM clothing
				WHERE id = ?
				  AND owner_id = ?
				LIMIT 1
			`)
			.bind(
				id,
				ownerId,
			)
			.first<ClothingRow>();

		return row ?? null;
	}

	async findAllOwned(
		ownerId: string,
		filters: ClothingListFilters = {},
	): Promise<ClothingRow[]> {
		const conditions: string[] = [
			'owner_id = ?',
		];

		const bindings:
			(string | number | null)[] = [
				ownerId,
			];

		if (filters.category) {
			conditions.push(
				'category = ?',
			);

			bindings.push(
				filters.category,
			);
		}

		if (filters.visibility) {
			conditions.push(
				'visibility = ?',
			);

			bindings.push(
				filters.visibility,
			);
		}

		if (filters.query) {
			conditions.push(`
				(
					LOWER(location) LIKE ?
					OR
					LOWER(COALESCE(brand, '')) LIKE ?
				)
			`);

			const query =
				`%${filters.query.toLowerCase()}%`;

			bindings.push(
				query,
				query,
			);
		}

		const sql = `
			SELECT
				id,
				owner_id,
				location,
				brand,
				category,
				color,
				season,
				price,
				image_url,
				visibility,
				created_at,
				updated_at
			FROM clothing
			WHERE ${conditions.join(' AND ')}
			ORDER BY created_at DESC
			LIMIT 500
		`;

		const result = await this.db
			.prepare(sql)
			.bind(
				...bindings,
			)
			.all<ClothingRow>();

		return result.results ?? [];
	}

	// ============================================================
	// Create
	// ============================================================

	async create(
		input: CreateClothingRecord,
	): Promise<void> {
		await this.db
			.prepare(`
				INSERT INTO clothing (
					id,
					owner_id,
					location,
					brand,
					category,
					color,
					season,
					price,
					image_url,
					visibility
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.bind(
				input.id,
				input.ownerId,
				input.location,
				input.brand,
				input.category,
				input.color,
				input.season,
				input.price,
				input.imageKey,
				input.visibility,
			)
			.run();
	}

	// ============================================================
	// Update metadata
	// ============================================================

	async updateOwned(
		id: string,
		ownerId: string,
		input: UpdateClothingRecord,
	): Promise<boolean> {
		const result = await this.db
			.prepare(`
				UPDATE clothing
				SET
					location = ?,
					brand = ?,
					category = ?,
					color = ?,
					season = ?,
					price = ?,
					visibility = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
				  AND owner_id = ?
			`)
			.bind(
				input.location,
				input.brand,
				input.category,
				input.color,
				input.season,
				input.price,
				input.visibility,
				id,
				ownerId,
			)
			.run();

		return result.meta.changes > 0;
	}

	// ============================================================
	// Update image
	// ============================================================

	async updateImageKey(
		id: string,
		ownerId: string,
		imageKey: string | null,
	): Promise<boolean> {
		const result = await this.db
			.prepare(`
				UPDATE clothing
				SET
					image_url = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
				  AND owner_id = ?
			`)
			.bind(
				imageKey,
				id,
				ownerId,
			)
			.run();

		return result.meta.changes > 0;
	}

	// ============================================================
	// Delete
	// ============================================================

	async deleteOwned(
		id: string,
		ownerId: string,
	): Promise<boolean> {
		const result = await this.db
			.prepare(`
				DELETE FROM clothing
				WHERE id = ?
				  AND owner_id = ?
			`)
			.bind(
				id,
				ownerId,
			)
			.run();

		return result.meta.changes > 0;
	}
}
