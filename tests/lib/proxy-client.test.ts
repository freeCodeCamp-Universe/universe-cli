import { describe, expect, it, vi } from "vitest";
import {
  AliasDriftError,
  createProxyClient,
  ProxyError,
} from "../../src/lib/proxy-client.js";
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

  describe("getAlias", () => {
    it("GETs /api/site/{site}/alias/{mode} with bearer and returns AliasResponse", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          url: "https://my-site.preview.freecode.camp",
          deployId: "20260513-120000-abc1234",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.getAlias({ site: "my-site", mode: "preview" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/my-site/alias/preview",
      );
      const init = getInit(fetchMock.mock.calls[0]);
      expect(init.method).toBe("GET");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(r).toEqual({
        url: "https://my-site.preview.freecode.camp",
        deployId: "20260513-120000-abc1234",
      });
    });

    it("returns null on 404 (alias-key-absent or site-unknown)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: { code: "not_found", message: "no alias" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.getAlias({
        site: "my-site",
        mode: "production",
      });
      expect(r).toBeNull();
    });

    it("throws ProxyError on 400 bad_request", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: { code: "bad_request", message: "bad mode" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .getAlias({ site: "my-site", mode: "preview" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.status).toBe(400);
      expect(err.code).toBe("bad_request");
    });

    it("URL-encodes site path segment", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "y" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.getAlias({ site: "a b", mode: "preview" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/a%20b/alias/preview",
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

    it("passes deployId + expectedCurrent body when provided", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "new-id" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.sitePromote({
        site: "my-site",
        deployId: "new-id",
        expectedCurrent: "old-id",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({
        deployId: "new-id",
        expectedCurrent: "old-id",
      });
    });

    it("sends empty-string expectedCurrent to assert no-prod-yet", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "new-id" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.sitePromote({
        site: "my-site",
        deployId: "new-id",
        expectedCurrent: "",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toEqual({
        deployId: "new-id",
        expectedCurrent: "",
      });
    });

    it("throws AliasDriftError on 409 alias_drift with current field", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: { code: "alias_drift", message: "drift detected" },
          site: "my-site",
          current: "actual-id",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .sitePromote({
          site: "my-site",
          deployId: "new-id",
          expectedCurrent: "stale-id",
        })
        .catch((e: unknown) => e)) as AliasDriftError;
      expect(err).toBeInstanceOf(AliasDriftError);
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.status).toBe(409);
      expect(err.code).toBe("alias_drift");
      expect(err.current).toBe("actual-id");
      expect(err.exitCode).toBe(EXIT_USAGE);
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

    it("includes expectedCurrent in body when provided", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { url: "x", deployId: "old" }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.siteRollback({
        site: "my-site",
        to: "old-id",
        expectedCurrent: "current-id",
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toEqual({
        to: "old-id",
        expectedCurrent: "current-id",
      });
    });

    it("throws AliasDriftError on 409 with current field", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: { code: "alias_drift", message: "drift" },
          site: "my-site",
          current: "newer-id",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .siteRollback({
          site: "my-site",
          to: "old-id",
          expectedCurrent: "stale-id",
        })
        .catch((e: unknown) => e)) as AliasDriftError;
      expect(err).toBeInstanceOf(AliasDriftError);
      expect(err.current).toBe("newer-id");
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

  describe("registerSite", () => {
    const siteRow = {
      slug: "blog",
      teams: ["staff"],
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-10T00:00:00Z",
      createdBy: "alice",
    };

    it("POSTs JSON to /api/site/register with bearer", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, siteRow));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.registerSite({
        slug: "blog",
        teams: ["staff"],
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/register",
      );
      expect(init.method).toBe("POST");
      expect(init.headers["Authorization"]).toBe("Bearer ghp_test");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({
        slug: "blog",
        teams: ["staff"],
      });
      expect(r.slug).toBe("blog");
      expect(r.teams).toEqual(["staff"]);
    });

    it("omits empty teams from body so server applies default", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, siteRow));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.registerSite({ slug: "blog" });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(JSON.parse(init.body as string)).toEqual({ slug: "blog" });
    });

    it("throws ProxyError on 409 already_exists", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: "already_exists",
            message: "site is already registered",
          },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .registerSite({ slug: "blog" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.status).toBe(409);
      expect(err.code).toBe("already_exists");
      expect(err.exitCode).toBe(EXIT_USAGE);
    });
  });

  describe("listSites", () => {
    it("GETs /api/sites with bearer", async () => {
      const rows = [
        {
          slug: "a",
          teams: ["staff"],
          createdAt: "t",
          updatedAt: "t",
          createdBy: "bob",
        },
        {
          slug: "b",
          teams: ["news-editors"],
          createdAt: "t",
          updatedAt: "t",
          createdBy: "carol",
        },
      ];
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, rows));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.listSites();
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/sites",
      );
      expect(getInit(fetchMock.mock.calls[0]).method).toBe("GET");
      expect(r).toEqual(rows);
    });

    it("throws ProxyError on 502 registry_read_failed", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(502, {
          error: { code: "registry_read_failed", message: "valkey down" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .listSites()
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.code).toBe("registry_read_failed");
      expect(err.exitCode).toBe(EXIT_STORAGE);
    });
  });

  describe("updateSite", () => {
    it("PATCHes /api/site/{slug} with body { teams }", async () => {
      const row = {
        slug: "blog",
        teams: ["news-editors", "platform"],
        createdAt: "t",
        updatedAt: "t2",
        createdBy: "alice",
      };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, row));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.updateSite({
        slug: "blog",
        teams: ["news-editors", "platform"],
      });
      const init = getInit(fetchMock.mock.calls[0]);
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/blog",
      );
      expect(init.method).toBe("PATCH");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({
        teams: ["news-editors", "platform"],
      });
      expect(r.teams).toEqual(["news-editors", "platform"]);
    });

    it("URL-encodes slug path segment", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          slug: "x",
          teams: ["staff"],
          createdAt: "t",
          updatedAt: "t",
          createdBy: "u",
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.updateSite({ slug: "a b", teams: ["staff"] });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/a%20b",
      );
    });

    it("throws ProxyError on 404 not_found", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: { code: "not_found", message: "site is not registered" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .updateSite({ slug: "ghost", teams: ["staff"] })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.status).toBe(404);
      expect(err.code).toBe("not_found");
    });
  });

  describe("deleteSite", () => {
    it("DELETEs /api/site/{slug} and returns void on 204", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const r = await client.deleteSite({ slug: "blog" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/blog",
      );
      expect(getInit(fetchMock.mock.calls[0]).method).toBe("DELETE");
      expect(r).toBeUndefined();
    });

    it("URL-encodes slug path segment", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      await client.deleteSite({ slug: "a b" });
      expect(getUrl(fetchMock.mock.calls[0])).toBe(
        "https://uploads.freecode.camp/api/site/a%20b",
      );
    });

    it("throws ProxyError on 404 not_found", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: { code: "not_found", message: "site is not registered" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .deleteSite({ slug: "ghost" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.status).toBe(404);
      expect(err.code).toBe("not_found");
    });

    it("throws ProxyError on 403 user_unauthorized", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(403, {
          error: { code: "user_unauthorized", message: "not staff" },
        }),
      );
      const client = createProxyClient({
        baseUrl,
        getAuthToken,
        fetch: fetchMock,
      });
      const err = (await client
        .deleteSite({ slug: "blog" })
        .catch((e: unknown) => e)) as ProxyError;
      expect(err.exitCode).toBe(EXIT_CREDENTIALS);
    });
  });
});
