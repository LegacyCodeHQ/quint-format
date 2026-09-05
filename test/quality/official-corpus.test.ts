import { describe, expect, test } from "bun:test";
import { auditQuintExamples } from "@scripts/check-official-examples.js";

describe("official example corpus audit", () => {
  test("audits every Quint file recursively", async () => {
    const summary = await auditQuintExamples(
      new URL("../corpus-smoke", import.meta.url).pathname,
      false,
    );

    expect(summary).toMatchSnapshot();
  });
});
