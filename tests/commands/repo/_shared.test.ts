import { describe, expect, it } from "vitest";
import type { RepoRow } from "../../../src/lib/proxy-client.js";
import { formatRepoTable } from "../../../src/commands/repo/_shared.js";

function row(over: Partial<RepoRow>): RepoRow {
  return {
    id: "req_001",
    name: "my-repo",
    owner: "freeCodeCamp-Universe",
    visibility: "private",
    status: "pending",
    requestedBy: "alice",
    createdAt: "2026-05-29T12:00:00Z",
    updatedAt: "2026-05-29T12:00:00Z",
    ...over,
  };
}

describe("formatRepoTable", () => {
  it("returns the empty message when there are no rows", () => {
    expect(formatRepoTable([])).toBe("No repo requests.");
    expect(formatRepoTable([], "No pending requests.")).toBe(
      "No pending requests.",
    );
  });

  it("renders a header row and one line per request", () => {
    const out = formatRepoTable([
      row({ id: "req_001", name: "alpha" }),
      row({
        id: "req_002",
        name: "beta",
        status: "active",
        requestedBy: "bob",
      }),
    ]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toContain("ID");
    expect(lines[0]).toContain("REPO");
    expect(lines[0]).toContain("STATUS");
    expect(lines[1]).toContain("alpha");
    expect(lines[2]).toContain("beta");
    expect(lines[2]).toContain("active");
  });

  it("shows approver and resolve latency for resolved rows", () => {
    const out = formatRepoTable([
      row({
        id: "req_010",
        name: "shipped",
        status: "active",
        approver: "boss",
        createdAt: "2026-05-29T12:00:00Z",
        updatedAt: "2026-05-29T12:05:30Z",
      }),
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toContain("APPROVER");
    expect(lines[0]).toContain("LATENCY");
    expect(lines[1]).toContain("boss");
    expect(lines[1]).toContain("5m");
  });

  it("pads columns to align cells", () => {
    const out = formatRepoTable([row({ id: "req_long_id_here", name: "x" })]);
    const [header, dataRow] = out.split("\n");
    // REPO column starts at the same offset on both lines.
    expect(header.indexOf("REPO")).toBe(dataRow.indexOf("x"));
  });
});
