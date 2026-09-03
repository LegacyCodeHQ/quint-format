# Agent Instructions

## Formatter development playbook

Use this workflow for every formatting rule. Work on one small formatting
capability at a time and create one Conventional Commit for each capability.

### 1. Validate the input

- Confirm the working tree state with `git status --short` and preserve unrelated
  user changes.
- Put the smallest unformatted example in a uniquely named temporary `.qnt` file
  outside the repository.
- Run `quint parse <temporary-file>` before adding the example to the tests. Do
  not create a formatting rule for input rejected by the official Quint parser.

### 2. Add the failing check

- Add an approval test that demonstrates one formatting violation and its exact
  canonical output.
- Confirm the test fails for the missing formatting rule before implementing it.
- Every check must have a corresponding automatic fix. Do not add checks that
  can only report a problem.
- Diagnostics must use one-based line and column numbers, include a stable rule
  identifier and precise message, and underline the smallest useful source
  range. Keep output suitable for terminals, editors, and CI logs.

### 3. Implement the smallest fix

- Implement only the formatting behavior required by the focused example.
- Derive syntax and source ranges from the Tree-sitter parse tree rather than
  matching Quint syntax with regular expressions.
- Preserve comments and source meaning. Reject invalid or unsupported syntax
  explicitly rather than producing a partial rewrite.

### 4. Validate the output

- Write the exact formatted output to a temporary `.qnt` file and run
  `quint parse <temporary-file>` again.
- Assert that Tree-sitter parses both the input and output without `ERROR` or
  `MISSING` nodes.
- Assert the exact output with a snapshot.
- Assert idempotence: formatting the formatted output must produce identical
  text, and checking it must report no violations.

The required invariant is:

```text
valid Quint input -> format -> valid Quint output -> format again -> identical output
```

### 5. Verify and commit

- Remove temporary fixtures.
- Run `bun test`, `bun run check`, and `git diff --check`.
- Commit the rule, its fix, diagnostics, fixtures, and tests together using a
  Conventional Commit such as `feat: format empty modules`.
- Finish with a clean working tree and report the parser validations, tests, and
  commit.
