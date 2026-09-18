import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  classifiedListings,
  conversationParticipants,
  conversations,
  messages,
  orders,
  providerLocations,
  providerMembers,
  providers,
  runners,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { sendMessageSchema } from "./dto.js";

function attachmentUrlsFromRow(row: typeof messages.$inferSelect): string[] {
  const urls = row.attachmentUrls;
  if (Array.isArray(urls) && urls.every((u) => typeof u === "string")) {
    return urls;
  }
  return [];
}
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
        } else if (c.contextType === "CLASSIFIED") {
          const listing = await this.db
            .select({ title: classifiedListings.title, listingNumber: classifiedListings.listingNumber })
            .from(classifiedListings)
            .where(eq(classifiedListings.id, c.contextId))
            .limit(1);
          title = listing[0] ? `${listing[0].listingNumber}: ${listing[0].title}` : title;
        } else if (c.contextType === "PHARMACY") {
          const loc = await this.db
            .select({ displayName: providerLocations.displayName, brandName: providers.brandName })
            .from(providerLocations)
            .innerJoin(providers, eq(providers.id, providerLocations.providerId))
            .where(eq(providerLocations.id, c.contextId))
            .limit(1);
          title = loc[0] ? `Hỏi thuốc · ${loc[0].brandName}` : "Hỏi thuốc";
        } else if (c.contextType === "MARKET") {
          const loc = await this.db
            .select({ displayName: providerLocations.displayName, brandName: providers.brandName })
            .from(providerLocations)
            .innerJoin(providers, eq(providers.id, providerLocations.providerId))
            .where(eq(providerLocations.id, c.contextId))
            .limit(1);
          title = loc[0] ? `Hỏi hàng · ${loc[0].brandName}` : "Hỏi hàng";
        } else if (c.contextType === "TRANSPORT") {
          const loc = await this.db
            .select({ displayName: providerLocations.displayName, brandName: providers.brandName })
            .from(providerLocations)
            .innerJoin(providers, eq(providers.id, providerLocations.providerId))
            .where(eq(providerLocations.id, c.contextId))
            .limit(1);
          title = loc[0] ? `Đưa đón · ${loc[0].brandName}` : "Đưa đón";
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
                attachmentUrls: attachmentUrlsFromRow(last[0]),
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
        attachmentUrls: attachmentUrlsFromRow(m),
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

  async getOrCreateClassifiedConversation(userId: string, listingId: string) {
    const listing = await this.db
      .select()
      .from(classifiedListings)
      .where(eq(classifiedListings.id, listingId))
      .limit(1);
    if (!listing[0]) {
      throw new PickiError("NOT_FOUND", "Listing not found");
    }
    if (listing[0].sellerUserId === userId) {
      throw new PickiError("VALIDATION_ERROR", "Không thể chat với chính mình");
    }

    const existing = await this.db
      .select({ conversation: conversations })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.contextType, "CLASSIFIED"),
          eq(conversations.contextId, listingId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(20);

    for (const row of existing) {
      const sellerParticipant = await this.db
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversation.id),
            eq(conversationParticipants.userId, listing[0].sellerUserId),
          ),
        )
        .limit(1);
      if (sellerParticipant[0]) {
        return this.getClassifiedConversation(userId, row.conversation.id, listing[0].sellerUserId);
      }
    }

    const conv = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(conversations)
        .values({ contextType: "CLASSIFIED", contextId: listingId })
        .returning();
      if (!created) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create conversation");
      }

      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId: listing[0]!.sellerUserId, role: "SELLER" },
        { conversationId: created.id, userId, role: "BUYER" },
      ]);

      return created;
    });

    return this.getClassifiedConversation(userId, conv.id, listing[0].sellerUserId);
  }

  /** Hỏi thuốc — 1 hội thoại / khách / location nhà thuốc. */
  async getOrCreatePharmacyConversation(userId: string, locationId: string) {
    const location = await this.db
      .select({
        id: providerLocations.id,
        providerId: providerLocations.providerId,
        providerType: providers.providerType,
        brandName: providers.brandName,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);

    const loc = location[0];
    if (!loc || loc.providerType !== "PHARMACY") {
      throw new PickiError("NOT_FOUND", "Nhà thuốc không tìm thấy");
    }

    const staff = await this.db
      .select({ userId: providerMembers.userId, role: providerMembers.role })
      .from(providerMembers)
      .where(eq(providerMembers.providerId, loc.providerId));

    const pharmacyUserIds = staff.map((s) => s.userId);
    if (pharmacyUserIds.includes(userId)) {
      throw new PickiError("VALIDATION_ERROR", "Nhà thuốc không gửi hỏi hàng cho chính mình");
    }
    if (pharmacyUserIds.length === 0) {
      throw new PickiError("CONFLICT", "Nhà thuốc chưa có nhân viên nhận tin");
    }

    const ownerId =
      staff.find((s) => s.role === "OWNER")?.userId ?? pharmacyUserIds[0]!;

    const existing = await this.db
      .select({ conversation: conversations })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.contextType, "PHARMACY"),
          eq(conversations.contextId, locationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(20);

    for (const row of existing) {
      const staffInConv = await this.db
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversation.id),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);
      if (staffInConv[0]) {
        return this.getConversation(userId, row.conversation.id);
      }
    }

    const conv = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(conversations)
        .values({ contextType: "PHARMACY", contextId: locationId })
        .returning();
      if (!created) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create conversation");
      }

      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId: ownerId, role: "PROVIDER" },
        { conversationId: created.id, userId, role: "CUSTOMER" },
      ]);

      return created;
    });

    return this.getConversation(userId, conv.id);
  }

  /** Hỏi hàng tạp hóa / minimart — 1 hội thoại / khách / location. */
  async getOrCreateMarketConversation(userId: string, locationId: string) {
    const location = await this.db
      .select({
        id: providerLocations.id,
        providerId: providerLocations.providerId,
        providerType: providers.providerType,
        brandName: providers.brandName,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);

    const loc = location[0];
    const marketTypes = new Set(["MINIMART", "MARKET_VENDOR", "RETAIL_STORE"]);
    if (!loc || !marketTypes.has(loc.providerType)) {
      throw new PickiError("NOT_FOUND", "Cửa hàng không tìm thấy");
    }

    const staff = await this.db
      .select({ userId: providerMembers.userId, role: providerMembers.role })
      .from(providerMembers)
      .where(eq(providerMembers.providerId, loc.providerId));

    const shopUserIds = staff.map((s) => s.userId);
    if (shopUserIds.includes(userId)) {
      throw new PickiError("VALIDATION_ERROR", "Cửa hàng không gửi hỏi hàng cho chính mình");
    }
    if (shopUserIds.length === 0) {
      throw new PickiError("CONFLICT", "Cửa hàng chưa có nhân viên nhận tin");
    }

    const ownerId =
      staff.find((s) => s.role === "OWNER")?.userId ?? shopUserIds[0]!;

    const existing = await this.db
      .select({ conversation: conversations })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.contextType, "MARKET"),
          eq(conversations.contextId, locationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(20);

    for (const row of existing) {
      const staffInConv = await this.db
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversation.id),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);
      if (staffInConv[0]) {
        return this.getConversation(userId, row.conversation.id);
      }
    }

    const conv = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(conversations)
        .values({ contextType: "MARKET", contextId: locationId })
        .returning();
      if (!created) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create conversation");
      }

      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId: ownerId, role: "PROVIDER" },
        { conversationId: created.id, userId, role: "CUSTOMER" },
      ]);

      return created;
    });

    return this.getConversation(userId, conv.id);
  }

  /** Hỏi đưa đón — 1 hội thoại / khách / location nhà xe (ADR-049). */
  async getOrCreateTransportConversation(userId: string, locationId: string) {
    const location = await this.db
      .select({
        id: providerLocations.id,
        providerId: providerLocations.providerId,
        providerType: providers.providerType,
        brandName: providers.brandName,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);

    const loc = location[0];
    if (!loc || loc.providerType !== "TRANSPORT_PROVIDER") {
      throw new PickiError("NOT_FOUND", "Nhà xe không tìm thấy");
    }

    const staff = await this.db
      .select({ userId: providerMembers.userId, role: providerMembers.role })
      .from(providerMembers)
      .where(eq(providerMembers.providerId, loc.providerId));

    const shopUserIds = staff.map((s) => s.userId);
    if (shopUserIds.includes(userId)) {
      throw new PickiError("VALIDATION_ERROR", "Nhà xe không gửi tin cho chính mình");
    }
    if (shopUserIds.length === 0) {
      throw new PickiError("CONFLICT", "Nhà xe chưa có nhân viên nhận tin");
    }

    const ownerId =
      staff.find((s) => s.role === "OWNER")?.userId ?? shopUserIds[0]!;

    const existing = await this.db
      .select({ conversation: conversations })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.contextType, "TRANSPORT"),
          eq(conversations.contextId, locationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(20);

    for (const row of existing) {
      const staffInConv = await this.db
        .select({ id: conversationParticipants.id })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversation.id),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);
      if (staffInConv[0]) {
        return this.getConversation(userId, row.conversation.id);
      }
    }

    const conv = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(conversations)
        .values({ contextType: "TRANSPORT", contextId: locationId })
        .returning();
      if (!created) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create conversation");
      }

      await tx.insert(conversationParticipants).values([
        { conversationId: created.id, userId: ownerId, role: "PROVIDER" },
        { conversationId: created.id, userId, role: "CUSTOMER" },
      ]);

      return created;
    });

    return this.getConversation(userId, conv.id);
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    input: z.infer<typeof sendMessageSchema>,
  ) {
    await this.assertParticipant(userId, conversationId);

    const text = input.body?.trim() ?? "";
    const photoUrls = input.photoUrls ?? [];
    if (!text && photoUrls.length === 0) {
      throw new PickiError("VALIDATION_ERROR", "Nhập tin nhắn hoặc kèm ảnh");
    }

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
    let listingId: string | undefined;
    let listingNumber: string | undefined;
    let locationId: string | undefined;
    let inquiryKind: "PHARMACY" | "MARKET" | "TRANSPORT" | undefined;
    if (conv[0].contextType === "ORDER") {
      const order = await this.db
        .select({ orderNumber: orders.orderNumber })
        .from(orders)
        .where(eq(orders.id, conv[0].contextId))
        .limit(1);
      orderNumber = order[0]?.orderNumber;
      orderId = conv[0].contextId;
    } else if (conv[0].contextType === "CLASSIFIED") {
      listingId = conv[0].contextId;
      const listing = await this.db
        .select({ listingNumber: classifiedListings.listingNumber })
        .from(classifiedListings)
        .where(eq(classifiedListings.id, conv[0].contextId))
        .limit(1);
      listingNumber = listing[0]?.listingNumber;
    } else if (conv[0].contextType === "PHARMACY") {
      locationId = conv[0].contextId;
      inquiryKind = "PHARMACY";
    } else if (conv[0].contextType === "MARKET") {
      locationId = conv[0].contextId;
      inquiryKind = "MARKET";
    } else if (conv[0].contextType === "TRANSPORT") {
      locationId = conv[0].contextId;
      inquiryKind = "TRANSPORT";
    }

    const preview =
      text ||
      (photoUrls.length > 0
        ? inquiryKind === "MARKET"
          ? `[${String(photoUrls.length)} ảnh hỏi hàng]`
          : inquiryKind === "TRANSPORT"
            ? `[${String(photoUrls.length)} ảnh hỏi đưa đón]`
            : `[${String(photoUrls.length)} ảnh hỏi thuốc]`
        : "Tin nhắn mới");

    const message = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messages)
        .values({
          conversationId,
          senderUserId: userId,
          body: text || "(kèm ảnh)",
          attachmentUrls: photoUrls,
        })
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
          listingId,
          listingNumber,
          locationId,
          inquiryKind,
          preview,
          recipientUserIds: participantRows.map((p) => p.userId),
        },
      });

      return row;
    });

    return {
      id: message.id,
      senderUserId: message.senderUserId,
      body: message.body,
      attachmentUrls: attachmentUrlsFromRow(message),
      createdAt: message.createdAt.toISOString(),
      mine: true,
    };
  }

  private async getClassifiedConversation(
    userId: string,
    conversationId: string,
    sellerUserId: string,
  ) {
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

    return {
      id: conv[0].id,
      contextType: conv[0].contextType,
      contextId: conv[0].contextId,
      messages: msgs.map((m) => ({
        id: m.id,
        senderUserId: m.senderUserId,
        body: m.body,
        attachmentUrls: attachmentUrlsFromRow(m),
        createdAt: m.createdAt.toISOString(),
        mine: m.senderUserId === userId,
        senderRole:
          m.senderUserId === sellerUserId
            ? ("SELLER" as const)
            : m.senderUserId === userId
              ? ("BUYER" as const)
              : ("BUYER" as const),
      })),
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
