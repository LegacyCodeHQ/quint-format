import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuint, formatQuint } from "../src/index";

describe("formatter", () => {
  test("formats an empty module", () => {
    const input = "module Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing after the module keyword", () => {
    const input = "module   Example {\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing before the module brace", () => {
    const input = "module Example{\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line after the module opening brace", () => {
    const input = readFileSync(new URL("fixtures/module-opening-gap.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("module Example {\n\n  // The first declaration's documentation.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats excess final newlines", () => {
    const input = "module Example {\n}\n\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents a variable declaration in a module", () => {
    const input = "module Example {\nvar n: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing after a type colon", () => {
    const input = "module Example {\n  var n:int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes spacing before a type colon", () => {
    const input = "module Example {\n  var n : int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing after var", () => {
    const input = "module Example {\n  var   n: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a constant declaration", () => {
    const input = "module Example {\nconst N: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a Set type", () => {
    const input = "module Example {\n  const Values:Set[ int ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a tuple type", () => {
    const input = "module Example {\n  const Pair:( int ,str )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record type", () => {
    const input = "module Example {\n  const User:{ name: str,active:bool }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline record type", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-record-type.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("type Account = {\n    owner: str,\n    balance: int,\n  }");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in a record type", () => {
    const input = readFileSync(
      new URL("fixtures/record-type-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this field comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments in a record type", () => {
    const input = readFileSync(
      new URL("fixtures/record-type-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an empty record type", () => {
    const input = readFileSync(new URL("fixtures/empty-record-type.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an open record type", () => {
    const input = "module Example {\n  const User:{ name: str|r }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a function type", () => {
    const input = "module Example {\n  const mapper:int->str\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an operator type", () => {
    const input = "module Example {\n  const predicate:( int ,str )=>bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a zero-parameter operator type", () => {
    const input = "module Example {\n  const thunk: ( ) => bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a direct operator type", () => {
    const input = "module Example {\n  const predicate:int=>bool\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parenthesized type", () => {
    const input = "module Example {\n  const values: ( Set[ int ] )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a unit type", () => {
    const input = "module Example {\n  const empty: ( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places declarations on separate lines", () => {
    const input = "module Example {\n  var a: int  var b: int\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a Boolean assumption", () => {
    const input = "module Example {\nassume Safe = true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats spacing around assumption equals", () => {
    const input = "module Example {\n  assume Safe=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an integer value definition", () => {
    const input = "module Example {\nval answer = 42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("removes an optional value semicolon", () => {
    const input = "module Example {\n  val answer=42;\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a Boolean value definition", () => {
    const input = "module Example {\nval ready = true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a string value definition", () => {
    const input = 'module Example {\nval greeting = "hello"\n}\n';
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a typed value definition", () => {
    const input = "module Example {\nval answer:int=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an integer addition expression", () => {
    const input = "module Example {\nval total=1+2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an identifier value expression", () => {
    const input = "module Example {\nconst source: int\nval copy=source\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a unit literal", () => {
    const input = "module Example {\n  val empty = ( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a list literal", () => {
    const input = "module Example {\n  val values = [ 1 ,2, ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicitly expanded list literal", () => {
    const input = readFileSync(new URL("fixtures/expanded-list.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a tuple literal", () => {
    const input = "module Example {\n  val pair = ( 1 ,2, )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record literal", () => {
    const input = 'module Example {\n  val user = {name :"Alice" ,age:42, }\n}\n';
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline record literal", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-record-literal.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain('pure val account = {\n    owner: "alice",\n    balance: 0,\n  }');
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record spread", () => {
    const input = "module Example {\n  val extended = {b:2 ,... {a:1}}\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in record literals", () => {
    const input = readFileSync(new URL("fixtures/commented-record.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a tuple destructuring pattern", () => {
    const input = "module Example {\n  pure val ( first ,_ ) = (1, 2)\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in a tuple destructuring pattern", () => {
    const input = readFileSync(
      new URL("fixtures/tuple-pattern-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this tuple field comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a record destructuring pattern", () => {
    const input = "module Example {\n  pure val {first ,second} = { first: 1, second: 2 }\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a call expression", () => {
    const input = "module Example {\n  val values = Set( 1 ,2, )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves argument groups in a multiline call", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-call-groups.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("normalizes an aligned multiline call while preserving argument groups", () => {
    const input = readFileSync(
      new URL("fixtures/aligned-multiline-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        "  pure val result = Set(",
        '    "source-chain-state-with-a-long-name", "denomination-with-a-long-name", "amount-with-a-long-name",',
        '    "sender", "receiver",',
        '    "transfer", "channel-topology-with-a-long-name",',
        '    "zero", "zero"',
        "  )",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a fully expanded call", () => {
    const input = readFileSync(new URL("fixtures/expanded-call.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a fully expanded two-argument call", () => {
    const input = readFileSync(
      new URL("fixtures/expanded-two-argument-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves explicitly multiline calls nested in a multiline call", () => {
    const input = readFileSync(
      new URL("fixtures/nested-multiline-calls.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a call argument", () => {
    const input = readFileSync(
      new URL("fixtures/call-argument-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this call argument comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a UFCS call expression", () => {
    const input = "module Example {\n  val count = Set(1).size( )\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned dots in a multiline UFCS chain", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-ufcs-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "run trace =\n    init.then(step)\n        .then(step)\n        .then(all {",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves all aligned dots in a nondet UFCS chain", () => {
    const input = readFileSync(
      new URL("fixtures/nondet-multiline-ufcs-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "      Set(1, 2, 3)\n          .filter(value => value > 1)\n          .oneOf()",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a single multiline UFCS continuation", () => {
    const input = readFileSync(
      new URL("fixtures/single-ufcs-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      'pure val error = ensure(true, "first message")\n      .andEnsure(false, "second message")',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("uses a four-space structural indent for UFCS continuations", () => {
    const input = readFileSync(
      new URL("fixtures/four-space-ufcs-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        '    nondet key = Set("one")',
        "        .oneOf()",
        "    val updated = states",
        "        .set(key, 1)",
        "    states' = states",
        "        .set(key, updated.get(key))",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(checkQuint(input, "unformatted.qnt")).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an index expression", () => {
    const input = "module Example {\n  val first = List(1, 2)[ 0 ]\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a field-access expression", () => {
    const input = "module Example {\n  val answer = { value: 1 } . value\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a field selector", () => {
    const input = readFileSync(
      new URL("fixtures/field-access-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this chain comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a unary expression", () => {
    const input = "module Example {\n  val negative = - 42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats every binary operator", () => {
    const input = readFileSync(new URL("fixtures/binary-operators.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats lambda parameter forms", () => {
    const input = readFileSync(new URL("fixtures/lambdas.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline call with a lambda argument", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-lambda-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("names.forall(name =>\n    names.contains(name)\n  )");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a secondary lambda header beside the call opening", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-secondary-lambda.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps leading call arguments beside a multiline lambda", () => {
    const input = readFileSync(
      new URL("fixtures/hanging-lambda-call.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("propagates multiline layout through nested lambda calls", () => {
    const input = readFileSync(new URL("fixtures/nested-lambda-call.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain(
      '    lhs.bind(left =>\n      rhs.bind(right =>\n        if (left == right)\n          Ok(left)\n        else\n          Err("different")\n      )\n    )',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a block-bodied lambda brace beside its arrow", () => {
    const input = readFileSync(
      new URL("fixtures/block-lambda-postfix.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "    ((x, y) => {\n      val result = x - y\n      if (result < 0) -result else result\n    }).app(lhs, rhs)",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps a record-returning lambda's braces attached", () => {
    const input = readFileSync(
      new URL("fixtures/record-lambda-braces.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      [
        '  pure val records = Set("one").mapBy(name => {',
        "    name: name,",
        "    count: 1,",
        "  })",
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(checkQuint(input, "unformatted.qnt")).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("keeps block-combinator lambda bodies attached", () => {
    const input = readFileSync(
      new URL("fixtures/combinator-lambda-braces.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    for (const combinator of ["all", "any", "and", "or"]) {
      expect(output).toContain(`exists(value => ${combinator} {`);
    }
    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a lambda body", () => {
    const input = readFileSync(new URL("fixtures/lambda-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this lambda comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a conditional expression", () => {
    const input = "module Example {\n  pure val answer = if( true )1  else  2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves multiline unbraced conditional branches", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-conditional.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    if (condition)\n      1\n    else\n      2");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicit line break after else", () => {
    const input = readFileSync(
      new URL("fixtures/explicit-else-break.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    } else\n      pure val nextValue = state.value + 1");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places a block-bodied conditional below a definition header", () => {
    const input = readFileSync(
      new URL("fixtures/block-if-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    if (ready) {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a block-bodied conditional beside a definition header", () => {
    const input = readFileSync(new URL("fixtures/same-line-block-if.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a conditional alternative", () => {
    const input = readFileSync(
      new URL("fixtures/conditional-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this alternative comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a conditional consequence", () => {
    const input = readFileSync(
      new URL("fixtures/conditional-consequence-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this consequence comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a match expression", () => {
    const input = readFileSync(new URL("fixtures/match-expression.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("places a match expression below a definition header", () => {
    const input = readFileSync(new URL("fixtures/match-definition.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    match status {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents multiline match-arm bodies below their arms", () => {
    const input = readFileSync(
      new URL("fixtures/match-arm-block-indentation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(checkQuint(input, "match-arm-block-indentation.qnt")).toMatchSnapshot();
    expect(output).toContain("| Ready => all {\n          n' = n,");
    expect(output).toContain("\n        }\n      | Waiting");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments between match arms", () => {
    const input = readFileSync(new URL("fixtures/match-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this arm comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a match-arm body", () => {
    const input = readFileSync(
      new URL("fixtures/match-arm-body-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this arm body comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a multiline match-arm body with a trailing comment", () => {
    const input = readFileSync(
      new URL("fixtures/match-arm-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("| Ready =>\n          1 // Ready has a value");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats namespace access", () => {
    const input = "module Example {\n  pure val apply = (Scope :: x)=>Scope :: x\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a primed assignment", () => {
    const input =
      "module Example {\n  var count: int\n\n  action increment = count '  =count + 1\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicit line break in a primed assignment chain", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-primed-assignment-chain.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      '    state\' =\n      state.with("first", 1)\n          .with("second", 2),',
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an ordinary block expression", () => {
    const input = "module Example {\n  var count: int\n\n  action initialize = {count' = 0}\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside an ordinary block", () => {
    const input = readFileSync(
      new URL("fixtures/block-expression-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this block comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on an ordinary block result", () => {
    const input = readFileSync(
      new URL("fixtures/block-result-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats all block combinators", () => {
    const input = readFileSync(new URL("fixtures/block-combinators.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves source-line groups in block combinators", () => {
    const input = readFileSync(
      new URL("fixtures/grouped-combinator-entries.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    true, true, true,");
    expect(output).toContain("    true, false, true,");
    expect(output).toContain("    true, true, false,");
    expect(output).toContain("    false, false, true,");
    expect(output).toContain(
      [
        '    "first deliberately long value for width testing" == "first deliberately long value for width testing",',
        '    "second deliberately long value for width testing" == "second deliberately long value for width testing",',
      ].join("\n"),
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a block combinator below a definition header", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-block-combinator-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    all {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside a block combinator", () => {
    const input = readFileSync(new URL("fixtures/combinator-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this conjunct comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments in a block combinator", () => {
    const input = readFileSync(
      new URL("fixtures/block-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("first' = 1,  // First value");
    expect(output).toContain("second' = 2, // Second value");
    expect(output).toContain("third' = 3,  // Third value");
    expect(output).toContain("fourth' = 4,  // Fourth value");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line between block combinator entries", () => {
    const input = readFileSync(new URL("fixtures/block-entry-gap.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a nondeterministic binding", () => {
    const input = readFileSync(new URL("fixtures/nondet-binding.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats nested definitions", () => {
    const input = readFileSync(new URL("fixtures/nested-definitions.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a compact block after a nested definition", () => {
    const input = readFileSync(
      new URL("fixtures/compact-nested-block.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line before a nested definition body", () => {
    const input = readFileSync(
      new URL("fixtures/nested-definition-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    pure val doubled = value * 2\n\n    doubled + 1");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line after a nested operator definition", () => {
    const input = readFileSync(
      new URL("fixtures/nested-operator-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("      items.append(1)\n    }\n\n    appendOne(values)");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a nested definition below an action header", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-nested-definition.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("action step =\n    nondet value = Set(1, 2, 3).oneOf()\n    all {");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment after a nested definition", () => {
    const input = readFileSync(
      new URL("fixtures/nested-definition-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line before a commented local definition", () => {
    const input = readFileSync(
      new URL("fixtures/local-definition-comment-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing comment on a local definition", () => {
    const input = readFileSync(
      new URL("fixtures/local-definition-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this local comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves aligned trailing comments on local definitions", () => {
    const input = readFileSync(
      new URL("fixtures/aligned-local-definition-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a local definition body", () => {
    const input = readFileSync(
      new URL("fixtures/local-definition-body-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this local body comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats named and wildcard imports and exports", () => {
    const input = readFileSync(new URL("fixtures/imports-exports.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats source-qualified imports", () => {
    const input = readFileSync(new URL("fixtures/source-imports.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats module instances and overrides", () => {
    const input = readFileSync(new URL("fixtures/module-instance.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments among module instance overrides", () => {
    const input = readFileSync(
      new URL("fixtures/instance-override-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this override comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats anonymous instances", () => {
    const input = readFileSync(new URL("fixtures/anonymous-instance.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an expanded anonymous instance", () => {
    const input = readFileSync(
      new URL("fixtures/expanded-instance-import.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves comments in anonymous instance overrides", () => {
    const input = readFileSync(
      new URL("fixtures/anonymous-instance-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this anonymous override comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parenthesized expression", () => {
    const input = "module Example {\nval total=(1+2)\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("attaches postfix access to a multiline parenthesized expression", () => {
    const input = readFileSync(
      new URL("fixtures/parenthesized-postfix.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "    ((x, y) =>\n      val result = x * y\n      if (result > 0) result else 0\n    ).app(lhs, rhs)",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats an integer subtraction expression", () => {
    const input = "module Example {\nval delta=3-1\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a source hashbang", () => {
    const input = "#!/usr/bin/env -S quint typecheck\nmodule Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats multiple top-level modules", () => {
    const input = "module First {} module Second {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves adjacent definitions", () => {
    const input = "module Example {\n  var first: int\n  var second: int\n}\n";
    const output = formatQuint(input);

    expect(output).toContain("  var first: int\n  var second: int");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("separates a braced definition from the next commented definition", () => {
    const input = readFileSync(
      new URL("fixtures/commented-definition-separation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("  }\n\n  // Describe the following definition.");
    expect(checkQuint(input, "input.qnt").map((diagnostic) => diagnostic.rule)).toContain(
      "format/commented-definition-separation",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line between grouped definitions", () => {
    const input = "module Example {\n  var first: int\n\n  var second: int\n}\n";
    const output = formatQuint(input);

    expect(output).toContain("  var first: int\n\n  var second: int");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a leading line comment", () => {
    const input = "module Example {\n// The answer\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a definition documentation comment", () => {
    const input = "module Example {\n/// The answer\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves blank lines between leading comment groups", () => {
    const input = readFileSync(
      new URL("fixtures/leading-comment-gaps.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  // val first = source\n\n  // Second disabled example\n  // val second = source\n\n  def update",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a leading single-line block comment", () => {
    const input = "module Example {\n/* The answer */\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("indents a leading multiline block comment", () => {
    const input = "module Example {\n/*\n * The answer\n */\nval answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a module documentation comment", () => {
    const input = " /// Module documentation\nmodule Example {}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves blank lines between top-level comment groups", () => {
    const input = readFileSync(
      new URL("fixtures/top-level-comment-gaps.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(" * First notice.\n */\n\n/**\n * Second notice.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing line comment", () => {
    const input = "module Example {\n  val answer = 42// The answer\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a trailing module-body comment", () => {
    const input = readFileSync(
      new URL("fixtures/trailing-module-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a blank line before trailing module comments", () => {
    const input = readFileSync(
      new URL("fixtures/module-trailing-comment-gap.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain(
      "  pure val answer = 42\n\n  // Run this example with the simulator.\n  // Additional command details follow here.",
    );
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing source comments", () => {
    const input = readFileSync(
      new URL("fixtures/trailing-source-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment inside an otherwise empty module", () => {
    const input = "module Example {\n// Intentionally empty\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an inline block comment", () => {
    const input = "module Example {\n  val total = 1/* left */+2\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a binary right operand", () => {
    const input = readFileSync(
      new URL("fixtures/binary-right-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this right operand comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a same-line comment after a binary operator", () => {
    const input = readFileSync(
      new URL("fixtures/binary-operator-trailing-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a line break after a binary operator", () => {
    const input = readFileSync(
      new URL("fixtures/multiline-binary-expression.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("    true and\n      false");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a binary continuation in a lambda body", () => {
    const input = readFileSync(
      new URL("fixtures/lambda-binary-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

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
      new URL("fixtures/multiline-definition-header.qnt", import.meta.url),
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
      new URL("fixtures/untyped-parameter-return.qnt", import.meta.url),
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
    const input = readFileSync(new URL("fixtures/sum-type-comment.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this variant comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves trailing comments on sum-type variants", () => {
    const input = readFileSync(
      new URL("fixtures/sum-type-trailing-comments.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("| Self(str) // The name of someone who drew themself");
    expect(output).toContain("| Ok        // The draw was Ok");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a pure definition", () => {
    const input = "module Example {\n  pure   def answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a pure value definition", () => {
    const input = "module Example {\n  pure   val answer=42\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless action", () => {
    const input = "module Example {\n  action initialize=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a comment before a definition body", () => {
    const input = readFileSync(
      new URL("fixtures/definition-body-comment.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("// Preserve this body comment.");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves a four-space commented definition continuation", () => {
    const input = readFileSync(
      new URL("fixtures/four-space-definition-continuation.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toBe(input);
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless run", () => {
    const input = "module Example {\n  run scenario=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless temporal definition", () => {
    const input = "module Example {\n  temporal invariant=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("preserves an explicit line break after definition equals", () => {
    const input = readFileSync(
      new URL("fixtures/explicit-definition-break.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toContain("temporal eventuallyTrue =\n    eventually(true)");
    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats a parameterless nondet definition", () => {
    const input = "module Example {\n  nondet selection=true\n}\n";
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats empty parameter lists across definition modes", () => {
    const input = readFileSync(
      new URL("fixtures/empty-parameter-lists.qnt", import.meta.url),
      "utf8",
    );
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });

  test("formats rich definitions and types across every mode", () => {
    const input = readFileSync(new URL("fixtures/definition-matrix.qnt", import.meta.url), "utf8");
    const output = formatQuint(input);

    expect(output).toMatchSnapshot();
    expect(formatQuint(output)).toBe(output);
    expect(checkQuint(output, "formatted.qnt")).toEqual([]);
  });
});
