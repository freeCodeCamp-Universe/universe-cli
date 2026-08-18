// SDK entrypoint — public API for programmatic consumers.

// Types
export type { CommandResult } from "./output/command-result.js";
export type { Envelope } from "./output/envelope.js";
export type {
  Step,
  StepResponse,
  TextStep,
  SelectStep,
  MultiselectStep,
  ConfirmStep,
  ProgressStep,
  WarningStep,
  InfoStep,
  CommandGenerator,
} from "./interaction/step.js";

// Interaction driver
export { drive } from "./interaction/driver.js";
export type { StepHandler } from "./interaction/driver.js";
export { clackDriver } from "./interaction/clack-driver.js";
export { silentDrive } from "./interaction/silent-driver.js";

// Commands
export { create } from "./commands/create/index.js";
export type { CreateOptions, CreateDeps } from "./commands/create/index.js";
export { auditLs } from "./commands/audit/ls.js";
export type { AuditLsOptions } from "./commands/audit/ls.js";
export type { AuditSdkDeps } from "./commands/audit/_shared.js";
export { init } from "./commands/init.js";
export type { InitOptions, InitSdkDeps } from "./commands/init.js";
export { login } from "./commands/login.js";
export type { LoginOptions, LoginSdkDeps } from "./commands/login.js";
export { logout } from "./commands/logout.js";
export type { LogoutDeps } from "./commands/logout.js";
export { staticDeploy } from "./commands/deploy.js";
export type { StaticDeployOptions, StaticDeploySdkDeps } from "./commands/deploy.js";
export { staticPromote } from "./commands/promote.js";
export type { StaticPromoteOptions, StaticPromoteSdkDeps } from "./commands/promote.js";
export { staticRollback } from "./commands/rollback.js";
export type { StaticRollbackOptions, StaticRollbackSdkDeps } from "./commands/rollback.js";
export { repoApprove } from "./commands/repo/approve.js";
export type { RepoApproveOptions } from "./commands/repo/approve.js";
export { repoCreate } from "./commands/repo/create.js";
export type { RepoCreateOptions } from "./commands/repo/create.js";
export { repoReject } from "./commands/repo/reject.js";
export type { RepoRejectOptions } from "./commands/repo/reject.js";
export { repoRm } from "./commands/repo/rm.js";
export type { RepoRmOptions } from "./commands/repo/rm.js";
export { repoLs } from "./commands/repo/ls.js";
export type { RepoLsOptions } from "./commands/repo/ls.js";
export { repoStatus } from "./commands/repo/status.js";
export type { RepoStatusOptions } from "./commands/repo/status.js";
export type { RepoSdkDeps } from "./commands/repo/_shared.js";
export { sitesLs } from "./commands/sites/ls.js";
export type { SitesLsOptions } from "./commands/sites/ls.js";
export { sitesRegister } from "./commands/sites/register.js";
export type { SitesRegisterOptions } from "./commands/sites/register.js";
export { sitesRm } from "./commands/sites/rm.js";
export type { SitesRmOptions } from "./commands/sites/rm.js";
export { sitesUpdate } from "./commands/sites/update.js";
export type { SitesUpdateOptions } from "./commands/sites/update.js";
export type { SitesSdkDeps } from "./commands/sites/_shared.js";
export { staticLs } from "./commands/ls.js";
export type { StaticLsOptions, StaticLsDeps } from "./commands/ls.js";
export { whoami } from "./commands/whoami.js";
export type { WhoamiDeps } from "./commands/whoami.js";

// Error classes
export {
  CliError,
  ConfigError,
  CredentialError,
  StorageError,
  GitError,
  ConfirmError,
  PartialUploadError,
  UsageError,
} from "./errors.js";
export { ProxyError, AliasDriftError } from "./lib/proxy-client.js";
