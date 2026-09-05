import type Parser from "tree-sitter";

export function canFormatType(node: Parser.SyntaxNode): boolean {
  if (
    node.type === "primitive_type" ||
    node.type === "named_type" ||
    node.type === "type_variable" ||
    node.type === "unit_type"
  ) {
    return true;
  }

  if (node.type === "list_type" || node.type === "set_type") {
    const element = node.childForFieldName("element");
    return Boolean(element && canFormatType(element));
  }

  if (node.type === "type_application") {
    const typeConstructor = node.childForFieldName("constructor");
    const arguments_ = node.childrenForFieldName("argument");
    return Boolean(
      typeConstructor &&
        arguments_.length > 0 &&
        arguments_.every((argument) => canFormatType(argument)),
    );
  }

  if (node.type === "tuple_type") {
    const elements = node.childrenForFieldName("element");
    return elements.length >= 2 && elements.every((element) => canFormatType(element));
  }

  if (node.type === "record_type") {
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    const row = node.childForFieldName("row");
    const rowName = row?.childForFieldName("name");
    return (
      (!row || rowName?.type === "identifier") &&
      fields.every((field) => {
        const name = field.childForFieldName("name");
        const fieldType = field.childForFieldName("type");
        return Boolean(name && fieldType && canFormatType(fieldType));
      })
    );
  }

  if (node.type === "function_type") {
    const parameter = node.childForFieldName("parameter");
    const result = node.childForFieldName("result");
    return Boolean(parameter && result && canFormatType(parameter) && canFormatType(result));
  }

  if (node.type === "operator_type") {
    const parameters = node.childrenForFieldName("parameter");
    const result = node.childForFieldName("result");
    return Boolean(
      result && parameters.every((parameter) => canFormatType(parameter)) && canFormatType(result),
    );
  }

  if (node.type === "parenthesized_type") {
    const innerType = node.childForFieldName("type");
    return Boolean(innerType && canFormatType(innerType));
  }

  if (node.type === "sum_type") {
    const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
    return (
      variants.length > 0 &&
      variants.every((variant) => {
        const name = variant.childForFieldName("name");
        const payload = variant.childForFieldName("payload");
        return Boolean(name && (!payload || canFormatType(payload)));
      })
    );
  }

  return false;
}

export function formatSumVariant(variant: Parser.SyntaxNode): string {
  const name = variant.childForFieldName("name");
  const payload = variant.childForFieldName("payload");
  if (!name) {
    throw new Error("Unable to locate the sum variant name");
  }
  return `${name.text}${payload ? `(${formatType(payload)})` : ""}`;
}

export function formatType(node: Parser.SyntaxNode): string {
  if (
    node.type === "primitive_type" ||
    node.type === "named_type" ||
    node.type === "type_variable"
  ) {
    return node.text;
  }

  if (node.type === "unit_type") {
    return "()";
  }

  if (node.type === "list_type") {
    const element = node.childForFieldName("element");
    if (!element) {
      throw new Error("Unable to locate the list element type");
    }
    return `List[${formatType(element)}]`;
  }

  if (node.type === "set_type") {
    const element = node.childForFieldName("element");
    if (!element) {
      throw new Error("Unable to locate the set element type");
    }
    return `Set[${formatType(element)}]`;
  }

  if (node.type === "type_application") {
    const typeConstructor = node.childForFieldName("constructor");
    const arguments_ = node.childrenForFieldName("argument");
    if (!typeConstructor || arguments_.length === 0) {
      throw new Error("Unable to locate the applied type fields");
    }
    return `${typeConstructor.text}[${arguments_.map(formatType).join(", ")}]`;
  }

  if (node.type === "tuple_type") {
    const elements = node.childrenForFieldName("element");
    if (elements.length < 2) {
      throw new Error("Unable to locate the tuple element types");
    }
    return `(${elements.map(formatType).join(", ")})`;
  }

  if (node.type === "record_type") {
    const fields = node.namedChildren.filter((child) => child.type === "record_type_field");
    if (fields.length === 0) {
      return "{}";
    }
    const formattedFields = fields.map((field) => {
      const name = field.childForFieldName("name");
      const fieldType = field.childForFieldName("type");
      if (!name || !fieldType) {
        throw new Error("Unable to locate a record field type");
      }
      return `${name.text}: ${formatType(fieldType)}`;
    });
    const row = node.childForFieldName("row");
    const rowSuffix = row ? ` | ${row.text}` : "";
    return `{ ${formattedFields.join(", ")}${rowSuffix} }`;
  }

  if (node.type === "function_type") {
    const parameter = node.childForFieldName("parameter");
    const result = node.childForFieldName("result");
    if (!parameter || !result) {
      throw new Error("Unable to locate the function type operands");
    }
    return `${formatType(parameter)} -> ${formatType(result)}`;
  }

  if (node.type === "operator_type") {
    const parameters = node.childrenForFieldName("parameter");
    const result = node.childForFieldName("result");
    const hasParentheses = node.children.some((child) => child.type === "(");
    if (!result) {
      throw new Error("Unable to locate the operator result type");
    }
    const parameterList = hasParentheses
      ? `(${parameters.map(formatType).join(", ")})`
      : parameters.length === 1
        ? formatType(parameters[0] as Parser.SyntaxNode)
        : undefined;
    if (parameterList === undefined) {
      throw new Error("Unable to locate the operator parameter types");
    }
    return `${parameterList} => ${formatType(result)}`;
  }

  if (node.type === "parenthesized_type") {
    const innerType = node.childForFieldName("type");
    if (!innerType) {
      throw new Error("Unable to locate the parenthesized type");
    }
    return `(${formatType(innerType)})`;
  }

  if (node.type === "sum_type") {
    const variants = node.namedChildren.filter((child) => child.type === "sum_type_variant");
    if (variants.length === 0) {
      throw new Error("Unable to locate the sum type variants");
    }
    return variants.map(formatSumVariant).join(" | ");
  }

  throw new Error("Formatting this type syntax is not implemented yet");
}
