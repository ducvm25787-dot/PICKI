import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { sendMessageSchema } from "./dto.js";
import { MessagingService } from "./messaging.service.js";

@Controller("messages")
@UseGuards(SessionAuthGuard)
export class MessagingController {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  @Get("conversations")
  listConversations(@CurrentUserId() userId: string) {
    return this.messaging.listConversations(userId);
  }

  @Get("conversations/:conversationId")
  getConversation(
    @CurrentUserId() userId: string,
    @Param("conversationId") conversationId: string,
  ) {
    return this.messaging.getConversation(userId, conversationId);
  }

  @Get("orders/:orderId")
  orderConversation(@CurrentUserId() userId: string, @Param("orderId") orderId: string) {
    return this.messaging.getOrCreateOrderConversation(userId, orderId);
  }

  @Post("conversations/:conversationId/messages")
  sendMessage(
    @CurrentUserId() userId: string,
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
  ) {
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid message", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.messaging.sendMessage(userId, conversationId, parsed.data.body);
  }
}
