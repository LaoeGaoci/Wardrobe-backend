import {
	ClothingRepository,
} from '../repositories/clothing_repository';

import type {
	Clothing,
} from '../types/clothing';

import {
	ClothingServiceError,
	mapClothing,
} from './clothing_service';

const MAX_IMAGE_SIZE =
	10 * 1024 * 1024;

const IMAGE_EXTENSIONS:
	Record<string, string> = {
		'image/jpeg': 'jpg',

		'image/png': 'png',

		'image/webp': 'webp',
	};

export class ClothingImageService {
	private readonly repository:
		ClothingRepository;

	constructor(
		db: D1Database,

		private readonly bucket:
			R2Bucket,
	) {
		this.repository =
			new ClothingRepository(
				db,
			);
	}

	// ============================================================
	// Upload / Replace
	// ============================================================

	async uploadImage(
		userId: string,
		clothingId: string,
		value: unknown,
	): Promise<Clothing> {
		const clothing =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!clothing) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		if (
			!(value instanceof File)
		) {
			throw new ClothingServiceError(
				'Image file is required',
				400,
			);
		}

		const file = value;

		if (
			file.size <= 0
		) {
			throw new ClothingServiceError(
				'Image file is empty',
				400,
			);
		}

		if (
			file.size >
			MAX_IMAGE_SIZE
		) {
			throw new ClothingServiceError(
				'Image file is too large',
				413,
			);
		}

		const extension =
			IMAGE_EXTENSIONS[
				file.type
			];

		if (!extension) {
			throw new ClothingServiceError(
				'Unsupported image type',
				415,
			);
		}

		const oldImageKey =
			clothing.image_url;

		const newImageKey =
			[
				'clothing',
				userId,
				clothingId,
				`${crypto.randomUUID()}.${extension}`,
			].join('/');

		// 1. 先写入新的 R2 object。
		await this.bucket.put(
			newImageKey,
			file.stream(),
			{
				httpMetadata: {
					contentType:
						file.type,

					cacheControl:
						'private, max-age=3600',
				},

				customMetadata: {
					userId,

					clothingId,
				},
			},
		);

		try {
			// 2. D1 更新 object key。
			const updated =
				await this.repository
					.updateImageKey(
						clothingId,
						userId,
						newImageKey,
					);

			if (!updated) {
				throw new ClothingServiceError(
					'Clothing not found',
					404,
				);
			}
		} catch (error) {
			// D1 更新失败时清理刚刚写入的新对象。
			try {
				await this.bucket.delete(
					newImageKey,
				);
			} catch {
				// 保留原始错误。
			}

			throw error;
		}

		// 3. 新图已经成功关联数据库后，
		//    再尝试删除旧图。
		if (
			oldImageKey &&
			oldImageKey !==
				newImageKey
		) {
			try {
				await this.bucket.delete(
					oldImageKey,
				);
			} catch (error) {
				console.error(
					'Failed to delete old clothing image:',
					oldImageKey,
					error,
				);
			}
		}

		const updatedClothing =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!updatedClothing) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		return mapClothing(
			updatedClothing,
		);
	}

	// ============================================================
	// Read
	// ============================================================

	async getImage(
		userId: string,
		clothingId: string,
	): Promise<R2ObjectBody> {
		const clothing =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!clothing) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		if (!clothing.image_url) {
			throw new ClothingServiceError(
				'Clothing image not found',
				404,
			);
		}

		const object =
			await this.bucket.get(
				clothing.image_url,
			);

		if (!object) {
			throw new ClothingServiceError(
				'Clothing image not found',
				404,
			);
		}

		return object;
	}

	// ============================================================
	// Delete image only
	// ============================================================

	async deleteImage(
		userId: string,
		clothingId: string,
	): Promise<Clothing> {
		const clothing =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!clothing) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		const imageKey =
			clothing.image_url;

		if (!imageKey) {
			return mapClothing(
				clothing,
			);
		}

		const updated =
			await this.repository
				.updateImageKey(
					clothingId,
					userId,
					null,
				);

		if (!updated) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		try {
			await this.bucket.delete(
				imageKey,
			);
		} catch (error) {
			console.error(
				'Failed to delete clothing image:',
				imageKey,
				error,
			);
		}

		const result =
			await this.repository
				.findOwnedById(
					clothingId,
					userId,
				);

		if (!result) {
			throw new ClothingServiceError(
				'Clothing not found',
				404,
			);
		}

		return mapClothing(
			result,
		);
	}

	// ============================================================
	// Cleanup after deleting clothing
	// ============================================================

	async deleteImageByKey(
		imageKey: string | null,
	): Promise<void> {
		if (!imageKey) {
			return;
		}

		try {
			await this.bucket.delete(
				imageKey,
			);
		} catch (error) {
			console.error(
				'Failed to clean clothing image:',
				imageKey,
				error,
			);
		}
	}
}