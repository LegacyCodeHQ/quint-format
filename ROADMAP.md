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

- [x] Line comments
  - [x] Leading comments on definitions
  - [x] Trailing comments
- [x] Documentation comments
  - [x] Documentation on definitions
  - [x] Documentation on modules
- [x] Block comments
  - [x] Single-line leading block comments
  - [x] Multiline block comments
- [ ] Leading, trailing, and inline attachment
  - [x] Leading module and definition attachment
  - [x] Trailing definition attachment
  - [x] Inline attachment in binary expressions
  - [ ] Inline attachment in remaining syntax nodes
- [x] Comments inside otherwise empty constructs

Comments are completed before broadening the remaining syntax formatters so
that every subsequent formatter preserves them by construction.

## 4. Module-level declarations

- [x] `const`
- [x] `var`
- [x] Boolean `assume`
- [x] Literal and identifier `val`
- [x] General `assume` expressions
- [ ] `def`
  - [x] Parameterless definitions
  - [x] Untyped parameters
  - [x] Primitive typed parameters and return types
  - [x] Optional semicolons
  - [ ] Rich parameter types and additional qualifiers
- [ ] `pure`
  - [x] `pure def`
  - [x] `pure val`
- [ ] `action`
  - [x] Parameterless expression-bodied actions
  - [ ] Parameters and block bodies
- [ ] `run`
  - [x] Parameterless expression-bodied runs
  - [ ] Parameters and chained run expressions
- [ ] `temporal`
  - [x] Parameterless expression-bodied temporal definitions
  - [ ] Parameters and compound temporal expressions
- [ ] `nondet`
  - [x] Parameterless expression-bodied nondeterministic definitions
  - [ ] Parameters and nondeterministic bindings
- [ ] Parameters and return types
  - [x] Untyped `def` parameters
  - [ ] Parameters across other definition modes
  - [x] Primitive typed `def` parameters
  - [x] Collection-typed `def` parameters
  - [ ] Remaining rich typed parameters
  - [x] Primitive return type annotations
  - [x] Collection return type annotations
  - [ ] Remaining rich return type annotations
- [x] Optional semicolons where Quint permits them
  - [x] Operator definitions
  - [x] Value definitions
- [ ] Type aliases and uninterpreted types
  - [x] Primitive type aliases
  - [x] Single-parameter polymorphic aliases
  - [ ] Rich aliases and multiple type parameters
  - [x] Uninterpreted types

## 5. Types

- [x] Primitive type preservation and annotation spacing
- [ ] Named and variable types
  - [x] Named types
  - [x] Type variables
- [ ] `Set`, `List`, and polymorphic applications
  - [x] `Set` types
  - [x] `List` types
  - [x] Polymorphic type applications
- [ ] Tuples and records
  - [x] Tuple types
  - [x] Record types
- [x] Open record rows
- [x] Function and operator types
  - [x] Function types
  - [x] Parenthesized operator types with parameters
  - [x] Zero-parameter operator types
  - [x] Direct operator types
- [x] Parenthesized types
- [x] Sum types and variants
  - [x] Inline sum types and payload variants
  - [x] Multiline sum types and leading separators

## 6. Literals and patterns

- [x] Integers
- [x] Strings
- [x] Booleans
- [x] Holes and unit
  - [x] Holes
  - [x] Unit types
  - [x] Unit literals
- [x] Lists, tuples, and records
  - [x] Lists
  - [x] Tuples
  - [x] Records
- [x] Record spreads
- [x] Tuple and record destructuring patterns
  - [x] Tuple patterns
  - [x] Record patterns

## 7. Expressions

- [x] Calls, UFCS calls, indexing, and field access
  - [x] Calls
  - [x] UFCS calls
  - [x] Indexing
  - [x] Field access
- [x] Unary operators
- [x] All binary operators
- [x] Addition and subtraction
- [x] Parentheses and basic precedence preservation
- [x] Lambdas
- [x] Conditionals
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
