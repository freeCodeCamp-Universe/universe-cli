import { PackageManagerService } from "./package-manager.service.js";
import type { PackageSpecifier } from "./package-specifier.port.js";

const makeMockManager = (): PackageSpecifier => ({
  specifyDeps: vi.fn().mockResolvedValue(undefined),
});

describe(PackageManagerService, () => {
  let pnpm: PackageSpecifier;
  let bun: PackageSpecifier;
  let svc: PackageManagerService;

  beforeEach(() => {
    pnpm = makeMockManager();
    bun = makeMockManager();
    svc = new PackageManagerService({ bun, pnpm });
  });

  it("dispatches to pnpm adapter for pnpm selection", async () => {
    await svc.specifyDeps({ manager: "pnpm", projectDirectory: "/proj" });
    expect(pnpm.specifyDeps).toHaveBeenCalledWith("/proj"); // oxlint-disable-line unbound-method
    expect(bun.specifyDeps).not.toHaveBeenCalled(); // oxlint-disable-line unbound-method
  });

  it("dispatches to bun adapter for bun selection", async () => {
    await svc.specifyDeps({ manager: "bun", projectDirectory: "/proj" });
    expect(bun.specifyDeps).toHaveBeenCalledWith("/proj"); // oxlint-disable-line unbound-method
    expect(pnpm.specifyDeps).not.toHaveBeenCalled(); // oxlint-disable-line unbound-method
  });

  it("throws for unknown manager", async () => {
    await expect(
      svc.specifyDeps({ manager: "yarn" as unknown as "bun", projectDirectory: "/proj" }),
    ).rejects.toThrow(/Unknown package manager/);
  });

  it("propagates errors from adapters", async () => {
    vi.spyOn(pnpm, "specifyDeps").mockRejectedValue(new Error("fail"));
    await expect(svc.specifyDeps({ manager: "pnpm", projectDirectory: "/proj" })).rejects.toThrow(
      "fail",
    );
  });
});
