import { describe, it, expectTypeOf } from "vitest";

// Asserts that tsconfig.json strict flags are active. This test is primarily
// compile-time: if noUncheckedIndexedAccess is off, the @ts-expect-error lines
// below become unused-directive errors and this file fails to type-check.
describe("tsconfig strict flags", () => {
  it("noUncheckedIndexedAccess: array index returns T | undefined", () => {
    const arr: number[] = [1, 2, 3];
    expectTypeOf(arr[0]).toEqualTypeOf<number | undefined>();

    // Unguarded access cannot be assigned to T directly — requires narrowing.
    // @ts-expect-error — arr[0] is number | undefined, not number
    const direct: number = arr[0];
    void direct;
  });

  it("exactOptionalPropertyTypes: optional prop rejects explicit undefined", () => {
    interface Box {
      label?: string;
    }
    // @ts-expect-error — exactOptionalPropertyTypes forbids passing undefined
    // to an optional property unless its type explicitly includes undefined.
    const b: Box = { label: undefined };
    void b;
  });
});
