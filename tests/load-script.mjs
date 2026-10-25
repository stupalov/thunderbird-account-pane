import { readFileSync } from "node:fs";
import vm from "node:vm";

export function loadScript(path, exportName, extra = {}) {
  const scope = vm.createContext({ ...extra });
  vm.runInContext(readFileSync(path, "utf8"), scope, { filename: path });
  return scope[exportName];
}

export function loadScripts(paths, exportName, extra = {}) {
  const scope = vm.createContext({ ...extra });
  for (const path of paths) {
    vm.runInContext(readFileSync(path, "utf8"), scope, { filename: path });
  }
  return scope[exportName];
}
