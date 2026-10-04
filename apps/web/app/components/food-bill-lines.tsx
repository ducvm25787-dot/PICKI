import { formatVnd } from "../../lib/money";

export function FoodBillLines({
  subtotalVnd,
  runnerPayableVnd,
  providerDeliverySubsidyVnd = 0,
  pickeeDeliverySubsidyVnd = 0,
  totalVnd,
  foodLabel = "Tiền hàng",
}: {
  subtotalVnd: number;
  runnerPayableVnd: number;
  providerDeliverySubsidyVnd?: number;
  pickeeDeliverySubsidyVnd?: number;
  totalVnd: number;
  foodLabel?: string;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <span>{foodLabel}</span>
        <span>{formatVnd(subtotalVnd)}</span>
      </div>
      {runnerPayableVnd > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span>Phí runner</span>
          <span>{formatVnd(runnerPayableVnd)}</span>
        </div>
      ) : null}
      {pickeeDeliverySubsidyVnd > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span>Pickee hỗ trợ</span>
          <span>−{formatVnd(pickeeDeliverySubsidyVnd)}</span>
        </div>
      ) : null}
      {providerDeliverySubsidyVnd > 0 ? (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span>Quán hỗ trợ</span>
          <span>−{formatVnd(providerDeliverySubsidyVnd)}</span>
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          marginTop: 12,
        }}
      >
        <span>Tổng</span>
        <span>{formatVnd(totalVnd)}</span>
      </div>
    </>
  );
}
