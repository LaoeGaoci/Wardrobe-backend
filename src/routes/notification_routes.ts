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
  NotificationService,
  NotificationServiceError,
} from '../services/notification_service';

import {
  errorResponse,
  successResponse,
} from '../utils/response';

const notificationRoutes =
  new Hono<AppEnv>();

// ============================================================
// Authenticated notification routes
// ============================================================

notificationRoutes.use(
  '*',
  authMiddleware,
);

// ============================================================
// GET /api/notifications/cursor
// ============================================================

notificationRoutes.get(
  '/cursor',
  async (c) => {
    const service =
      new NotificationService(
        c.env.DB,
      );

    const cursor =
      await service
        .getCurrentCursor(
          c.get(
            'userId',
          ),
        );

    return successResponse({
      cursor,
    });
  },
);

// ============================================================
// GET /api/notifications/poll?afterSeq=123
// ============================================================

notificationRoutes.get(
  '/poll',
  async (c) => {
    const service =
      new NotificationService(
        c.env.DB,
      );

    const result =
      await service.poll(
        c.get(
          'userId',
        ),
        c.req.query(
          'afterSeq',
        ),
      );

    return successResponse(
      result,
    );
  },
);

// ============================================================
// PATCH /api/notifications/:notificationId/read
// ============================================================

notificationRoutes.patch(
  '/:notificationId/read',
  async (c) => {
    const service =
      new NotificationService(
        c.env.DB,
      );

    await service.markAsRead(
      c.get(
        'userId',
      ),
      c.req.param(
        'notificationId',
      ),
    );

    return successResponse({
      success: true,
    });
  },
);

// ============================================================
// Internal system-notification route
// ============================================================

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
        .sendSystemNotification(
          body,
        );

    return successResponse(
      result,
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

export default notificationRoutes;
