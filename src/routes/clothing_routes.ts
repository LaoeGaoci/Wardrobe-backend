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
	ClothingService,
	ClothingServiceError,
} from '../services/clothing_service';

import {
	ClothingImageService,
} from '../services/clothing_image_service';

export const clothingRoutes =
	new Hono<AppEnv>();

// ============================================================
// Authentication
// ============================================================

clothingRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// List
// ============================================================

/**
 * GET /api/clothing
 *
 * Optional:
 *
 * ?category=上衣
 * ?q=Uniqlo
 * ?visibility=private
 */
clothingRoutes.get(
	'/',
	async (c) => {
		const service =
			new ClothingService(
				c.env.DB,
			);

		const clothes =
			await service
				.listOwnedClothing(
					c.get('userId'),
					{
						category:
							c.req.query(
								'category',
							),

						query:
							c.req.query(
								'q',
							),

						visibility:
							c.req.query(
								'visibility',
							),
					},
				);

		return c.json({
			clothes,
		});
	},
);

// ============================================================
// Create
// ============================================================

/**
 * POST /api/clothing
 */
clothingRoutes.post(
	'/',
	async (c) => {
		const service =
			new ClothingService(
				c.env.DB,
			);

		const body =
			await readJsonBody(
				c,
			);

		const clothing =
			await service
				.createClothing(
					c.get('userId'),
					body,
				);

		return c.json(
			{
				clothing,
			},
			201,
		);
	},
);

// ============================================================
// Image
// ============================================================

/**
 * GET /api/clothing/:id/image
 */
clothingRoutes.get(
	'/:id/image',
	async (c) => {
		const service =
			new ClothingImageService(
				c.env.DB,
				c.env.IMAGES,
			);

		const object =
			await service.getImage(
				c.get('userId'),
				c.req.param('id'),
			);

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

		if (object.httpEtag) {
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
				status: 200,
				headers,
			},
		);
	},
);

/**
 * PUT /api/clothing/:id/image
 *
 * multipart/form-data
 *
 * field:
 *
 * image
 */
clothingRoutes.put(
	'/:id/image',
	async (c) => {
		const service =
			new ClothingImageService(
				c.env.DB,
				c.env.IMAGES,
			);

		let formData:
			FormData;

		try {
			formData =
				await c.req
					.raw
					.formData();
		} catch {
			throw new ClothingServiceError(
				'Invalid multipart form data',
				400,
			);
		}

		const image =
			formData.get(
				'image',
			);

		const clothing =
			await service
				.uploadImage(
					c.get('userId'),
					c.req.param('id'),
					image,
				);

		return c.json({
			clothing,
		});
	},
);

/**
 * DELETE /api/clothing/:id/image
 */
clothingRoutes.delete(
	'/:id/image',
	async (c) => {
		const service =
			new ClothingImageService(
				c.env.DB,
				c.env.IMAGES,
			);

		const clothing =
			await service
				.deleteImage(
					c.get('userId'),
					c.req.param('id'),
				);

		return c.json({
			clothing,
		});
	},
);

// ============================================================
// Detail
// ============================================================

/**
 * GET /api/clothing/:id
 */
clothingRoutes.get(
	'/:id',
	async (c) => {
		const service =
			new ClothingService(
				c.env.DB,
			);

		const clothing =
			await service
				.getOwnedClothing(
					c.get('userId'),
					c.req.param('id'),
				);

		return c.json({
			clothing,
		});
	},
);

// ============================================================
// Edit clothing card
// ============================================================

/**
 * PATCH /api/clothing/:id
 *
 * 可部分修改：
 *
 * name
 * brand
 * category
 * color
 * season
 * price
 * visibility
 */
clothingRoutes.patch(
	'/:id',
	async (c) => {
		const service =
			new ClothingService(
				c.env.DB,
			);

		const body =
			await readJsonBody(
				c,
			);

		const clothing =
			await service
				.updateClothing(
					c.get('userId'),
					c.req.param('id'),
					body,
				);

		return c.json({
			clothing,
		});
	},
);

// ============================================================
// Delete clothing
// ============================================================

/**
 * DELETE /api/clothing/:id
 */
clothingRoutes.delete(
	'/:id',
	async (c) => {
		const clothingService =
			new ClothingService(
				c.env.DB,
			);

		const imageService =
			new ClothingImageService(
				c.env.DB,
				c.env.IMAGES,
			);

		/**
		 * 先取得删除前的 image key，
		 * 再删除 D1 row。
		 */
		const deleted =
			await clothingService
				.deleteClothing(
					c.get('userId'),
					c.req.param('id'),
				);

		/**
		 * 数据库成功删除后再清理 R2。
		 *
		 * R2 清理失败不会让已经完成的
		 * D1 删除回滚。
		 */
		await imageService
			.deleteImageByKey(
				deleted.image_url,
			);

		return c.json({
			success: true,
		});
	},
);

// ============================================================
// Helpers
// ============================================================

async function readJsonBody(
	c: {
		req: {
			json<T>(): Promise<T>;
		};
	},
): Promise<unknown> {
	try {
		return await c.req
			.json<unknown>();
	} catch {
		throw new ClothingServiceError(
			'Invalid JSON body',
			400,
		);
	}
}