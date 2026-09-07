import { newIdGenerator } from "@informalsystems/quint/dist/src/idGenerator.js";
import { parsePhase1fromText } from "@informalsystems/quint/dist/src/parsing/quintParserFrontend.js";

export function parseQuintAst(source: string, sourceLocation: string): unknown {
  const previousDebug = console.debug;
  console.debug = () => {};
  try {
    const result = parsePhase1fromText(newIdGenerator(), source, sourceLocation);
    if (result.errors.length > 0) {
      const detail = result.errors.map(({ code, message }) => `${code}: ${message}`).join("; ");
      throw new Error(`Quint rejected ${sourceLocation}: ${detail}`);
    }
    return result.modules;
  } finally {
    console.debug = previousDebug;
  }
}
