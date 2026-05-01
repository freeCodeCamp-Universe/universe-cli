import { getLabel } from "./labels.js";

describe(getLabel, () => {
  it("should return the correct label for a given key", () => {
    expect(getLabel("runtime", "node")).toBe("Node.js");
    expect(getLabel("framework", "express")).toBe("Express");
  });

  it("should default to the key if no label is found", () => {
    expect(getLabel("runtime", "unknown-runtime")).toBe("unknown-runtime");
  });
});
