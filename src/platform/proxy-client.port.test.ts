import { CliError } from "../errors/cli-errors.js";
import { EXIT_CREDENTIALS, EXIT_STORAGE, EXIT_USAGE } from "../errors/exit-codes.js";
import { ProxyError, wrapProxyError } from "./proxy-client.port.js";

describe(ProxyError, () => {
  describe("exit code mapping", () => {
    it("maps 401 to EXIT_CREDENTIALS", () => {
      const err = new ProxyError(401, "unauth", "bad token");
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps 403 to EXIT_CREDENTIALS", () => {
      const err = new ProxyError(403, "site_unauthorized", "no team");
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps 422 to EXIT_STORAGE", () => {
      const err = new ProxyError(422, "verify_failed", "missing files");
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });

    it("maps 5xx to EXIT_STORAGE", () => {
      const err = new ProxyError(500, "server_error", "oops");
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });

    it("maps status 0 (network error) to EXIT_STORAGE", () => {
      const err = new ProxyError(0, "network_error", "unreachable");
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });

    it("maps 400 to EXIT_USAGE", () => {
      const err = new ProxyError(400, "bad_request", "site required");
      expect(err.exitCode).toBe(EXIT_USAGE);
    });
  });

  describe("carries status and code", () => {
    it("exposes status and code fields", () => {
      const err = new ProxyError(404, "not_found", "deploy missing");
      expect(err.status).toBe(404);
      expect(err.code).toBe("not_found");
      expect(err.message).toBe("deploy missing");
    });

    it("is an instance of CliError", () => {
      const err = new ProxyError(401, "unauth", "bad");
      expect(err).toBeInstanceOf(CliError);
    });
  });
});

describe(wrapProxyError, () => {
  it("formats ProxyError with command prefix and code", () => {
    const err = new ProxyError(401, "unauth", "bad token");
    const result = wrapProxyError("deploy", err);
    expect(result.code).toBe(EXIT_CREDENTIALS);
    expect(result.message).toBe("deploy failed (unauth): bad token");
  });

  it("passes CliError message through verbatim", () => {
    const err = new CliError("config missing", EXIT_USAGE);
    const result = wrapProxyError("deploy", err);
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.message).toBe("config missing");
  });

  it("wraps plain Error with EXIT_USAGE", () => {
    const err = new Error("generic failure");
    const result = wrapProxyError("promote", err);
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.message).toBe("generic failure");
  });

  it("stringifies non-Error values with EXIT_USAGE", () => {
    const result = wrapProxyError("rollback", "string error");
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.message).toBe("string error");
  });
});
