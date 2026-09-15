"use client";

import { flowStepsForOrder, orderStepIndex } from "../../lib/order-display";

export function OrderStatusSteps({
  status,
  runnerSoughtAt,
  serviceVertical,
  laundryPickupMode,
  audience = "provider",
}: {
  status: string;
  runnerSoughtAt?: string | null;
  serviceVertical?: string | null;
  laundryPickupMode?: string | null;
  audience?: "customer" | "provider" | "runner";
}) {
  const steps = flowStepsForOrder({ serviceVertical, laundryPickupMode, audience });
  const current = orderStepIndex(status, {
    runnerSoughtAt,
    serviceVertical,
    laundryPickupMode,
    audience,
  });
  if (current < 0) return null;

  return (
    <div className="order-steps" aria-label="Tiến trình đơn hàng">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <span
            key={step.key}
            className={
              done ? "order-step done" : active ? "order-step active" : "order-step"
            }
          >
            {step.label}
          </span>
        );
      })}
    </div>
  );
}
