export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: string | number | boolean | null | undefined;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function write(level: LogLevel, msg: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
    return;
  }
  const line = JSON.stringify({
    level,
    msg,
    ts: new Date().toISOString(),
    ...context,
  });
  process.stderr.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, context?: LogContext): void => write("debug", msg, context),
  info: (msg: string, context?: LogContext): void => write("info", msg, context),
  warn: (msg: string, context?: LogContext): void => write("warn", msg, context),
  error: (msg: string, context?: LogContext): void => write("error", msg, context),
};
