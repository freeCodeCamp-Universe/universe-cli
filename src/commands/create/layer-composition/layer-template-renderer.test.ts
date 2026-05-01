import { LayerTemplateRenderer } from "./layer-template-renderer.js";

const rendererContext = {
  framework: "Express",
  name: "my-app",
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

  it("returns the template unchanged when given an empty context", () => {
    const renderer = new LayerTemplateRenderer();

    const result = renderer.render("hello={{name}}", {
      framework: "",
      name: "",
      port: 0,
      runtime: "",
    });

    expect(result).toBe("hello=");
  });
});
