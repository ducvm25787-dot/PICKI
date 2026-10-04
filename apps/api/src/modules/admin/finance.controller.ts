import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError, type AdminAccess } from "@picki/shared";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CurrentAdmin, CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { FinanceService } from "./finance.service.js";

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("finance")
  async global(
    @CurrentAdmin() access: AdminAccess,
    @Query("cityId") cityId?: string,
    @Query("zoneId") zoneId?: string,
  ) {
    const scope = zoneId
      ? ({ scope: "ZONE", id: zoneId } as const)
      : cityId
        ? ({ scope: "CITY", id: cityId } as const)
        : ({ scope: "GLOBAL" } as const);
    const [overview, entries, policies, plans] = await Promise.all([
      this.finance.overview(access, scope),
      this.finance.entries(access, scope),
      this.finance.policies(access).catch(() => []),
      this.finance.plans(access).catch(() => ({ plans: [], prices: [], onboardingTrial: { months: 0, planId: null } })),
    ]);
    return { overview, entries, policies, plans };
  }

  @Get("zones/:zoneSlug/finance")
  async zone(
    @CurrentAdmin() access: AdminAccess,
    @Param("zoneSlug") zoneSlug: string,
    @Query("entryType") entryType?: string,
    @Query("providerId") providerId?: string,
    @Query("locationId") locationId?: string,
    @Query("orderId") orderId?: string,
    @Query("party") party?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.finance.zoneBundle(access, zoneSlug, { entryType, providerId, locationId, orderId, party, from, to });
  }

  @Get("finance/orders/:orderId")
  orderFinance(@CurrentAdmin() access: AdminAccess, @Param("orderId") orderId: string) {
    return this.finance.orderFinance(access, orderId);
  }

  @Get("finance/campaigns")
  campaigns(@CurrentAdmin() access: AdminAccess) {
    return this.finance.campaignReport(access);
  }

  @Get("finance/policies/resolve")
  resolve(
    @CurrentAdmin() access: AdminAccess,
    @Query("providerId") providerId?: string,
    @Query("locationId") locationId?: string,
    @Query("zoneId") zoneId?: string,
  ) {
    if (!providerId) throw new PickiError("VALIDATION_ERROR", "Thiếu nhà cung cấp");
    return this.finance.resolvePreview(access, { providerId, locationId, zoneId });
  }

  @Post("finance/policies")
  async savePolicy(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Body() body: unknown) {
    const input = body as {
      scopeType?: string;
      scopeKey?: string;
      revenueModel?: string;
      subscriptionRequired?: boolean;
      transactionFeeType?: string;
      transactionFeeValue?: number;
      transactionFeeBasis?: string;
      policySource?: string;
      note?: string;
      contractRef?: string;
    };
    if (!input.scopeType || !input.revenueModel || !input.transactionFeeType || !input.policySource) {
      throw new PickiError("VALIDATION_ERROR", "Thiếu thông tin hợp đồng");
    }
    return this.finance.savePolicy(access, userId, {
      scopeType: input.scopeType,
      scopeKey: input.scopeKey ?? "",
      revenueModel: input.revenueModel,
      subscriptionRequired: input.subscriptionRequired === true,
      transactionFeeType: input.transactionFeeType,
      transactionFeeValue: input.transactionFeeValue ?? 0,
      transactionFeeBasis: input.transactionFeeBasis ?? "MERCHANDISE_GMV",
      policySource: input.policySource,
      note: input.note,
      contractRef: input.contractRef,
    });
  }

  @Post("finance/plans")
  async savePlan(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body()
    body: {
      code?: string;
      name?: string;
      providerType?: string | null;
      gracePeriodDays?: number;
      maxLocations?: number | null;
      maxMembers?: number | null;
      featureFlags?: Record<string, boolean>;
      active?: boolean;
    },
  ) {
    if (!body.code || !body.name) throw new PickiError("VALIDATION_ERROR", "Thiếu mã hoặc tên gói");
    return this.finance.savePlan(access, userId, {
      code: body.code,
      name: body.name,
      providerType: body.providerType,
      gracePeriodDays: body.gracePeriodDays,
      maxLocations: body.maxLocations,
      maxMembers: body.maxMembers,
      featureFlags: body.featureFlags,
      active: body.active,
    });
  }

  @Post("finance/onboarding-trial")
  onboarding(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body() body: { months?: number; planId?: string | null },
  ) {
    if (body.months == null || body.months < 0) throw new PickiError("VALIDATION_ERROR", "Thiếu số tháng trial");
    return this.finance.saveOnboardingTrial(access, userId, { months: body.months, planId: body.planId });
  }

  @Post("finance/providers/:providerId/trial")
  grantTrial(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("providerId") providerId: string,
  ) {
    return this.finance.grantTrial(access, userId, providerId);
  }

  @Post("finance/plan-prices")
  async savePrice(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body() body: { planId?: string; durationMonths?: number; priceVnd?: number },
  ) {
    if (!body.planId || !body.durationMonths || body.priceVnd == null) {
      throw new PickiError("VALIDATION_ERROR", "Thiếu giá gói");
    }
    return this.finance.savePlanPrice(access, userId, {
      planId: body.planId,
      durationMonths: body.durationMonths,
      priceVnd: body.priceVnd,
    });
  }

  @Post("finance/settlements")
  async settle(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body()
    body: {
      partyType?: "PROVIDER" | "RUNNER";
      partyId?: string;
      counterpartyId?: string;
      zoneId?: string;
      amountVnd?: number;
      direction?: "PAYABLE" | "RECEIVABLE";
      obligation?: "PROVIDER_OWES_PICKEE" | "PICKEE_OWES_PROVIDER" | "PROVIDER_OWES_RUNNER" | "PICKEE_OWES_RUNNER";
      reference?: string;
      note?: string;
      paidAt?: string;
    },
  ) {
    if (!body.partyId || !body.zoneId || body.amountVnd == null || !body.reference || !body.note || !body.paidAt) {
      throw new PickiError("VALIDATION_ERROR", "Cần số tiền, mã tham chiếu, ghi chú và ngày");
    }
    if (!body.obligation && (!body.partyType || !body.direction)) {
      throw new PickiError("VALIDATION_ERROR", "Thiếu loại đối soát");
    }
    return this.finance.markSettlement(access, userId, {
      partyType: body.partyType ?? (body.obligation?.includes("RUNNER") ? "RUNNER" : "PROVIDER"),
      partyId: body.partyId,
      counterpartyId: body.counterpartyId,
      zoneId: body.zoneId,
      amountVnd: body.amountVnd,
      direction: body.direction ?? "PAYABLE",
      obligation: body.obligation,
      reference: body.reference,
      note: body.note,
      paidAt: body.paidAt,
    });
  }

  @Post("finance/orders/:orderId/refund")
  async refund(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: { amountVnd?: number; reason?: string },
  ) {
    if (!body.amountVnd || !body.reason) throw new PickiError("VALIDATION_ERROR", "Thiếu số tiền hoặc lý do");
    return this.finance.refund(access, userId, orderId, body.amountVnd, body.reason);
  }

  @Post("finance/orders/:orderId/fulfilled-after-cancel")
  async fulfilledAfterCancel(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: { reason?: string },
  ) {
    if (!body.reason) throw new PickiError("VALIDATION_ERROR", "Cần lý do");
    return this.finance.confirmFulfilledAfterCancel(access, userId, orderId, body.reason);
  }

  @Post("finance/providers/:providerId/standing")
  async standing(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("providerId") providerId: string,
    @Body() body: { standing?: string; reason?: string },
  ) {
    if (!body.standing || !body.reason) throw new PickiError("VALIDATION_ERROR", "Cần tình trạng và lý do");
    return this.finance.setStanding(access, userId, providerId, body.standing, body.reason);
  }
}
