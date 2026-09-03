export type Doc =
  | { kind: "text"; value: string }
  | { kind: "concat"; parts: Doc[] }
  | { kind: "indent"; contents: Doc }
  | { kind: "hard-line" };

export const hardLine: Doc = { kind: "hard-line" };

export function text(value: string): Doc {
  if (/\r|\n/.test(value)) {
    throw new Error("Document text must not contain line breaks");
  }

  return { kind: "text", value };
}

export function concat(parts: Doc[]): Doc {
  return { kind: "concat", parts };
}

export function indent(contents: Doc): Doc {
  return { kind: "indent", contents };
}

export function renderDoc(document: Doc): string {
  let output = "";
  let atLineStart = true;

  function render(current: Doc, indentation: number): void {
    switch (current.kind) {
      case "text":
        if (atLineStart && current.value.length > 0) {
          output += "  ".repeat(indentation);
        }
        output += current.value;
        atLineStart = false;
        break;
      case "concat":
        for (const part of current.parts) {
          render(part, indentation);
        }
        break;
      case "indent":
        render(current.contents, indentation + 1);
        break;
      case "hard-line":
        output += "\n";
        atLineStart = true;
        break;
    }
  }

  render(document, 0);
  return output;
}
