import { readFileSync } from "node:fs";
import vm from "node:vm";

export function loadScript(path, exportName, extra = {}) {
  const scope = vm.createContext({ ...extra });
  vm.runInContext(readFileSync(path, "utf8"), scope, { filename: path });
  return scope[exportName];
}
