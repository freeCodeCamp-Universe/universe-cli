import assets from "./assets.json" with { type: "json" };

const templateVersionRange: string = assets.templateVersion;

const resolveTemplateUrl = (version: string): string =>
  assets.templateUrl.replaceAll("{{version}}", version);

export { templateVersionRange, resolveTemplateUrl };
