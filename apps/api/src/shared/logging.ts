import { noopLogger, type Logger } from "@picki/shared";

/** Replace with pino/Nest logger when Nest bootstrap lands (S2+). */
let logger: Logger = noopLogger;

export function setLogger(next: Logger): void {
  logger = next;
}

export function getLogger(): Logger {
  return logger;
}
