#!/usr/bin/env node
import { main } from "../src/index.mjs";

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`yishu-insight-mcp: fatal: ${err?.stack || err}\n`);
  process.exit(1);
});
