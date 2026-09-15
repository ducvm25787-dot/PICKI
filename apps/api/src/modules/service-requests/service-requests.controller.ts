import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  createServiceRequestSchema,
  providerServiceRequestActionSchema,
  scheduleEducationTrialSchema,
} from "./dto.js";
import { ServiceRequestsService } from "./service-requests.service.js";

@Controller()
@UseGuards(SessionAuthGuard)
export class ServiceRequestsController {
  constructor(@Inject(ServiceRequestsService) private readonly requests: ServiceRequestsService) {}

  @Post("service-requests")
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = createServiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid service request", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.requests.create(userId, parsed.data);
  }

  @Get("service-requests/mine")
  listMine(@CurrentUserId() userId: string) {
    return this.requests.listMine(userId);
  }

  @Get("service-requests/:requestId")
  getMine(@CurrentUserId() userId: string, @Param("requestId") requestId: string) {
    return this.requests.getMine(userId, requestId);
  }

  @Patch("service-requests/:requestId/cancel")
  cancel(@CurrentUserId() userId: string, @Param("requestId") requestId: string) {
    return this.requests.cancel(userId, requestId);
  }

  @Get("provider/service-requests")
  listForProvider(
    @CurrentUserId() userId: string,
    @Query("locationId") locationId: string,
  ) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.requests.listForProvider(userId, locationId);
  }

  @Patch("provider/service-requests/:requestId")
  providerAction(
    @CurrentUserId() userId: string,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    const parsed = providerServiceRequestActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.requests.providerAction(userId, requestId, parsed.data);
  }

  @Patch("provider/service-requests/:requestId/trial-schedule")
  scheduleTrial(
    @CurrentUserId() userId: string,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    const parsed = scheduleEducationTrialSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid trial schedule", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.requests.scheduleEducationTrial(userId, requestId, parsed.data);
  }
}
