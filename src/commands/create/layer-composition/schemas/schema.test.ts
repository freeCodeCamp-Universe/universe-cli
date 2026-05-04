import {
  AlwaysSchema,
  DatabaseSchema,
  FrameworkSchema,
  PackageManagerSchema,
  RuntimeSchema,
  ServiceSchema,
} from "./layers.js";
import alwaysJson from "../layers/always.json" with { type: "json" };
import databaseJson from "../layers/database.json" with { type: "json" };
import frameworkJson from "../layers/framework.json" with { type: "json" };
import packageManagersJson from "../layers/package-manager.json" with { type: "json" };
import runtimeJson from "../layers/runtime.json" with { type: "json" };
import serviceJson from "../layers/service.json" with { type: "json" };
import labelsJson from "../labels.json" with { type: "json" };
import { LabelsSchema } from "./labels.js";

describe("always layer", () => {
  it("always.json matches the schema", () => {
    const parsed = AlwaysSchema.safeParse(alwaysJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("database layer", () => {
  it("should match the schema", () => {
    const parsed = DatabaseSchema.safeParse(databaseJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("framework layer", () => {
  it("should match the schema", () => {
    const parsed = FrameworkSchema.safeParse(frameworkJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("package manager layer", () => {
  it("should match the schema", () => {
    const parsed = PackageManagerSchema.safeParse(packageManagersJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("runtime layer", () => {
  it("should match the schema", () => {
    const parsed = RuntimeSchema.safeParse(runtimeJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("service layer", () => {
  it("should match the schema", () => {
    const parsed = ServiceSchema.safeParse(serviceJson);
    expect(parsed.error).toBeUndefined();
  });
});

describe("labels", () => {
  it("should match the schema", () => {
    const parsed = LabelsSchema.safeParse(labelsJson);
    expect(parsed.error).toBeUndefined();
  });
});
