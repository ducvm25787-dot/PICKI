# Picki State Machines

**Source of truth:** `PICKI_MASTER_SPEC.md` wins on conflict.

**Rule:** Server controls all transitions. Clients never PATCH arbitrary status. Every transition validates role, current state, and business rules.

---

## Order state machine (§117)

### Happy path

```
CREATED
  ↓
PAYMENT_PENDING
  ↓
PAID
  ↓
PROVIDER_ACCEPTED
  ↓
PREPARING
  ↓
READY
  ↓
RUNNER_ASSIGNED
  ↓
PICKED_UP
  ↓
DELIVERING
  ↓
DELIVERED
```

### Exceptions

```
PROVIDER_REJECTED
CUSTOMER_CANCELLED
SYSTEM_CANCELLED
PAYMENT_FAILED
REFUND_PENDING → REFUNDED
```

- Transitions are **server-controlled** only
- Valid source states enforced per transition (exact matrix implemented in S19)
- Shop-runner offer at `READY` is fulfillment-layer state; do not invent redundant order statuses unless needed
- Payment failure from `PAYMENT_PENDING` → `PAYMENT_FAILED`
- Cancellations may trigger `REFUND_PENDING` → `REFUNDED`

### Snapshots

At creation/confirmation, persist item and delivery snapshots per `PICKI_DATABASE_SPEC.md` §116—immutable for historical orders.

---

## Booking state (§118)

Product launches later (Education, Beauty advanced, Health). Schema may exist early.

### Happy path

```
REQUESTED
  ↓
CONFIRMED
  ↓
UPCOMING
  ↓
IN_PROGRESS
  ↓
COMPLETED
```

### Exceptions

```
CANCELLED_BY_CUSTOMER
CANCELLED_BY_PROVIDER
NO_SHOW
```

Beauty V1 primarily uses **live status + contact**—not full booking engine (architecture acceptance #18).

---

## Service request state (§119)

For quote-based flows (home services `QUOTE_REQUIRED`, etc.).

### Happy path

```
OPEN
  ↓
RECEIVING_QUOTES
  ↓
QUOTE_SELECTED
  ↓
CONFIRMED
  ↓
IN_PROGRESS
  ↓
COMPLETED
```

### Exceptions

```
CANCELLED
EXPIRED
```

---

## Classified state (§120)

Thanh lý and similar listings.

```
DRAFT
  ↓
AVAILABLE
  ↓
RESERVED
  ↓
COMPLETED
  ↓
ARCHIVED
```

**Give Away** may reuse with terminal `GIVEN` instead of `COMPLETED` (see `PICKI_SERVICES_SPEC.md`).

No payment required for classified V1.

---

## User–Zone membership (§24)

**Not stored:** `VISITOR` (discover without row)

### States

```
JOINED ↔ VERIFIED (enhanced privileges)
JOINED | VERIFIED → SUSPENDED | LEFT
SUSPENDED → JOINED (reinstate) | LEFT
LEFT → JOINED (re-join with Level-1 address)
```

- Travel away from Zone does **not** → `LEFT`
- GPS does not trigger status changes
- `LEFT` requires explicit user action or admin/policy

---

## Address verification (§29)

```
UNVALIDATED
  ↓
LEVEL_1_VALIDATED    ← sufficient for Zone JOIN
  ↓
VERIFIED             ← enhanced / stricter checks
  ↓
REVOKED              ← from any positive state
```

---

## Provider status (§44)

### Provider (brand) level

```
DRAFT
  ↓
PENDING_VERIFICATION
  ↓
VERIFIED
  ↓
ACTIVE
  ↓
PAUSED | SUSPENDED
  ↓
CLOSED
```

### Provider location level

Separate status lifecycle, including:

```
DRAFT | PENDING_VERIFICATION | VERIFIED | ACTIVE | PAUSED | SUSPENDED
RELOCATING → CLOSED | RELOCATED
```

- Not public before category `verification_requirements` met
- Rejection/suspension recorded in `verification_results` + `audit_logs`
- Opening new location does not close old (ADR-024)

---

## Runner presence (§102)

```
OFFLINE ↔ AVAILABLE
AVAILABLE → PICKING_UP → DELIVERING → AVAILABLE | OFFLINE
```

Runner must be verified before receiving work.

---

## Payment (adapter-driven)

Flow:

```
Adapter webhook/event (idempotent)
  → payment_events (provider_event_id UNIQUE)
  → payments status update
  → may trigger order transition (e.g. PAID, PAYMENT_FAILED, REFUNDED)
```

- `Idempotency-Key` on order create
- Integer VND only
- Server maps vendor events to Picki states—clients do not set payment status directly

---

## Concurrency requirements (§123)

State transitions must be safe under:

| Scenario                         | Mitigation                                     |
| -------------------------------- | ---------------------------------------------- |
| Two runners accepting same route | Transaction + unique constraint / atomic claim |
| Two users buying last capacity   | Atomic capacity decrement                      |
| Duplicate payment webhook        | `provider_event_id UNIQUE`                     |
| Duplicate order submission       | `Idempotency-Key`                              |
| Concurrent provider live status  | Optimistic versioning or row lock              |
| Concurrent queue/wait updates    | Atomic updates                                 |
| Refund duplication               | Idempotent refund events                       |

No naive read-then-write.

---

## Related docs

- `PICKI_DATABASE_SPEC.md` — `order_status_history`, snapshots
- `PICKI_SECURITY_SPEC.md` — who may trigger transitions
- `PICKI_FULFILLMENT_SPEC.md` — runner/route assignment from `READY`
