# Background jobs

**S28:** `OutboxWorker` polls `outbox_events` every 3s and delivers WEB notifications via `NotificationService`.

Order transitions and new chat messages enqueue events in the same DB transaction as the business write (ADR-P08, ADR-036).

Future: extract worker to separate deploy when outbox volume requires; wire ZALO/PUSH adapters without changing domain modules.
