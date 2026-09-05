import { describe, expect, test } from "bun:test";
import Quint from "@legacycodehq/tree-sitter-quint";
import Parser from "tree-sitter";
import { checkQuint, formatQuint } from "../../src/index";
import { namedParseTreeSignature } from "../support/parse-tree";

const parser = new Parser();
parser.setLanguage(Quint);

function whitespaceVariant(seed: number): string {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  const pick = (values: string[]) => values[next() % values.length] ?? "";
  const optional = () => pick(["", " ", "  ", "\t", "\n  ", "\r\n\t"]);
  const required = () => pick([" ", "  ", "\t", "\n  ", "\r\n\t"]);

  return [
    "module",
    required(),
    "Fuzz",
    optional(),
    "{",
    required(),
    "val",
    required(),
    "result",
    optional(),
    ":",
    optional(),
    "bool",
    optional(),
    "=",
    optional(),
    "Set",
    optional(),
    "(",
    optional(),
    "1",
    optional(),
    ",",
    optional(),
    "2",
    optional(),
    ")",
    optional(),
    ".",
    optional(),
    "contains",
    optional(),
    "(",
    optional(),
    "1",
    optional(),
    ")",
    optional(),
    "and",
    required(),
    "1",
    optional(),
    "+",
    optional(),
    "2",
    optional(),
    "==",
    optional(),
    "3",
    required(),
    "}",
    pick(["", "\n", "\r\n", "\n\n"]),
  ].join("");
}

describe("formatter properties", () => {
  test("converges for deterministic whitespace fuzz cases", () => {
    const outputs = new Set<string>();

    for (let seed = 1; seed <= 128; seed += 1) {
      const input = whitespaceVariant(seed);
      const output = formatQuint(input);
      outputs.add(output);

      expect(formatQuint(output)).toBe(output);
      expect(checkQuint(output, `fuzz-${seed}.qnt`)).toEqual([]);
      expect(namedParseTreeSignature(parser.parse(output).rootNode)).toEqual(
        namedParseTreeSignature(parser.parse(input).rootNode),
      );
    }

    expect({ cases: 128, uniqueOutputs: outputs.size }).toMatchSnapshot();
    expect(outputs.values().next().value).toMatchSnapshot();
  });
});
