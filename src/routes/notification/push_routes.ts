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
	PushDeviceService,
	PushDeviceServiceError,
} from '../../services/notification/push_device_service';

import {
	successResponse,
} from '../../utils/response';

const pushRoutes =
	new Hono<AppEnv>();

pushRoutes.use(
	'*',
	authMiddleware,
);

// ============================================================
// POST /api/push/devices/register
// ============================================================

pushRoutes.post(
	'/devices/register',
	async (c) => {
		const service =
			new PushDeviceService(
				c.env.DB,
			);

		const body =
			await readJsonBody(
				c.req.raw,
			);

		await service.register(
			c.get('userId'),
			body,
		);

		return successResponse({
			success: true,
		});
	},
);

// ============================================================
// POST /api/push/devices/unregister
// ============================================================

pushRoutes.post(
	'/devices/unregister',
	async (c) => {
		const service =
			new PushDeviceService(
				c.env.DB,
			);

		const body =
			await readJsonBody(
				c.req.raw,
			);

		await service.unregister(
			c.get('userId'),
			body,
		);

		return successResponse({
			success: true,
		});
	},
);

async function readJsonBody(
	request: Request,
): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new PushDeviceServiceError(
			'Invalid JSON body',
			400,
		);
	}
}

export default pushRoutes;
