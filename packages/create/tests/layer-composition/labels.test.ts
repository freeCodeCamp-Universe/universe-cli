import { describe, expect, it } from "vitest";
import { getLabel } from "../../src/layer-composition/labels.js";
import { LabelsSchema } from "../../src/layer-composition/schemas/labels.js";
import labelsFixture from "../fixtures/templates/labels.json";

const labels = LabelsSchema.parse(labelsFixture);

describe(getLabel, () => {
  it("should return the correct label for a given key", () => {
    expect(getLabel(labels, "runtime", "node")).toBe("Node.js");
    expect(getLabel(labels, "framework", "express")).toBe("Express");
  });

  it("should default to the key if no label is found", () => {
    expect(getLabel(labels, "runtime", "unknown-runtime")).toBe("unknown-runtime");
  });
});
