import { execFile } from "node:child_process";
import { runCmdForFiles, runCmdForStdout } from "./docker-runner.js";

// eslint-disable-next-line vitest/prefer-import-in-mock, jest/no-untyped-mock-factory
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const CONTAINER_ID = "abc123def456";
const CWD = "/project";

type MockCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

const makeSucceed = (stdout = "") =>
  ((...rawArgs: unknown[]) => {
    const callback = rawArgs[rawArgs.length - 1] as MockCallback;
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    callback(null, { stderr: "", stdout });
  }) as never;

const makeFail = (err: Error) =>
  ((...rawArgs: unknown[]) => {
    const callback = rawArgs[rawArgs.length - 1] as MockCallback;
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    callback(err);
  }) as never;

const setupMock = (stdoutForStart = "") => {
  vi.mocked(execFile).mockImplementation(
    // Cast to bypass execFile's overloaded signature mismatch
    ((...rawArgs: unknown[]) => {
      const callback = rawArgs[rawArgs.length - 1] as MockCallback;
      const args = rawArgs[1] as string[];
      let stdout = "";
      if (args[0] === "create") {
        stdout = `${CONTAINER_ID}\n`;
      } else if (args[0] === "start") {
        stdout = stdoutForStart;
      }
      // eslint-disable-next-line promise/prefer-await-to-callbacks
      callback(null, { stderr: "", stdout });
    }) as never,
  );
};

describe("docker runner", () => {
  const dockerCalls = () =>
    // eslint-disable-next-line vitest/hoisted-apis-on-top
    vi.mocked(execFile).mock.calls.map((call) => (call[1] as string[]).join(" "));

  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  describe(runCmdForFiles, () => {
    it("creates the container before copying inputs", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      const calls = dockerCalls();
      const createIdx = calls.findIndex((c) => c.startsWith("create"));
      const cpInIdx = calls.findIndex((c) => c.includes("package.json"));
      expect(createIdx).toBeLessThan(cpInIdx);
    });

    it("copies each input file into /app/<filename> before start", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      const calls = dockerCalls();
      expect(calls).toContain(`cp ${CWD}/package.json ${CONTAINER_ID}:/app/package.json`);
    });

    it("copies each output file from /app/<filename> to cwd after start", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      const calls = dockerCalls();
      expect(calls).toContain(`cp ${CONTAINER_ID}:/app/pnpm-lock.yaml ${CWD}/pnpm-lock.yaml`);
    });

    it("copies outputs only after start", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      const calls = dockerCalls();
      const startIdx = calls.findIndex((c) => c.startsWith("start"));
      const cpOutIdx = calls.findIndex((c) => c.includes("pnpm-lock.yaml"));
      expect(startIdx).toBeLessThan(cpOutIdx);
    });

    it("removes the container after completion", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      expect(dockerCalls()).toContain(`rm ${CONTAINER_ID}`);
    });

    it("removes the container even when an error occurs", async () => {
      const mock = vi.mocked(execFile);
      // Build
      mock.mockImplementationOnce(makeSucceed());
      // Create
      mock.mockImplementationOnce(makeSucceed(`${CONTAINER_ID}\n`));
      // Cp package.json
      mock.mockImplementationOnce(makeSucceed());
      // Start (fails)
      mock.mockImplementationOnce(makeFail(new Error("container failed")));
      // Rm
      mock.mockImplementationOnce(makeSucceed());

      await expect(
        runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]),
      ).rejects.toThrow("container failed");
      expect(dockerCalls()).toContain(`rm ${CONTAINER_ID}`);
    });

    it("does not use a -v bind-mount flag", async () => {
      await runCmdForFiles(CWD, ["pnpm", "install"], ["package.json"], ["pnpm-lock.yaml"]);
      expect(dockerCalls().join(" ")).not.toContain("-v");
    });
  });

  describe(runCmdForStdout, () => {
    it("returns the container stdout", async () => {
      setupMock("hello from container\n");
      const result = await runCmdForStdout(CWD, ["pnpm", "list"], ["package.json"]);
      expect(result).toBe("hello from container\n");
    });

    it("copies each input file into /app/<filename> before start", async () => {
      await runCmdForStdout(CWD, ["pnpm", "list"], ["package.json", "pnpm-lock.yaml"]);
      const calls = dockerCalls();
      expect(calls).toContain(`cp ${CWD}/package.json ${CONTAINER_ID}:/app/package.json`);
      expect(calls).toContain(`cp ${CWD}/pnpm-lock.yaml ${CONTAINER_ID}:/app/pnpm-lock.yaml`);
    });

    it("removes the container after completion", async () => {
      await runCmdForStdout(CWD, ["pnpm", "list"], ["package.json"]);
      expect(dockerCalls()).toContain(`rm ${CONTAINER_ID}`);
    });

    it("does not use a -v bind-mount flag", async () => {
      await runCmdForStdout(CWD, ["pnpm", "list"], ["package.json"]);
      expect(dockerCalls().join(" ")).not.toContain("-v");
    });
  });
});
