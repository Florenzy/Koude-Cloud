import { spawn } from "node:child_process";
const action = process.argv[2] ?? "dev";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    action,
    ...(action === "start" ? [] : ["--webpack"]),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      KOUDE_RUNTIME: "node",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
