interface TemplateContext {
  framework: string;
  name: string;
  pmVersion: string;
  port: number;
  runtime: string;
}

class LayerTemplateRenderer {
  render(template: string, context: TemplateContext): string {
    return template
      .replaceAll("{{name}}", context.name)
      .replaceAll("{{port}}", String(context.port))
      .replaceAll("{{runtime}}", context.runtime)
      .replaceAll("{{framework}}", context.framework)
      .replaceAll("{{pmVersion}}", context.pmVersion);
  }
}

export { LayerTemplateRenderer };
export type { TemplateContext };
