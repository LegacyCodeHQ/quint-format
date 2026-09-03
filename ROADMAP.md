# Formatter coverage roadmap

The formatter is built as a matrix of formatting rules across the named nodes
in the Quint Tree-sitter grammar. Each unchecked item is implemented with the
workflow in `AGENTS.md`: validate with Quint, establish a red approval test,
implement the smallest fix, validate the output, verify, and commit atomically.

## 1. Formatting foundation

- [x] Document model: text, indentation, hard and soft lines, and grouping
- [x] Deterministic renderer with two-space indentation and a 100-column width
- [x] Parser-derived source ranges
- [x] Stable diagnostic codes and source frames
- [x] Parse validation and idempotence coverage

## 2. Source and module layout

- [x] Hashbangs
- [x] Module braces
- [x] Multiple modules
- [x] Blank lines between definitions
- [x] Exactly one trailing newline

## 3. Comments

- [ ] Line comments
  - [x] Leading comments on definitions
  - [ ] Trailing and inline comments
- [x] Documentation comments
  - [x] Documentation on definitions
  - [x] Documentation on modules
- [x] Block comments
  - [x] Single-line leading block comments
  - [x] Multiline block comments
- [ ] Leading, trailing, and inline attachment
- [ ] Comments inside otherwise empty constructs

Comments are completed before broadening the remaining syntax formatters so
that every subsequent formatter preserves them by construction.

## 4. Module-level declarations

- [x] `const`
- [x] `var`
- [x] Boolean `assume`
- [x] Literal and identifier `val`
- [ ] General `assume` expressions
- [ ] `def`
- [ ] `pure`
- [ ] `action`
- [ ] `run`
- [ ] `temporal`
- [ ] `nondet`
- [ ] Parameters and return types
- [ ] Optional semicolons where Quint permits them
- [ ] Type aliases and uninterpreted types

## 5. Types

- [x] Primitive type preservation and annotation spacing
- [ ] Named and variable types
- [ ] `Set`, `List`, and polymorphic applications
- [ ] Tuples and records
- [ ] Open record rows
- [ ] Function and operator types
- [ ] Parenthesized types
- [ ] Sum types and variants

## 6. Literals and patterns

- [x] Integers
- [x] Strings
- [x] Booleans
- [ ] Holes and unit
- [ ] Lists, tuples, and records
- [ ] Record spreads
- [ ] Tuple and record destructuring patterns

## 7. Expressions

- [ ] Calls, UFCS calls, indexing, and field access
- [ ] Unary operators
- [ ] All binary operators
- [x] Addition and subtraction
- [x] Parentheses and basic precedence preservation
- [ ] Lambdas
- [ ] Conditionals
- [ ] Match expressions
- [ ] Namespace access

## 8. Stateful and block expressions

- [ ] Primed assignments
- [ ] Ordinary blocks
- [ ] `all`, `any`, `and`, and `or`
- [ ] `nondet` bindings
- [ ] Nested definitions

## 9. Imports, exports, and instances

- [ ] Named and wildcard imports and exports
- [ ] Source-qualified imports
- [ ] Module instances and overrides
- [ ] Anonymous instances

## 10. CLI completion

- [x] Precise basic syntax diagnostics
- [ ] Complete syntax diagnostic coverage
- [ ] Multiple files
- [ ] Recursive directory discovery
- [ ] Standard output mode
- [ ] `--write` with safe atomic replacement
- [x] Exit codes: 0 clean, 1 formatting violations, 2 operational or syntax failure

## 11. Hardening

- [ ] Entire official Quint example corpus
- [ ] Parse-tree preservation checks
- [ ] Unicode, tabs, CRLF, and multiline diagnostic ranges
- [ ] Property and fuzz testing
- [ ] Performance and large-file tests
