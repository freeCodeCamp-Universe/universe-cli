import { StubDeviceFlow } from "../auth/stub-device-flow.js";
import { StubIdentityResolver } from "../auth/stub-identity-resolver.js";
import { StubTokenStore } from "../auth/stub-token-store.js";
import { StubObservabilityClient } from "../observability/observability-client.stub.js";
import { StubLogsClient } from "../platform/logs-client.stub.js";
import { StubProxyClient } from "../platform/proxy-client.stub.js";
import { StubRegistrationClient } from "../platform/registration-client.stub.js";
import { StubStatusClient } from "../platform/status-client.stub.js";
import { StubTeardownClient } from "../platform/teardown-client.stub.js";
import { StubRepoInitialiser } from "../io/repo-initialiser.stub.js";

/**
 * Returns a fresh set of stub adapter instances for use in tests.
 */
const createAdapterStubs = () => ({
  deviceFlow: new StubDeviceFlow(),
  identityResolver: new StubIdentityResolver(null),
  logsClient: new StubLogsClient(),
  observability: new StubObservabilityClient(),
  proxyClient: new StubProxyClient(),
  registrationClient: new StubRegistrationClient(),
  repoInitialiser: new StubRepoInitialiser(),
  statusClient: new StubStatusClient(),
  teardownClient: new StubTeardownClient(),
  tokenStore: new StubTokenStore(),
});

export { createAdapterStubs };
