import { EXIT_CREDENTIALS, EXIT_STORAGE, EXIT_USAGE } from "../errors/exit-codes.js";
import { createProxyClient } from "./http-proxy-client.js";
import { ProxyError } from "./proxy-client.port.js";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const baseUrl = "https://uploads.freecode.camp";
const getAuthToken = (): string => "ghp_test";

const getInit = (call: unknown): RequestInit & { headers: Record<string, string> } => {
  const args = call as [string, RequestInit];
  return args[1] as RequestInit & { headers: Record<string, string> };
};

const getUrl = (call: unknown): string => (call as [string, RequestInit])[0];

describe(createProxyClient, () => {
  describe("whoami", () => {
    it("issues GET /api/whoami with bearer token", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { authorizedSites: ["x"], login: "alice" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const r = await client.whoami();
      expect(fetchMock).toHaveBeenCalledOnce();
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe("https://uploads.freecode.camp/api/whoami");
      expect(init.method).toBe("GET");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(r).toStrictEqual({ authorizedSites: ["x"], login: "alice" });
    });

    it("throws ProxyError on 401 with envelope code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { error: { code: "unauth", message: "bad token" } }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = await client.whoami().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProxyError);
      expect((err as ProxyError).status).toBe(401);
      expect((err as ProxyError).code).toBe("unauth");
      expect((err as ProxyError).message).toBe("bad token");
    });
  });

  describe("deployInit", () => {
    it("POSTs to /api/deploy/init with correct method and auth headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          deployId: "20260427-abc1234",
          expiresAt: "2026-04-27T01:00:00Z",
          jwt: "eyJ.x.y",
        }),
      );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.deployInit({ sha: "abc1234", site: "my-site" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe("https://uploads.freecode.camp/api/deploy/init");
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("POSTs correct body to /api/deploy/init and returns deployId and jwt", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          deployId: "20260427-abc1234",
          expiresAt: "2026-04-27T01:00:00Z",
          jwt: "eyJ.x.y",
        }),
      );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const r = await client.deployInit({ sha: "abc1234", site: "my-site" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toStrictEqual({ sha: "abc1234", site: "my-site" });
      expect(r.deployId).toBe("20260427-abc1234");
      expect(r.jwt).toBe("eyJ.x.y");
    });

    it("includes optional files manifest in body", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { deployId: "x", expiresAt: "z", jwt: "y" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.deployInit({ files: ["index.html", "main.js"], sha: "h", site: "s" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toStrictEqual({
        files: ["index.html", "main.js"],
        sha: "h",
        site: "s",
      });
    });
  });

  describe("deployUpload", () => {
    it("PUTs to correct URL with deploy-JWT auth", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { key: "site/deploys/x/index.html", received: "index.html" }),
        );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const body = new Uint8Array([1, 2, 3]);
      await client.deployUpload({
        body,
        contentType: "text/html",
        deployId: "abc",
        jwt: "eyJ.dep.loy",
        path: "index.html",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/abc/upload?path=index.html",
      );
      expect(init.method).toBe("PUT");
      expect(init.headers["Authorization"]).toBe("Bearer eyJ.dep.loy");
      expect(init.headers["Content-Type"]).toBe("text/html");
    });

    it("PUTs raw body and returns received path", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { key: "site/deploys/x/index.html", received: "index.html" }),
        );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const body = new Uint8Array([1, 2, 3]);
      const r = await client.deployUpload({
        body,
        contentType: "text/html",
        deployId: "abc",
        jwt: "eyJ.dep.loy",
        path: "index.html",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(init.body).toBe(body);
      expect(r.received).toBe("index.html");
    });

    it("URL-encodes path query parameter", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { key: "x", received: "a b/c.html" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.deployUpload({
        body: new Uint8Array(),
        deployId: "d",
        jwt: "j",
        path: "a b/c.html",
      });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/d/upload?path=a%20b%2Fc.html",
      );
    });

    it("uses application/octet-stream when contentType omitted", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { key: "y", received: "x" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.deployUpload({ body: new Uint8Array(), deployId: "d", jwt: "j", path: "x" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(init.headers["Content-Type"]).toBe("application/octet-stream");
    });
  });

  describe("deployFinalize", () => {
    it("POSTs to correct URL with deploy-JWT and mode+files body", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          deployId: "abc",
          mode: "preview",
          url: "https://my-site.preview.freecode.camp",
        }),
      );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.deployFinalize({
        deployId: "abc",
        files: ["index.html"],
        jwt: "j",
        mode: "preview",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/deploy/abc/finalize",
      );
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer j");
      expect(JSON.parse(init.body as string)).toStrictEqual({
        files: ["index.html"],
        mode: "preview",
      });
    });

    it("deployFinalize returns url and mode from response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          deployId: "abc",
          mode: "preview",
          url: "https://my-site.preview.freecode.camp",
        }),
      );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const r = await client.deployFinalize({
        deployId: "abc",
        files: ["index.html"],
        jwt: "j",
        mode: "preview",
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
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = await client
        .deployFinalize({ deployId: "d", files: ["a"], jwt: "j", mode: "preview" })
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
        .mockResolvedValue(jsonResponse(200, [{ deployId: "x" }, { deployId: "y" }]));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const r = await client.siteDeploys({ site: "my-site" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/deploys",
      );
      expect(getInit(fetchMock.mock.calls[0]).method).toBe("GET");
      expect(r).toStrictEqual([{ deployId: "x" }, { deployId: "y" }]);
    });

    it("URL-encodes site path segment", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      await client.siteDeploys({ site: "a b" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/a%20b/deploys",
      );
    });
  });

  describe("sitePromote", () => {
    it("POSTs /api/site/{site}/promote with bearer", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { deployId: "y", url: "x" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
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
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { deployId: "old", url: "x" }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const r = await client.siteRollback({ site: "my-site", to: "old" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/rollback",
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toStrictEqual({ to: "old" });
      expect(r.deployId).toBe("old");
    });
  });

  describe("error handling", () => {
    it("maps status 401 to EXIT_CREDENTIALS exit code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { error: { code: "unauth", message: "bad token" } }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client.whoami().catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps status 403 to EXIT_CREDENTIALS exit code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { error: { code: "site_unauthorized", message: "no team" } }),
        );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client.whoami().catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });

    it("maps status 422 to EXIT_STORAGE exit code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(422, { error: { code: "verify_failed", message: "x" } }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client
        .deployFinalize({ deployId: "d", files: [], jwt: "j", mode: "preview" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });

    it("maps status 5xx to EXIT_STORAGE exit code", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client.whoami().catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_STORAGE);
      expect(err.status).toBe(500);
      expect(err.code).toBe("http_500");
    });

    it("maps status 400 to EXIT_USAGE exit code", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(400, { error: { code: "bad_request", message: "site required" } }),
        );
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client
        .deployInit({ sha: "x", site: "" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_USAGE);
      expect(err.code).toBe("bad_request");
    });

    it("wraps fetch network error as ProxyError with status 0", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
      const client = createProxyClient({ baseUrl, fetch: fetchMock, getAuthToken });
      const err = (await client.whoami().catch((e: unknown) => e)) as ProxyError;
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
        .mockResolvedValue(jsonResponse(200, { authorizedSites: [], login: "a" }));
      const client = createProxyClient({
        baseUrl,
        fetch: fetchMock,
        getAuthToken: () => Promise.resolve("async_token"),
      });
      await client.whoami();
      expect(getInit(fetchMock.mock.calls[0]).headers["Authorization"]).toBe("Bearer async_token");
    });
  });

  describe("baseUrl handling", () => {
    it("strips trailing slash from baseUrl", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { authorizedSites: [], login: "a" }));
      const client = createProxyClient({
        baseUrl: "https://uploads.freecode.camp/",
        fetch: fetchMock,
        getAuthToken,
      });
      await client.whoami();
      expect(getUrl(fetchMock.mock.calls[0])).toBe("https://uploads.freecode.camp/api/whoami");
    });
  });
});
