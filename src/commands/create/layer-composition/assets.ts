import assets from "./assets.json" with { type: "json" };

const defaultTemplateVersion: string = assets.templateVersion;

const resolveTemplateUrl = (version: string): string =>
  assets.templateUrl.replaceAll("{{version}}", version);

export { defaultTemplateVersion, resolveTemplateUrl };
