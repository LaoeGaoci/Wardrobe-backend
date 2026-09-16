import type {
  NotificationWithSenderRow,
} from '../types/notification';

export class NotificationRepository {
  constructor(
    private readonly db: D1Database,
  ) {}

  // ==========================================================
  // Cursor
  // ==========================================================

  async getLatestSeq(
    receiverId: string,
  ): Promise<number> {
    const row =
      await this.db
        .prepare(`
          SELECT
            COALESCE(
              MAX(seq),
              0
            ) AS seq
          FROM notifications
          WHERE receiver_id = ?
        `)
        .bind(
          receiverId,
        )
        .first<{
          seq: number;
        }>();

    return row?.seq ?? 0;
  }

  // ==========================================================
  // Poll
  // ==========================================================

  /**
   * Scans rows after a cursor.
   *
   * We intentionally include already-read rows in the scan so
   * nextCursor can advance past them. The service filters them
   * before returning notifications to the mobile client.
   */
  async scanAfter(
    receiverId: string,
    afterSeq: number,
    limit: number,
  ): Promise<
    NotificationWithSenderRow[]
  > {
    const result =
      await this.db
        .prepare(`
          SELECT
            n.seq,
            n.id,
            n.receiver_id,
            n.type,
            n.resource_id,
            n.sender_id,
            n.title,
            n.message,
            n.created_at,
            n.read_at,

            sender.username
              AS sender_username,

            sender.avatar_url
              AS sender_avatar_url

          FROM notifications n

          LEFT JOIN users sender
            ON sender.id = n.sender_id

          WHERE
            n.receiver_id = ?
            AND n.seq > ?

          ORDER BY n.seq ASC

          LIMIT ?
        `)
        .bind(
          receiverId,
          afterSeq,
          limit,
        )
        .all<
          NotificationWithSenderRow
        >();

    return result.results ?? [];
  }

  // ==========================================================
  // Read
  // ==========================================================

  async markRead(
    receiverId: string,
    notificationId: string,
  ): Promise<boolean> {
    const result =
      await this.db
        .prepare(`
          UPDATE notifications
          SET read_at =
            COALESCE(
              read_at,
              CURRENT_TIMESTAMP
            )
          WHERE id = ?
            AND receiver_id = ?
        `)
        .bind(
          notificationId,
          receiverId,
        )
        .run();

    return result.meta.changes > 0;
  }

  // ==========================================================
  // System notification
  // ==========================================================

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
            lower(
              hex(
                randomblob(16)
              )
            ),
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
