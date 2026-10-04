import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { financialLedgerEntries } from "../schema/finance.js";

const HIDDEN_FROM_PROVIDER = ["SUBSCRIPTION_REVENUE", "PICKEE_DELIVERY_SUBSIDY", "PICKEE_FUNDED_DISCOUNT"] as const;

type ViewDb = Pick<PickiDb, "select">;

export type ProviderFinanceView = {
  gmv: number;
  orders: number;
  refunds: number;
  transactionFee: number;
  providerFundedDiscount: number;
  providerDeliverySubsidy: number;
  netReceivable: number;
  paid: number;
  outstanding: number;
};

export function emptyProviderFinance(): ProviderFinanceView {
  return {
    gmv: 0,
    orders: 0,
    refunds: 0,
    transactionFee: 0,
    providerFundedDiscount: 0,
    providerDeliverySubsidy: 0,
    netReceivable: 0,
    paid: 0,
    outstanding: 0,
  };
}

export function providerFinanceFromRows(
  rows: readonly { entryType: string; amountVnd: number; orderId: string | null; toParty: string }[],
): ProviderFinanceView {
  const visible = rows.filter((row) => !HIDDEN_FROM_PROVIDER.includes(row.entryType as (typeof HIDDEN_FROM_PROVIDER)[number]));
  const sum = (type: string) => visible.filter((row) => row.entryType === type).reduce((total, row) => total + row.amountVnd, 0);
  const orders = new Set(visible.filter((row) => row.entryType === "MERCHANDISE_GMV" && row.orderId).map((row) => row.orderId));
  const gmv = sum("MERCHANDISE_GMV");
  const providerFundedDiscount = sum("PROVIDER_FUNDED_DISCOUNT");
  const transactionFee = sum("PLATFORM_FEE");
  const providerDeliverySubsidy = sum("PROVIDER_DELIVERY_SUBSIDY");
  const refunds = sum("REFUND");
  const netReceivable = gmv - providerFundedDiscount - transactionFee - providerDeliverySubsidy - refunds;
  const paid = visible
    .filter((row) => row.entryType === "PAYMENT_SENT" && row.toParty === "PROVIDER")
    .reduce((total, row) => total + row.amountVnd, 0);
  return {
    gmv,
    orders: orders.size,
    refunds,
    transactionFee,
    providerFundedDiscount,
    providerDeliverySubsidy,
    netReceivable,
    paid,
    outstanding: netReceivable - paid,
  };
}

export async function summarizeProviderLedger(
  db: ViewDb,
  input: { locationIds: string[]; providerIds: string[] },
): Promise<ProviderFinanceView> {
  if (input.locationIds.length === 0) return emptyProviderFinance();
  const rows = await db
    .select({
      entryType: financialLedgerEntries.entryType,
      amountVnd: financialLedgerEntries.amountVnd,
      orderId: financialLedgerEntries.orderId,
      toParty: financialLedgerEntries.toParty,
    })
    .from(financialLedgerEntries)
    .where(
      and(
        or(
          inArray(financialLedgerEntries.providerLocationId, input.locationIds),
          and(inArray(financialLedgerEntries.providerId, input.providerIds), isNull(financialLedgerEntries.providerLocationId)),
        ),
        sql`${financialLedgerEntries.entryType} not in ('SUBSCRIPTION_REVENUE', 'PICKEE_DELIVERY_SUBSIDY', 'PICKEE_FUNDED_DISCOUNT')`,
      ),
    );
  return providerFinanceFromRows(rows);
}
