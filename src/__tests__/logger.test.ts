import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, setLogLevel } from "../logger.js";

describe("logger", () => {
  afterEach(() => {
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("writes a JSON line with level/msg/ts to stderr at or above the current level", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    logger.info("something_happened", { tool: "memory_store" });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = JSON.parse((writeSpy.mock.calls[0]?.[0] as string).trim());
    expect(written.level).toBe("info");
    expect(written.msg).toBe("something_happened");
    expect(written.tool).toBe("memory_store");
    expect(written.ts).toBeTruthy();
  });

  it("setLogLevel suppresses messages below the configured level", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setLogLevel("error");

    logger.debug("should be suppressed");
    logger.info("should be suppressed too");
    logger.warn("also suppressed");
    expect(writeSpy).not.toHaveBeenCalled();

    logger.error("this one gets through");
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});
