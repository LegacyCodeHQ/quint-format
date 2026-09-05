import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../../src/index";

describe("type declarations", () => {
  test("formats a primitive type alias", () => {
    const input = "module Example {\n  type Count=int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an uninterpreted type", () => {
    const input = "module Example {\n  type   DOMAIN\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a named type alias", () => {
    const input = "module Example {\n  type DOMAIN\n\n  type Copy=DOMAIN\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a polymorphic type alias", () => {
    const input = "module Example {\n  type Box[ a ]=List[a]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a polymorphic type application", () => {
    const input = "module Example {\n  type Box[a] = List[a]\n\n  const boxes:Box[ int ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an inline sum type", () => {
    const input = "module Example {\n  type Elem=S( str )|I( int )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a multiline sum type", () => {
    const input = "module Example {\n  type Option[a] =\n  | Some( a )\n   | None\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments between sum-type variants", () => {
    const input = readFileSync(
      new URL("../fixtures/sum-type-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this variant comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing comments on sum-type variants", () => {
    const input = readFileSync(
      new URL("../fixtures/sum-type-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("| Self(str) // The name of someone who drew themself");
    expect(output).toContain("| Ok        // The draw was Ok");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
