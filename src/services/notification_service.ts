import {
  NotificationRepository,
} from '../repositories/notification_repository';

import {
  UserRepository,
} from '../repositories/user_repository';

import {
  generateId,
} from '../utils/id';

import type {
  AppNotification,
  NotificationPollResult,
  NotificationWithSenderRow,
} from '../types/notification';

const POLL_LIMIT =
  100;

const TITLE_MAX_LENGTH =
  100;

const MESSAGE_MAX_LENGTH =
  1000;

export class NotificationService {
  private readonly repository:
    NotificationRepository;

  private readonly userRepository:
    UserRepository;

  constructor(
    db: D1Database,
  ) {
    this.repository =
      new NotificationRepository(
        db,
      );

    this.userRepository =
      new UserRepository(
        db,
      );
  }

  // ==========================================================
  // Cursor
  // ==========================================================

  async getCurrentCursor(
    currentUserId: string,
  ): Promise<number> {
    return this.repository
      .getLatestSeq(
        currentUserId,
      );
  }

  // ==========================================================
  // Poll
  // ==========================================================

  async poll(
    currentUserId: string,
    rawAfterSeq:
      string | undefined,
  ): Promise<
    NotificationPollResult
  > {
    const afterSeq =
      parseCursor(
        rawAfterSeq,
      );

    const rows =
      await this.repository
        .scanAfter(
          currentUserId,
          afterSeq,
          POLL_LIMIT,
        );

    const nextCursor =
      rows.length === 0
        ? afterSeq
        : rows[
            rows.length - 1
          ].seq;

    const notifications =
      rows
        .filter(
          (row) =>
            row.read_at ===
            null,
        )
        .map(
          (row) =>
            this.mapNotification(
              row,
            ),
        );

    return {
      notifications,
      nextCursor,
    };
  }

  // ==========================================================
  // Read
  // ==========================================================

  async markAsRead(
    currentUserId: string,
    notificationId: string,
  ): Promise<void> {
    const id =
      notificationId.trim();

    if (!id) {
      throw new NotificationServiceError(
        'Notification id is required',
        400,
      );
    }

    const updated =
      await this.repository
        .markRead(
          currentUserId,
          id,
        );

    if (!updated) {
      throw new NotificationServiceError(
        'Notification not found',
        404,
      );
    }
  }

  // ==========================================================
  // Internal system notification
  // ==========================================================

  async sendSystemNotification(
    input: unknown,
  ): Promise<{
    createdCount: number;
  }> {
    const body =
      requireObject(
        input,
      );

    const title =
      requireText(
        body.title,
        'Title is required',
      );

    const message =
      requireText(
        body.message,
        'Message is required',
      );

    if (
      title.length >
      TITLE_MAX_LENGTH
    ) {
      throw new NotificationServiceError(
        `Title must be at most ${TITLE_MAX_LENGTH} characters`,
        400,
      );
    }

    if (
      message.length >
      MESSAGE_MAX_LENGTH
    ) {
      throw new NotificationServiceError(
        `Message must be at most ${MESSAGE_MAX_LENGTH} characters`,
        400,
      );
    }

    const broadcast =
      body.broadcast === true;

    const receiverId =
      optionalText(
        body.receiverId,
      );

    // Exactly one target mode is required.
    if (
      broadcast ===
      (receiverId !== null)
    ) {
      throw new NotificationServiceError(
        'Specify either broadcast=true or receiverId',
        400,
      );
    }

    if (broadcast) {
      const createdCount =
        await this.repository
          .broadcastSystem(
            title,
            message,
          );

      return {
        createdCount,
      };
    }

    const exists =
      await this.userRepository
        .existsById(
          receiverId!,
        );

    if (!exists) {
      throw new NotificationServiceError(
        'User not found',
        404,
      );
    }

    await this.repository
      .createSystemForUser({
        id:
          generateId(),

        receiverId:
          receiverId!,

        title,

        message,
      });

    return {
      createdCount: 1,
    };
  }

  // ==========================================================
  // Mapper
  // ==========================================================

  private mapNotification(
    row:
      NotificationWithSenderRow,
  ): AppNotification {
    return {
      seq:
        row.seq,

      id:
        row.id,

      type:
        row.type,

      resourceId:
        row.resource_id,

      title:
        row.title,

      message:
        row.message,

      sender:
        row.sender_id
          ? {
              id:
                row.sender_id,

              username:
                row.sender_username ??
                '',

              avatarUrl:
                row.sender_avatar_url ??
                '',
            }
          : null,

      createdAt:
        row.created_at,
    };
  }
}

// ============================================================
// Validation
// ============================================================

function parseCursor(
  value:
    string | undefined,
): number {
  if (
    value === undefined ||
    value.trim() === ''
  ) {
    return 0;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed < 0
  ) {
    throw new NotificationServiceError(
      'Invalid notification cursor',
      400,
    );
  }

  return parsed;
}

function requireObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new NotificationServiceError(
      'Invalid request body',
      400,
    );
  }

  return value as Record<
    string,
    unknown
  >;
}

function requireText(
  value: unknown,
  message: string,
): string {
  if (
    typeof value !== 'string'
  ) {
    throw new NotificationServiceError(
      message,
      400,
    );
  }

  const result =
    value.trim();

  if (!result) {
    throw new NotificationServiceError(
      message,
      400,
    );
  }

  return result;
}

function optionalText(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== 'string'
  ) {
    throw new NotificationServiceError(
      'Invalid text value',
      400,
    );
  }

  const result =
    value.trim();

  return result || null;
}

// ============================================================
// Error
// ============================================================

export class NotificationServiceError
  extends Error {
  constructor(
    message: string,
    public readonly status:
      number,
  ) {
    super(message);

    this.name =
      'NotificationServiceError';
  }
}
