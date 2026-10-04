import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { runnerCredentialsSchema, runnerOrderActionSchema, updatePresenceSchema } from "./dto.js";
import { RunnerService } from "./runner.service.js";

@Controller("runner")
@UseGuards(SessionAuthGuard)
export class RunnerController {
  constructor(@Inject(RunnerService) private readonly runnerService: RunnerService) {}

  @Get("profile")
  async profile(@CurrentUserId() userId: string) {
    return this.runnerService.getProfile(userId);
  }

  @Get("credentials")
  async credentials(@CurrentUserId() userId: string) {
    return this.runnerService.getCredentials(userId);
  }

  @Patch("credentials")
  async updateCredentials(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = runnerCredentialsSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message;
      throw new PickiError(
        "VALIDATION_ERROR",
        message && !message.startsWith("Invalid") ? message : "Hồ sơ chưa đủ",
      );
    }
    return this.runnerService.updateCredentials(userId, parsed.data);
  }

  @Get("documents/:kind")
  async document(@CurrentUserId() userId: string, @Param("kind") kind: string) {
    return this.runnerService.readOwnDocument(userId, kind);
  }

  @Patch("presence")
  async presence(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = updatePresenceSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid presence", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.runnerService.updatePresence(userId, parsed.data);
  }

  @Get("orders")
  async orders(@CurrentUserId() userId: string) {
    return this.runnerService.listOrders(userId);
  }

  @Get("orders/history")
  async orderHistory(@CurrentUserId() userId: string) {
    return this.runnerService.listOrderHistory(userId);
  }

  @Get("route/active")
  async activeRoute(@CurrentUserId() userId: string) {
    return this.runnerService.getActiveRoute(userId);
  }

  @Patch("route/stops/:stopId")
  async completeStop(@CurrentUserId() userId: string, @Param("stopId") stopId: string) {
    return this.runnerService.completeStop(userId, stopId);
  }

  @Patch("route/stops/:stopId/arrive")
  async arriveLobby(@CurrentUserId() userId: string, @Param("stopId") stopId: string) {
    return this.runnerService.arriveAtLobby(userId, stopId);
  }

  @Get("route/stops/:stopId/lobby")
  async lobbyHandoffs(@CurrentUserId() userId: string, @Param("stopId") stopId: string) {
    return this.runnerService.lobbyHandoffs(userId, stopId);
  }

  @Patch("route/stops/:stopId/lobby/:orderId")
  async lobbyAction(
    @CurrentUserId() userId: string,
    @Param("stopId") stopId: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ action: z.enum(["received", "no_response"]) })
      .safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid lobby action");
    }
    return this.runnerService.lobbyAction(userId, stopId, orderId, parsed.data.action);
  }

  @Patch("orders/:orderId")
  async orderAction(
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = runnerOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.runnerService.applyOrderAction(userId, orderId, parsed.data);
  }
}
