import { spawn } from "node:child_process";
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
for (const args of [
  ["--experimental-strip-types", "sandbox/server.ts"],
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "-p",
    "3040",
    "-H",
    "127.0.0.1",
  ],
]) {
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
