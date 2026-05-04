import { existsSync } from "node:fs";
import { FileTokenStore } from "./auth/file-token-store.js";
import { GithubDeviceFlow } from "./auth/github-device-flow.js";
import { GithubIdentityResolver } from "./auth/github-identity-resolver.js";
import { DEFAULT_PROXY_URL } from "./constants.js";
import { GitRepoInitialiser } from "./io/git-repo-initialiser.js";
import { LocalFilesystemWriter } from "./io/local-filesystem-writer.js";
import { LocalProjectReader } from "./io/local-project-reader.js";
import { StubObservabilityClient } from "./observability/observability-client.stub.js";
import { StubLogsClient } from "./platform/logs-client.stub.js";
import { createProxyClient } from "./platform/http-proxy-client.js";
import { StubRegistrationClient } from "./platform/registration-client.stub.js";
import { StubStatusClient } from "./platform/status-client.stub.js";
import { StubTeardownClient } from "./platform/teardown-client.stub.js";
import { LayerCompositionService } from "./commands/create/layer-composition/layer-composition-service.js";
import { CreateInputValidationService } from "./commands/create/create-input-validation-service.js";
import { PackageManagerService } from "./commands/create/package-manager/package-manager.service.js";
import { BunPackageManager } from "./commands/create/package-manager/bun-package-manager.js";
import { PnpmPackageManager } from "./commands/create/package-manager/pnpm-package-manager.js";
import { PlatformManifestService } from "./services/platform-manifest-service.js";
import { ClackPrompt } from "./commands/create/prompt/clack-prompt.js";
import { dispatch } from "./dispatch.js";
import { clackLogger } from "./output/logger.js";

export const run = async (): Promise<void> => {
  const tokenStore = new FileTokenStore();
  const identityResolver = new GithubIdentityResolver({
    loadStoredToken: () => tokenStore.loadToken(),
  });
  const proxyClient = createProxyClient({
    baseUrl: process.env["UNIVERSE_PROXY_URL"] ?? DEFAULT_PROXY_URL,
    getAuthToken: async () => {
      const identity = await identityResolver.resolve();
      return identity?.token ?? "";
    },
  });

  const deps = {
    deviceFlow: new GithubDeviceFlow(),
    filesystemWriter: new LocalFilesystemWriter(),
    identityResolver,
    layerResolver: new LayerCompositionService(),
    logger: clackLogger,
    logsClient: new StubLogsClient(),
    packageManager: new PackageManagerService({
      bun: new BunPackageManager(),
      pnpm: new PnpmPackageManager(),
    }),
    platformManifestGenerator: new PlatformManifestService(),
    projectReader: new LocalProjectReader(),
    prompt: new ClackPrompt(),
    proxyClient,
    registrationClient: new StubRegistrationClient(),
    repoInitialiser: new GitRepoInitialiser(),
    statusClient: new StubStatusClient(),
    teardownClient: new StubTeardownClient(),
    tokenStore,
    validator: new CreateInputValidationService((path) => existsSync(path)),
  };
  const context = { cwd: process.cwd() };
  const observability = new StubObservabilityClient();

  const { exitCode } = await dispatch(process.argv.slice(2), deps, context, observability);

  process.exitCode = exitCode;
};
