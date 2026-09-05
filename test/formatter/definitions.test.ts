import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../../src/index";

describe("definitions", () => {
  test("formats a general assumption expression", () => {
    const input = "module Example {\n  const Flag: bool\n\n  assume Holds=Flag\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless def definition", () => {
    const input = "module Example {\n  def answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a def parameter", () => {
    const input = "module Example {\n  def identity( value )=value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an ignored def parameter", () => {
    const input = "module Example {\n  pure def ignore( _: int ): int = 0\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats multiple def parameters", () => {
    const input = "module Example {\n  def choose(left ,right)=left\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a typed def header", () => {
    const input = "module Example {\n  def identity(value :int) :int=value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("expands a multiline definition header", () => {
    const input = readFileSync(
      new URL("../fixtures/multiline-definition-header.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        "  pure def transfer(",
        "    chainState: str,",
        "    denomination: str,",
        "    amount: int,",
        "    sender: str,",
        "    receiver: str,",
        "    sourcePort: str,",
        "    sourceChannel: str,",
        "    timeoutHeight: int,",
        "    timeoutTimestamp: int,",
        "  ): bool = {",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    const diagnostics = checkQuint(input, "multiline-definition-header.qnt");
    expect([diagnostics[0], diagnostics.at(-1)]).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an untyped parameter with a return type", () => {
    const input = readFileSync(
      new URL("../fixtures/untyped-parameter-return.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats List types in a def header", () => {
    const input = "module Example {\n  def identity(xs: List[ int ]): List[ int ] = xs\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes an optional definition semicolon", () => {
    const input = "module Example {\n  def answer=42;\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
