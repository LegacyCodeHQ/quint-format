import type Parser from "tree-sitter";
import type { Doc } from "../formatting/document.js";

export interface ModuleDeclaration {
  node: Parser.SyntaxNode;
  leadingComments?: Parser.SyntaxNode[];
  trailingComments?: Parser.SyntaxNode[];
  qualifier?: Parser.SyntaxNode;
  keyword: Parser.SyntaxNode;
  nameNode: Parser.SyntaxNode;
  colon?: Parser.SyntaxNode;
  typeNode?: Parser.SyntaxNode;
  typeAnchor?: Parser.SyntaxNode;
  typeRoots?: Parser.SyntaxNode[];
  openParen?: Parser.SyntaxNode;
  closeParen?: Parser.SyntaxNode;
  parameters?: Parser.SyntaxNode[];
  parameterCommas?: Parser.SyntaxNode[];
  expandedParameterList?: boolean;
  typeOpenBracket?: Parser.SyntaxNode;
  typeCloseBracket?: Parser.SyntaxNode;
  typeParameters?: Parser.SyntaxNode[];
  typeParameterCommas?: Parser.SyntaxNode[];
  aliasNode?: Parser.SyntaxNode;
  asKeyword?: Parser.SyntaxNode;
  dot?: Parser.SyntaxNode;
  selectorNode?: Parser.SyntaxNode;
  fromKeyword?: Parser.SyntaxNode;
  sourceNode?: Parser.SyntaxNode;
  instanceOpenParen?: Parser.SyntaxNode;
  instanceCloseParen?: Parser.SyntaxNode;
  instanceOverrides?: Parser.SyntaxNode[];
  instanceCommas?: Parser.SyntaxNode[];
  semicolon?: Parser.SyntaxNode;
  equals?: Parser.SyntaxNode;
  valueNode?: Parser.SyntaxNode;
  binaryOperators?: BinaryOperator[];
  unitLiterals?: Parser.SyntaxNode[];
  sequenceLiterals?: Parser.SyntaxNode[];
  recordLiterals?: Parser.SyntaxNode[];
  callExpressions?: Parser.SyntaxNode[];
  document: Doc;
}

export interface BinaryOperator {
  node: Parser.SyntaxNode;
  left: Parser.SyntaxNode;
  right: Parser.SyntaxNode;
  inlineComments: Parser.SyntaxNode[];
  rightComments: Parser.SyntaxNode[];
}

export interface ExpressionAnalysis {
  document: Doc;
  binaryOperators: BinaryOperator[];
  unitLiterals: Parser.SyntaxNode[];
  sequenceLiterals: Parser.SyntaxNode[];
  recordLiterals: Parser.SyntaxNode[];
  callExpressions: Parser.SyntaxNode[];
}

export interface AnalyzedModule {
  node: Parser.SyntaxNode;
  name: string;
  nameNode: Parser.SyntaxNode;
  moduleKeyword: Parser.SyntaxNode;
  openBrace: Parser.SyntaxNode;
  closeBrace: Parser.SyntaxNode;
  declarations: ModuleDeclaration[];
  danglingComments: Parser.SyntaxNode[];
}

export interface AnalyzedSourceModule extends AnalyzedModule {
  leadingComments: Parser.SyntaxNode[];
}

export interface AnalyzedSource {
  hashbang?: Parser.SyntaxNode;
  modules: AnalyzedSourceModule[];
  trailingComments: Parser.SyntaxNode[];
}
