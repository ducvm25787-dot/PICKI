import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  conversationParticipants,
  conversations,
  messages,
  orders,
  providerLocations,
  providerMembers,
  runners,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB } from "../../shared/tokens.js";

@Injectable()
export class MessagingService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async listConversations(userId: string) {
    const participantRows = await this.db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));

    const ids = participantRows.map((r) => r.conversationId);
    if (ids.length === 0) return { conversations: [] };

    const convs = await this.db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, ids))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    const result = await Promise.all(
      convs.map(async (c) => {
        const last = await this.db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, c.id))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        let title = "Hội thoại";
        if (c.contextType === "ORDER") {
          const order = await this.db
            .select({ orderNumber: orders.orderNumber })
            .from(orders)
            .where(eq(orders.id, c.contextId))
            .limit(1);
          title = order[0] ? `Đơn ${order[0].orderNumber}` : title;
        }

        return {
          id: c.id,
          contextType: c.contextType,
          contextId: c.contextId,
          title,
          lastMessage: last[0]
            ? {
                body: last[0].body,
                senderUserId: last[0].senderUserId,
                createdAt: last[0].createdAt.toISOString(),
              }
            : null,
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    );

    return { conversations: result };
  }

  async getConversation(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);

    const conv = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conv[0]) {
      throw new PickiError("NOT_FOUND", "Conversation not found");
    }

    const msgs = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(200);

    const participantRows = await this.db
      .select({
        userId: conversationParticipants.userId,
        role: conversationParticipants.role,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    const roleByUserId = new Map(participantRows.map((p) => [p.userId, p.role]));

    let orderForRoles: { customerUserId: string; runnerUserId: string | null } | null = null;
    if (conv[0].contextType === "ORDER") {
      const orderRow = await this.db
        .select({ customerUserId: orders.customerUserId, runnerUserId: orders.runnerUserId })
        .from(orders)
        .where(eq(orders.id, conv[0].contextId))
        .limit(1);
      orderForRoles = orderRow[0] ?? null;
    }

    return {
      id: conv[0].id,
      contextType: conv[0].contextType,
      contextId: conv[0].contextId,
      messages: msgs.map((m) => ({
        id: m.id,
        senderUserId: m.senderUserId,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        mine: m.senderUserId === userId,
        senderRole:
          (roleByUserId.get(m.senderUserId) as "CUSTOMER" | "PROVIDER" | "RUNNER" | undefined) ??
          (orderForRoles ? roleForUser(m.senderUserId, orderForRoles) : null),
      })),
    };
  }

  async getOrCreateOrderConversation(userId: string, orderId: string) {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0]) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    await this.assertOrderAccess(userId, order[0]);

    let conv = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.contextType, "ORDER"), eq(conversations.contextId, orderId)))
      .limit(1);

    if (!conv[0]) {
      conv = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(conversations)
          .values({ contextType: "ORDER", contextId: orderId })
          .returning();
        if (!created) {
          throw new PickiError("INTERNAL_ERROR", "Failed to create conversation");
        }

        const participantIds = await this.orderParticipantIds(order[0]!);
        if (!participantIds.includes(userId)) {
          participantIds.push(userId);
        }

        await tx.insert(conversationParticipants).values(
          participantIds.map((uid) => ({
            conversationId: created.id,
            userId: uid,
            role: roleForUser(uid, order[0]!),
          })),
        );

        return [created];
      });
    } else {
      await this.syncOrderParticipants(conv[0].id, order[0]!);
    }

    return this.getConversation(userId, conv[0]!.id);
  }

  async sendMessage(userId: string, conversationId: string, body: string) {
    await this.assertParticipant(userId, conversationId);

    const conv = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conv[0]) {
      throw new PickiError("NOT_FOUND", "Conversation not found");
    }

    const participantRows = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));

    let orderNumber: string | undefined;
    let orderId: string | undefined;
    if (conv[0].contextType === "ORDER") {
      const order = await this.db
        .select({ orderNumber: orders.orderNumber })
        .from(orders)
        .where(eq(orders.id, conv[0].contextId))
        .limit(1);
      orderNumber = order[0]?.orderNumber;
      orderId = conv[0].contextId;
    }

    const message = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messages)
        .values({ conversationId, senderUserId: userId, body })
        .returning();
      if (!row) {
        throw new PickiError("INTERNAL_ERROR", "Failed to send message");
      }

      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      await this.outbox.enqueue(tx, {
        eventType: "message.received",
        aggregateType: "conversation",
        aggregateId: conversationId,
        payload: {
          conversationId,
          messageId: row.id,
          senderUserId: userId,
          orderId,
          orderNumber,
          preview: body,
          recipientUserIds: participantRows.map((p) => p.userId),
        },
      });

      return row;
    });

    return {
      id: message.id,
      senderUserId: message.senderUserId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      mine: true,
    };
  }

  private async syncOrderParticipants(conversationId: string, order: typeof orders.$inferSelect) {
    const desired = await this.orderParticipantIds(order);
    const existing = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));

    const existingSet = new Set(existing.map((e) => e.userId));
    const missing = desired.filter((id) => !existingSet.has(id));
    if (missing.length === 0) return;

    await this.db.insert(conversationParticipants).values(
      missing.map((userId) => ({
        conversationId,
        userId,
        role: roleForUser(userId, order),
      })),
    );
  }

  private async orderParticipantIds(order: typeof orders.$inferSelect): Promise<string[]> {
    const ids = new Set<string>([order.customerUserId]);

    const location = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, order.providerLocationId))
      .limit(1);

    if (location[0]) {
      const staff = await this.db
        .select({ userId: providerMembers.userId })
        .from(providerMembers)
        .where(eq(providerMembers.providerId, location[0].providerId));
      staff.forEach((s) => ids.add(s.userId));
    }

    if (order.runnerUserId) {
      ids.add(order.runnerUserId);
    }

    return Array.from(ids);
  }

  private async assertOrderAccess(userId: string, order: typeof orders.$inferSelect) {
    if (order.customerUserId === userId) return;

    const staff = await this.db
      .select({ id: providerMembers.id })
      .from(providerMembers)
      .innerJoin(providerLocations, eq(providerMembers.providerId, providerLocations.providerId))
      .where(
        and(
          eq(providerMembers.userId, userId),
          eq(providerLocations.id, order.providerLocationId),
        ),
      )
      .limit(1);
    if (staff[0]) return;

    if (order.runnerUserId === userId) return;

    const runner = await this.db
      .select({ id: runners.id })
      .from(runners)
      .where(and(eq(runners.userId, userId), eq(runners.zoneId, order.zoneId)))
      .limit(1);
    if (runner[0] && (order.status === "READY" || order.runnerUserId == null)) return;

    throw new PickiError("FORBIDDEN", "No access to this order chat");
  }

  private async assertParticipant(userId: string, conversationId: string) {
    const row = await this.db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(1);
    if (!row[0]) {
      throw new PickiError("FORBIDDEN", "Not a participant");
    }
  }
}

function roleForUser(userId: string, order: { customerUserId: string; runnerUserId: string | null }) {
  if (userId === order.customerUserId) return "CUSTOMER";
  if (userId === order.runnerUserId) return "RUNNER";
  return "PROVIDER";
}
