import { describe, expect, it } from "vitest";
import { LayerTemplateRenderer } from "../../../../src/commands/create/layer-composition/layer-template-renderer.js";

const rendererContext = {
  framework: "Express",
  name: "my-app",
  pmVersion: "10.12.1",
  port: 3000,
  runtime: "Node.js (TypeScript)",
};

describe(LayerTemplateRenderer, () => {
  it("substitutes all defined variables in a template string", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render(
      "name={{name}} runtime={{runtime}} framework={{framework}}",
      rendererContext,
    );

    expect(result).toBe("name=my-app runtime=Node.js (TypeScript) framework=Express");
  });

  it("leaves unknown placeholders unchanged", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("hello={{unknown}} name={{name}}", rendererContext);

    expect(result).toBe("hello={{unknown}} name=my-app");
  });

  it("substitutes multiple occurrences of the same variable", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("{{name}}/{{name}}.ts", rendererContext);

    expect(result).toBe("my-app/my-app.ts");
  });

  it("substitutes {{port}} with the numeric port", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("port={{port}}", rendererContext);

    expect(result).toBe("port=3000");
  });

  it("substitutes {{pmVersion}} with the package manager version", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("RUN npm i -g bun@{{pmVersion}}", rendererContext);

    expect(result).toBe("RUN npm i -g bun@10.12.1");
  });

  it("returns the template unchanged when given an empty context", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("hello={{name}}", {
      framework: "",
      name: "",
      pmVersion: "",
      port: 0,
      runtime: "",
    });

    expect(result).toBe("hello=");
  });
});
