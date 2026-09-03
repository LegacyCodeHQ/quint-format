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
- [x] Leading, trailing, and inline attachment
  - [x] Leading module and definition attachment
  - [x] Trailing definition attachment
  - [x] Inline attachment in binary expressions
  - [x] Inline attachment in remaining syntax nodes
- [x] Comments inside otherwise empty constructs

Comments are completed before broadening the remaining syntax formatters so
that every subsequent formatter preserves them by construction.

## 4. Module-level declarations

- [x] `const`
- [x] `var`
- [x] Boolean `assume`
- [x] Literal and identifier `val`
- [x] General `assume` expressions
- [x] `def`
  - [x] Parameterless definitions
  - [x] Untyped parameters
  - [x] Primitive typed parameters and return types
  - [x] Optional semicolons
  - [x] Rich parameter types and additional qualifiers
- [x] `pure`
  - [x] `pure def`
  - [x] `pure val`
- [x] `action`
  - [x] Parameterless expression-bodied actions
  - [x] Parameters and block bodies
- [x] `run`
  - [x] Parameterless expression-bodied runs
  - [x] Parameters and chained run expressions
- [x] `temporal`
  - [x] Parameterless expression-bodied temporal definitions
  - [x] Parameters and compound temporal expressions
- [x] `nondet`
  - [x] Parameterless expression-bodied nondeterministic definitions
  - [x] Parameters and nondeterministic bindings
- [x] Parameters and return types
  - [x] Untyped `def` parameters
  - [x] Parameters across other definition modes
  - [x] Primitive typed `def` parameters
  - [x] Collection-typed `def` parameters
  - [x] Remaining rich typed parameters
  - [x] Primitive return type annotations
  - [x] Collection return type annotations
  - [x] Remaining rich return type annotations
- [x] Optional semicolons where Quint permits them
  - [x] Operator definitions
  - [x] Value definitions
- [x] Type aliases and uninterpreted types
  - [x] Primitive type aliases
  - [x] Single-parameter polymorphic aliases
  - [x] Rich aliases and multiple type parameters
  - [x] Uninterpreted types

## 5. Types

- [x] Primitive type preservation and annotation spacing
- [x] Named and variable types
  - [x] Named types
  - [x] Type variables
- [x] `Set`, `List`, and polymorphic applications
  - [x] `Set` types
  - [x] `List` types
  - [x] Polymorphic type applications
- [x] Tuples and records
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
- [x] Match expressions
- [x] Namespace access

## 8. Stateful and block expressions

- [x] Primed assignments
- [x] Ordinary blocks
- [x] `all`, `any`, `and`, and `or`
- [x] `nondet` bindings
- [x] Nested definitions

## 9. Imports, exports, and instances

- [x] Named and wildcard imports and exports
- [x] Source-qualified imports
- [x] Module instances and overrides
- [x] Anonymous instances

## 10. CLI completion

- [x] Precise basic syntax diagnostics
- [x] Complete syntax diagnostic coverage
- [x] Multiple files
- [x] Recursive directory discovery
- [x] Standard output mode
- [x] `--write` with safe atomic replacement
- [x] Exit codes: 0 clean, 1 formatting violations, 2 operational or syntax failure

## 11. Hardening

- [x] Entire official Quint example corpus
- [x] Parse-tree preservation checks
- [x] Unicode, tabs, CRLF, and multiline diagnostic ranges
- [x] Property and fuzz testing
- [x] Performance and large-file tests
