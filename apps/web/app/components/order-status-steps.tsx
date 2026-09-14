"use client";

import { ORDER_FLOW_STEPS, orderStepIndex } from "../../lib/order-display";

export function OrderStatusSteps({
  status,
  runnerSoughtAt,
}: {
  status: string;
  runnerSoughtAt?: string | null;
}) {
  const current = orderStepIndex(status, { runnerSoughtAt });
  if (current < 0) return null;

  return (
    <div className="order-steps" aria-label="Tiến trình đơn hàng">
      {ORDER_FLOW_STEPS.map((step, i) => {
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
