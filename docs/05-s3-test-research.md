# S3-Compatible Test Backend Research

Research conducted 2026-04-13 for universe-cli static deploy CLI.

## Context

The universe-cli storage adapter uses `@aws-sdk/client-s3` v3 and `@aws-sdk/lib-storage` to interact with Cloudflare R2 (bucket `gxy-static-1`, region `auto`, endpoint-based config). Testing needs to cover both unit-level isolation and integration-level correctness against real S3-compatible backends.

Required S3 operations: `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command`, `HeadObjectCommand`, `DeleteObjectCommand`, `DeleteObjectsCommand`.

MinIO is NO-GO per Universe tool-validation.md (AGPL license, community edition stripped of Web UI/SSO/LDAP in 2025, enterprise $96K/year).

## Candidate Evaluation

### 1. aws-sdk-client-mock

Mock `@aws-sdk/client-s3` at the SDK level. No network, no server.

| Attribute          | Detail                                                          |
| ------------------ | --------------------------------------------------------------- |
| License            | MIT                                                             |
| Cost               | Free                                                            |
| Setup              | `npm install -D aws-sdk-client-mock aws-sdk-client-mock-vitest` |
| Docker required    | No                                                              |
| Latest version     | v4.x (last published ~2025, 905 GitHub stars)                   |
| Companion packages | `aws-sdk-client-mock-vitest` for custom matchers                |
| Maintenance        | Active. Maintained by m-radzikowski. Regular releases.          |

**API coverage:**

All six required commands are mockable since the library intercepts any `@aws-sdk/client-s3` command at the middleware layer. There is no API gap — every command the SDK supports can be mocked.

- PutObjectCommand: yes
- GetObjectCommand: yes (use `sdkStreamMixin` from `@smithy/util-stream` for stream responses)
- ListObjectsV2Command: yes
- HeadObjectCommand: yes
- DeleteObjectCommand: yes
- DeleteObjectsCommand: yes

**vitest integration:**

First-class. The `aws-sdk-client-mock-vitest` package provides custom matchers (`toHaveReceivedCommandWith`, `toHaveReceivedCommandTimes`, etc.) that extend vitest's `expect`. Setup requires a single `setupFiles` entry.

**Strengths:**

- Zero infrastructure. Runs in-process, sub-millisecond.
- Full type safety with SDK v3 command types.
- Fluent API: `.on(PutObjectCommand).resolves({})`.
- Can assert call order, parameters, and call counts.
- Perfect for testing business logic (deploy ID generation, alias management, metadata construction) without network.

**Limitations:**

- Does not validate that S3 operations actually work against a real backend.
- Cannot catch endpoint misconfiguration, auth issues, or R2 behavioral quirks.
- Cannot test multipart upload flow through `@aws-sdk/lib-storage` Upload class realistically (only mocks the underlying commands).

**Verdict: GO — Primary unit testing approach.**

### 2. s3rver

Lightweight fake S3 server in Node.js. Runs in-process or as standalone.

| Attribute                 | Detail                                                   |
| ------------------------- | -------------------------------------------------------- |
| License                   | MIT                                                      |
| Cost                      | Free                                                     |
| Setup                     | `npm install -D s3rver`                                  |
| Docker required           | No                                                       |
| Latest version (original) | v3.7.1 (last published 2021)                             |
| Original repo             | `jamhall/s3rver` — archived Sep 2025, read-only          |
| Community fork            | `@20minutes/s3rver` v4.0.2 (published ~Jan 2026)         |
| Maintenance               | Original: dead. Fork: low activity, uncertain longevity. |

**API coverage:**

s3rver implements a subset of S3. Based on the original repo documentation:

- PutObject: yes
- GetObject: yes
- ListObjectsV2: partial (v2 listing may not be fully implemented in older versions)
- HeadObject: yes
- DeleteObject: yes
- DeleteObjects: uncertain — bulk delete support is inconsistent across versions

**vitest integration:**

Programmatic API allows starting the server in `beforeAll` and tearing down in `afterAll`. Point `S3Client` at `http://localhost:{port}` with `forcePathStyle: true`. No vitest-specific package exists.

**Strengths:**

- Pure npm, no Docker, no external dependencies.
- Can serve as a lightweight integration test target.
- Programmatic start/stop fits test lifecycle.

**Limitations:**

- Original repo archived. Maintenance is a community fork with low commit velocity.
- Incomplete S3 API surface — edge cases in multipart upload, versioning, and bulk operations.
- No active maintainer with a track record of timely fixes.
- Filesystem-backed storage adds cleanup overhead in tests.

**Verdict: NO-GO — Archived upstream, unreliable API coverage, uncertain fork longevity.**

### 3. LocalStack (Community Edition)

Full AWS service emulation in Docker. S3 is a core community service.

| Attribute       | Detail                                                                             |
| --------------- | ---------------------------------------------------------------------------------- |
| License         | Apache 2.0 (was). Now requires auth token for all images.                          |
| Cost            | Free Hobby plan (non-commercial). Paid for commercial use.                         |
| Setup           | Docker + `LOCALSTACK_AUTH_TOKEN` required since March 2026                         |
| Docker required | Yes                                                                                |
| Breaking change | March 23, 2026: community edition EOL, unified image requires account + auth token |

**API coverage:**

LocalStack's S3 emulation is comprehensive:

- PutObjectCommand: yes
- GetObjectCommand: yes
- ListObjectsV2Command: yes
- HeadObjectCommand: yes
- DeleteObjectCommand: yes
- DeleteObjectsCommand: yes

**vitest integration:**

Start LocalStack via Docker in `globalSetup`, point `S3Client` at `http://localhost:4566` with `forcePathStyle: true`. Testcontainers can automate lifecycle.

**Strengths:**

- Most complete S3 emulation available.
- Well-documented, large community.

**Limitations:**

- As of March 2026, the community edition is discontinued. All images now require a LocalStack account and auth token.
- The free Hobby plan restricts to non-commercial use.
- Docker dependency adds CI complexity and slower test startup.
- Overkill for this project — we need S3 only, not 80+ AWS services.
- Auth token requirement means contributor onboarding friction and CI secret management.

**Verdict: NO-GO — License change in March 2026 killed the free community edition. Auth token requirement for all usage is unacceptable for an open-source project's test suite.**

### 4. Cloudflare Miniflare/wrangler (R2 Local Emulation)

Miniflare v3 (bundled with wrangler) can emulate R2 buckets locally using workerd runtime.

| Attribute       | Detail                                           |
| --------------- | ------------------------------------------------ |
| License         | Apache 2.0 (miniflare), MIT (wrangler)           |
| Cost            | Free                                             |
| Setup           | `npm install -D miniflare` or via `wrangler dev` |
| Docker required | No                                               |

**API coverage — critical limitation:**

Miniflare R2 exposes the **Workers R2 binding API** (`env.BUCKET.put()`, `env.BUCKET.get()`), **not** an S3-compatible HTTP endpoint. There is no local endpoint you can point `@aws-sdk/client-s3` at.

This means: the universe-cli storage adapter, which uses `S3Client` with `PutObjectCommand`/`GetObjectCommand`/etc., **cannot be tested against Miniflare R2** without rewriting the adapter to use the Workers binding API — which is not the production interface.

- PutObjectCommand via S3 API: **no** (no S3-compatible endpoint)
- GetObjectCommand via S3 API: **no**
- ListObjectsV2Command via S3 API: **no**
- HeadObjectCommand via S3 API: **no**
- DeleteObjectCommand via S3 API: **no**
- DeleteObjectsCommand via S3 API: **no**

**Verdict: NO-GO — Miniflare R2 does not expose an S3-compatible HTTP endpoint. Cannot test `@aws-sdk/client-s3` code against it.**

### 5. Direct R2 Testing (Live gxy-static-1 Bucket)

Test against the actual production or staging Cloudflare R2 bucket using real credentials.

| Attribute       | Detail                                                    |
| --------------- | --------------------------------------------------------- |
| License         | Cloudflare R2 pricing (free egress, $0.015/GB/mo storage) |
| Cost            | Negligible for test data volumes                          |
| Setup           | R2 API token with appropriate permissions                 |
| Docker required | No                                                        |

**API coverage:**

All R2 S3 API operations are confirmed supported (verified from Cloudflare R2 S3 API docs):

- PutObjectCommand: yes
- GetObjectCommand: yes
- ListObjectsV2Command: yes
- HeadObjectCommand: yes
- DeleteObjectCommand: yes
- DeleteObjectsCommand: yes

**vitest integration:**

Point `S3Client` at R2 endpoint with real credentials. Use a test-specific prefix (e.g., `_test/{run-id}/`) to isolate test data. Clean up in `afterAll`.

**Strengths:**

- Tests against the actual production backend — no behavior gaps.
- Validates real endpoint config, auth, region handling (`auto`).
- Catches R2-specific quirks (e.g., `@aws-sdk/client-s3` v3.729.0 broke `UploadPart`/`PutObject` R2 compatibility — a unit mock would never catch this).
- Zero infrastructure to maintain.

**Limitations:**

- Requires R2 credentials (CI secret, not available to external contributors).
- Network-dependent — slower, flaky on bad connections.
- Cannot run offline.
- Must be gated behind an environment variable to avoid running on every local test invocation.

**Verdict: GO — Secondary integration testing approach, gated behind credentials.**

## Recommendation

### Two-tier testing strategy

**Tier 1: Unit tests with aws-sdk-client-mock (primary, always runs)**

All storage adapter logic tested with SDK-level mocks. Covers:

- Command construction (correct Bucket, Key, ContentType, CacheControl)
- Deploy ID generation and collision handling
- Alias read/write (single-line file content)
- List/filter logic with prefix
- Delete operations (single and bulk)
- Error handling paths (access denied, not found, network errors)
- Upload metadata (content-type inference, cache-control headers)

These tests run on every `vitest` invocation with zero setup.

**Tier 2: Integration tests against live R2 (secondary, CI-only)**

A small suite of end-to-end storage operations against the real R2 bucket, gated behind `R2_INTEGRATION=1` (or presence of `S3_ACCESS_KEY_ID`). Covers:

- Round-trip: upload file, read it back, verify content
- Alias write and read
- List with prefix
- Delete and verify removal
- Multipart upload via `@aws-sdk/lib-storage` Upload class

These tests run in CI with credentials and can be invoked locally by developers with R2 access.

### vitest setup for Tier 1 (aws-sdk-client-mock)

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
  },
});
```

```typescript
// tests/setup.ts
import "aws-sdk-client-mock-vitest/extend";
```

```typescript
// tests/storage-adapter.test.ts
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { sdkStreamMixin } from "@smithy/util-stream";
import { Readable } from "node:stream";
import { describe, it, expect, beforeEach } from "vitest";

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe("storage adapter", () => {
  it("uploads a file with correct metadata", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    // Call your storage adapter upload function here
    // await storageAdapter.uploadFile('my-site', 'deploys/20260413-120000-abc1234/index.html', buffer);

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "gxy-static-1",
      Key: "my-site/deploys/20260413-120000-abc1234/index.html",
      ContentType: "text/html",
      CacheControl: "public, max-age=60, must-revalidate",
    });
  });

  it("reads an alias file", async () => {
    const stream = sdkStreamMixin(
      Readable.from([Buffer.from("20260413-120000-abc1234")]),
    );
    s3Mock.on(GetObjectCommand).resolves({ Body: stream });

    // const deployId = await storageAdapter.readAlias('my-site', 'preview');

    expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
      Bucket: "gxy-static-1",
      Key: "my-site/preview",
    });
  });

  it("lists deploys with prefix", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      CommonPrefixes: [
        { Prefix: "my-site/deploys/20260413-120000-abc1234/" },
        { Prefix: "my-site/deploys/20260412-100000-def5678/" },
      ],
    });

    // const deploys = await storageAdapter.listDeploys('my-site');

    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
      Bucket: "gxy-static-1",
      Prefix: "my-site/deploys/",
      Delimiter: "/",
    });
  });

  it("checks if a deploy exists", async () => {
    s3Mock.on(HeadObjectCommand).resolves({});

    // const exists = await storageAdapter.deployExists('my-site', '20260413-120000-abc1234');

    expect(s3Mock).toHaveReceivedCommandWith(HeadObjectCommand, {
      Bucket: "gxy-static-1",
      Key: "my-site/deploys/20260413-120000-abc1234/",
    });
  });

  it("deletes a single deploy artifact", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    // await storageAdapter.deleteObject('my-site', 'deploys/old/file.js');

    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectCommand, {
      Bucket: "gxy-static-1",
      Key: "my-site/deploys/old/file.js",
    });
  });

  it("bulk deletes deploy artifacts", async () => {
    s3Mock
      .on(DeleteObjectsCommand)
      .resolves({ Deleted: [{ Key: "a" }, { Key: "b" }] });

    // await storageAdapter.bulkDelete('my-site', ['a', 'b']);

    expect(s3Mock).toHaveReceivedCommandWith(DeleteObjectsCommand, {
      Bucket: "gxy-static-1",
      Delete: {
        Objects: [{ Key: "a" }, { Key: "b" }],
      },
    });
  });
});
```

### vitest setup for Tier 2 (live R2 integration)

```typescript
// tests/integration/r2.integration.test.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN_INTEGRATION =
  process.env.R2_INTEGRATION === "1" ||
  (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

describe.skipIf(!RUN_INTEGRATION)("R2 integration", () => {
  const testPrefix = `_test/${Date.now()}/`;
  let client: S3Client;

  beforeAll(() => {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  });

  afterAll(async () => {
    // Clean up test prefix
  });

  it("round-trips a file", async () => {
    const key = `${testPrefix}hello.txt`;
    await client.send(
      new PutObjectCommand({
        Bucket: "gxy-static-1",
        Key: key,
        Body: "hello world",
        ContentType: "text/plain",
      }),
    );

    const result = await client.send(
      new GetObjectCommand({
        Bucket: "gxy-static-1",
        Key: key,
      }),
    );
    const body = await result.Body!.transformToString();
    expect(body).toBe("hello world");
  });
});
```

## Summary Table

| Candidate           | License          | Docker           | S3 API Coverage       | Maintenance          | Verdict                                 |
| ------------------- | ---------------- | ---------------- | --------------------- | -------------------- | --------------------------------------- |
| aws-sdk-client-mock | MIT              | No               | Full (mock layer)     | Active               | **GO** — primary unit testing           |
| s3rver              | MIT              | No               | Partial, aging        | Archived Sep 2025    | **NO-GO** — dead upstream               |
| LocalStack          | Apache 2.0 (was) | Yes + auth token | Full                  | Active but paywalled | **NO-GO** — free tier killed March 2026 |
| Miniflare/wrangler  | Apache 2.0 / MIT | No               | None (no S3 endpoint) | Active               | **NO-GO** — wrong API surface           |
| Direct R2           | Cloudflare SaaS  | No               | Full (production)     | N/A                  | **GO** — secondary integration          |

## Dependencies to Install

```
npm install -D aws-sdk-client-mock aws-sdk-client-mock-vitest @smithy/util-stream
```

Production dependencies (already planned per tooling research):

```
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
```
