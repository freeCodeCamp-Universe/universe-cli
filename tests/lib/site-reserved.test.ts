import { describe, expect, it } from "vitest";
import { AliasDriftError, SiteReservedError, ProxyError } from "../../src/lib/proxy-client.js";
import { wrapProxyError } from '../../src/output/format.js'

describe("409 site_reserved", () => {
  it("does not read as a credentials failure and names the recovery verb", () => {
    const err = new SiteReservedError("site is reserved", "2026-08-31T09:00:00Z");
    const { code, message } = wrapProxyError("sites register", err);
    expect(code).toBe(10);
    expect(message).toMatch(/held by a delete/i);
    expect(message).toContain("2026-08-31T09:00:00Z");
    expect(message).toMatch(/undelete/);
    expect(message).not.toMatch(/token|credential|scope/i);
  });

  it("still reads cleanly when the server sends no deadline", () => {
    const err = new SiteReservedError("site is reserved");
    const { message } = wrapProxyError("sites register", err);
    expect(message).toMatch(/held by a delete/i);
  });
});

describe("SiteReservedError request id", () => {
  it("carries the request id so support can correlate it", () => {
    const err = new SiteReservedError("site is reserved", undefined, "req-abc123");
    expect(err.requestId).toBe("req-abc123");
    expect(wrapProxyError("sites register", err).requestId).toBe("req-abc123");
  });
});

describe("410 site_gone", () => {
  it("stays in the usage bucket and explains itself, since the server sends no message", async () => {
    const { code, message } = wrapProxyError("sites promote", new ProxyError(410, "site_gone", ""));
    expect(code).toBe(10);
    expect(message).toMatch(/no longer registered/i);
  });
});

describe("prefixing a proxy error", () => {
  it("keeps the subclass, the deadline and the request id", () => {
    const err = new SiteReservedError("reserved", "2026-08-31T09:00:00Z", "req-abc");
    const prefixed = err.withMessage("deploy init failed (site_reserved): reserved");
    expect(prefixed).toBeInstanceOf(SiteReservedError);
    expect(prefixed.reservedUntil).toBe("2026-08-31T09:00:00Z");
    expect(prefixed.requestId).toBe("req-abc");
    expect(prefixed.message).toBe("deploy init failed (site_reserved): reserved");
    expect(wrapProxyError("deploy", prefixed).message).toContain("2026-08-31T09:00:00Z");
  });

  it("keeps the alias drift pointer", () => {
    const err = new AliasDriftError("drift", "20260801-090000-abc1234", "req-1");
    const prefixed = err.withMessage("promote failed (alias_drift): drift");
    expect(prefixed).toBeInstanceOf(AliasDriftError);
    expect(prefixed.current).toBe("20260801-090000-abc1234");
    expect(prefixed.requestId).toBe("req-1");
  });
});
