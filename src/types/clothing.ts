export type ClothingVisibility =
	| 'public'
	| 'private';

/**
 * D1 clothing 表原始行。
 */
export interface ClothingRow {
	id: string;

	owner_id: string;

	name: string;

	brand: string | null;

	category: string;

	color: string;

	season: string;

	price: number | null;

	/**
	 * 当前数据库字段虽然叫 image_url，
	 * 实际保存的是 R2 object key。
	 *
	 * 例如：
	 *
	 * clothing/<userId>/<clothingId>/<uuid>.jpg
	 */
	image_url: string | null;

	visibility: ClothingVisibility;

	created_at: string;

	updated_at: string;
}

/**
 * 返回给 Flutter 的 Clothing DTO。
 */
export interface Clothing {
	id: string;

	ownerId: string;

	name: string;

	brand: string | null;

	category: string;

	color: string;

	season: string;

	price: number | null;

	/**
	 * Flutter 最终请求：
	 *
	 * GET /api/clothing/:id/image
	 */
	imageUrl: string;

	visibility: ClothingVisibility;

	createdAt: string;

	updatedAt: string;
}

/**
 * Repository 创建衣物时使用。
 */
export interface CreateClothingRecord {
	id: string;

	ownerId: string;

	name: string;

	brand: string | null;

	category: string;

	color: string;

	season: string;

	price: number | null;

	imageKey: string | null;

	visibility: ClothingVisibility;
}

/**
 * Repository 更新衣物时使用。
 *
 * Service 会把 PATCH 与当前值合并，
 * 所以传进 Repository 时已经是完整数据。
 */
export interface UpdateClothingRecord {
	name: string;

	brand: string | null;

	category: string;

	color: string;

	season: string;

	price: number | null;

	visibility: ClothingVisibility;
}

export interface ClothingListFilters {
	category?: string;

	query?: string;

	visibility?: ClothingVisibility;
}