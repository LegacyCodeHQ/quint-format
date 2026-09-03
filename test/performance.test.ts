import { describe, expect, test } from "bun:test";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "../src/index";
import { namedParseTreeSignature } from "./support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

describe("large-file hardening", () => {
  test("formats one thousand definitions within a generous budget", () => {
    const definitions = Array.from(
      { length: 1_000 },
      (_, index) => `val value${index}=${index}+1`,
    ).join("\n");
    const input = `module Large{\n${definitions}\n}\n`;

    const startedAt = performance.now();
    const output = formatQuint(input);
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(elapsedMilliseconds).toBeLessThan(2_000);
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "large.qnt")).toEqual([]);
    expect(namedParseTreeSignature(parser.parse(output).rootNode)).toEqual(
      namedParseTreeSignature(parser.parse(input).rootNode),
    );
    expect({
      definitions: 1_000,
      inputBytes: Buffer.byteLength(input),
      outputBytes: Buffer.byteLength(output),
      outputLines: output.split("\n").length - 1,
    }).toMatchSnapshot();
  });
});
