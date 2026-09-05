import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
