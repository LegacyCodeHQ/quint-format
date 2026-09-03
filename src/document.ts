export type Doc =
  | { kind: "text"; value: string }
  | { kind: "concat"; parts: Doc[] }
  | { kind: "indent"; contents: Doc }
  | { kind: "hard-line" }
  | { kind: "line" }
  | { kind: "group"; contents: Doc };

export const hardLine: Doc = { kind: "hard-line" };
export const line: Doc = { kind: "line" };

export interface RenderOptions {
  lineWidth?: number;
}

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

export function group(contents: Doc): Doc {
  return { kind: "group", contents };
}

type Mode = "flat" | "break";

interface Command {
  indentation: number;
  mode: Mode;
  document: Doc;
}

function fits(remainingWidth: number, commands: Command[]): boolean {
  const pending = [...commands];

  while (remainingWidth >= 0) {
    const command = pending.pop();

    if (!command) {
      return true;
    }

    switch (command.document.kind) {
      case "text":
        remainingWidth -= command.document.value.length;
        break;
      case "concat":
        for (let index = command.document.parts.length - 1; index >= 0; index -= 1) {
          const document = command.document.parts[index];
          if (document) {
            pending.push({ ...command, document });
          }
        }
        break;
      case "indent":
        pending.push({
          indentation: command.indentation + 1,
          mode: command.mode,
          document: command.document.contents,
        });
        break;
      case "hard-line":
        return command.mode === "break";
      case "line":
        if (command.mode === "break") {
          return true;
        }
        remainingWidth -= 1;
        break;
      case "group":
        pending.push({ ...command, document: command.document.contents });
        break;
    }
  }

  return false;
}

export function renderDoc(document: Doc, options: RenderOptions = {}): string {
  const lineWidth = options.lineWidth ?? 100;
  let output = "";
  let atLineStart = true;
  let column = 0;
  const commands: Command[] = [{ indentation: 0, mode: "break", document }];

  while (commands.length > 0) {
    const command = commands.pop();
    if (!command) {
      break;
    }

    switch (command.document.kind) {
      case "text":
        if (atLineStart && command.document.value.length > 0) {
          const indentation = "  ".repeat(command.indentation);
          output += indentation;
          column += indentation.length;
        }
        output += command.document.value;
        column += command.document.value.length;
        atLineStart = false;
        break;
      case "concat":
        for (let index = command.document.parts.length - 1; index >= 0; index -= 1) {
          const part = command.document.parts[index];
          if (part) {
            commands.push({ ...command, document: part });
          }
        }
        break;
      case "indent":
        commands.push({
          indentation: command.indentation + 1,
          mode: command.mode,
          document: command.document.contents,
        });
        break;
      case "hard-line":
        output += "\n";
        atLineStart = true;
        column = 0;
        break;
      case "line":
        if (command.mode === "flat") {
          output += " ";
          column += 1;
        } else {
          output += "\n";
          atLineStart = true;
          column = 0;
        }
        break;
      case "group": {
        const flatCommand: Command = {
          ...command,
          mode: "flat",
          document: command.document.contents,
        };
        const mode =
          command.mode === "flat" || fits(lineWidth - column, [...commands, flatCommand])
            ? "flat"
            : "break";
        commands.push({ ...flatCommand, mode });
        break;
      }
    }
  }

  return output;
}
