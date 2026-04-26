import { describe, expect, it, vi } from "vitest";
import { createProxyClient, ProxyError } from "../../src/lib/proxy-client.js";
import {
  EXIT_CREDENTIALS,
  EXIT_STORAGE,
  EXIT_USAGE,
} from "../../src/output/exit-codes.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const baseUrl = "https://uploads.freecode.camp";
const getAuthToken = (): string => "ghp_test";

function getInit(call: unknown): RequestInit & {
  headers: Record<string, string>;
} {
  const args = call as [string, RequestInit];
  return args[1] as RequestInit & { headers: Record<string, string> };
}

function getUrl(call: unknown): string {
  return (call as [string, RequestInit])[0];
}

describe("createProxyClient", () => {
  describe("whoami", () => {
    it("issues GET /api/whoami with bearer token", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { login: "alice", authorizedSites: ["x"] }),
        );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.whoami();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/whoami",
      );
      expect(init.method).toBe("GET");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(r).toEqual({ login: "alice", authorizedSites: ["x"] });
    });

    it("throws ProxyError on 401 with envelope code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: "unauth", message: "bad token" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = await client.whoami().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProxyError);
      expect((err as ProxyError).status).toBe(401);
      expect((err as ProxyError).code).toBe("unauth");
      expect((err as ProxyError).message).toBe("bad token");
    });
  });

  describe("deployInit", () => {
    it("POSTs JSON to /api/deploy/init with bearer", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          deployId: "20260427-abc1234",
          jwt: "eyJ.x.y",
          expiresAt: "2026-04-27T01:00:00Z",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.deployInit({ site: "my-site", sha: "abc1234" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/init",
      );
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({
        site: "my-site",
        sha: "abc1234",
      });
      expect(r.deployId).toBe("20260427-abc1234");
      expect(r.jwt).toBe("eyJ.x.y");
    });

    it("includes optional files manifest in body", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { deployId: "x", jwt: "y", expiresAt: "z" }),
        );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.deployInit({
        site: "s",
        sha: "h",
        files: ["index.html", "main.js"],
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toEqual({
        site: "s",
        sha: "h",
        files: ["index.html", "main.js"],
      });
    });
  });

  describe("deployUpload", () => {
    it("PUTs raw body with deploy-JWT and ?path query", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          received: "index.html",
          key: "site/deploys/x/index.html",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const body = new Uint8Array([1, 2, 3]);
      const r = await client.deployUpload({
        deployId: "abc",
        jwt: "eyJ.dep.loy",
        path: "index.html",
        body,
        contentType: "text/html",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/abc/upload?path=index.html",
      );
      expect(init.method).toBe("PUT");
      expect(init.headers["Authorization"]).toBe("Bearer eyJ.dep.loy");
      expect(init.headers["Content-Type"]).toBe("text/html");
      expect(init.body).toBe(body);
      expect(r.received).toBe("index.html");
    });

    it("URL-encodes path query parameter", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { received: "a b/c.html", key: "x" }),
        );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.deployUpload({
        deployId: "d",
        jwt: "j",
        path: "a b/c.html",
        body: new Uint8Array(),
      });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/d/upload?path=a%20b%2Fc.html",
      );
    });

    it("uses application/octet-stream when contentType omitted", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { received: "x", key: "y" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.deployUpload({
        deployId: "d",
        jwt: "j",
        path: "x",
        body: new Uint8Array(),
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    });
  });

  describe("deployFinalize", () => {
    it("POSTs mode + files with deploy-JWT", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          url: "https://my-site.preview.freecode.camp",
          deployId: "abc",
          mode: "preview",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.deployFinalize({
        deployId: "abc",
        jwt: "j",
        mode: "preview",
        files: ["index.html"],
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/abc/finalize",
      );
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer j");
      expect(JSON.parse(init.body as string)).toEqual({
        mode: "preview",
        files: ["index.html"],
      });
      expect(r.url).toBe("https://my-site.preview.freecode.camp");
      expect(r.mode).toBe("preview");
    });

    it("preserves error code on 422 verify_failed", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: "verify_failed",
            message: "deploy is missing expected files",
            missing: ["a", "b"],
          },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = await client
        .deployFinalize({
          deployId: "d",
          jwt: "j",
          mode: "preview",
          files: ["a"],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProxyError);
      expect((err as ProxyError).status).toBe(422);
      expect((err as ProxyError).code).toBe("verify_failed");
    });
  });

  describe("siteDeploys", () => {
    it("GETs /api/site/{site}/deploys with bearer", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, [{ deployId: "x" }, { deployId: "y" }]),
        );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.siteDeploys({ site: "my-site" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/deploys",
      );
      expect(getInit(fetchMock.mock.calls[0]).method).toBe("GET");
      expect(r).toEqual([{ deployId: "x" }, { deployId: "y" }]);
    });

    it("URL-encodes site path segment", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.siteDeploys({ site: "a b" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/a%20b/deploys",
      );
    });
  });

  describe("sitePromote", () => {
    it("POSTs /api/site/{site}/promote with bearer", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "y" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.sitePromote({ site: "my-site" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/promote",
      );
      expect(getInit(fetchMock.mock.calls[0]).method).toBe("POST");
      expect(r.deployId).toBe("y");
    });
  });

  describe("siteRollback", () => {
    it("POSTs body { to } with bearer", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "old" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.siteRollback({ site: "my-site", to: "old" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/rollback",
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ to: "old" });
      expect(r.deployId).toBe("old");
    });
  });

  describe("error handling", () => {
    it("maps status 401 to EXIT_CREDENTIALS exit code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: "unauth", message: "bad token" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .whoami()
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps status 403 to EXIT_CREDENTIALS exit code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(403, {
          error: { code: "site_unauthorized", message: "no team" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .whoami()
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps status 422 to EXIT_STORAGE exit code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(422, {
          error: { code: "verify_failed", message: "x" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .deployFinalize({
          deployId: "d",
          jwt: "j",
          mode: "preview",
          files: [],
        })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });

    it("maps status 5xx to EXIT_STORAGE exit code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("oops", { status: 500 }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .whoami()
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_STORAGE);
      expect(err.status).toBe(500);
      expect(err.code).toBe("http_500");
    });

    it("maps status 400 to EXIT_USAGE exit code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: { code: "bad_request", message: "site required" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .deployInit({ site: "", sha: "x" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_USAGE);
      expect(err.code).toBe("bad_request");
    });

    it("wraps fetch network error as ProxyError with status 0", async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new TypeError("network down"));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .whoami()
        .catch((e: unknown) => e)) as ProxyError;
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.status).toBe(0);
      expect(err.code).toBe("network_error");
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });
  });

  describe("auth resolution", () => {
    it("resolves async getAuthToken before request", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { login: "a", authorizedSites: [] }),
        );
      const client = createProxyClient({
        baseUrl,
        getAuthToken: () => Promise.resolve("async_token"),
        fetch: fetchMock,
      });
      await client.whoami();
      expect(getInit(fetchMock.mock.calls[0]).headers["Authorization"]).toBe(
        "Bearer async_token",
      );
    });
  });

  describe("baseUrl handling", () => {
    it("strips trailing slash from baseUrl", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { login: "a", authorizedSites: [] }),
        );
      const client = createProxyClient({
        baseUrl: "https://uploads.freecode.camp/",
        getAuthToken,
        fetch: fetchMock,
      });
      await client.whoami();
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/whoami",
      );
    });
  });
});
