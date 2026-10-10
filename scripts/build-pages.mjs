import { cpSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const work = path.join(tmpdir(), "tokenlaunch-pages");
const skip = new Set(["node_modules", ".next", ".git", "out", "storage"]);

rmSync(work, { recursive: true, force: true });
cpSync(root, work, {
  recursive: true,
  filter(source) {
    const relative = path.relative(root, source);
    if (!relative) return true;
    const parts = relative.split(path.sep);
    if (parts.some((part) => skip.has(part))) return false;
    const name = parts[parts.length - 1];
    if (name.startsWith(".env") && name !== ".env.example") return false;
    return true;
  },
});

symlinkSync(path.join(root, "node_modules"), path.join(work, "node_modules"), "dir");
rmSync(path.join(work, "src/app/api"), { recursive: true, force: true });
rmSync(path.join(work, "src/middleware.ts"), { force: true });
rmSync(path.join(work, "src/instrumentation.ts"), { force: true });
rmSync(path.join(work, "src/instrumentation-node.ts"), { force: true });

const layoutPath = path.join(work, "src/app/(desk)/layout.tsx");
const { readFileSync, writeFileSync } = await import("node:fs");
writeFileSync(layoutPath, readFileSync(layoutPath, "utf8").replace(/export const dynamic = "force-dynamic";\n\n/, ""));
writeFileSync(
  path.join(work, "src/app/page.tsx"),
  `import { HomeClient } from "@/components/home-client";

export default function HomePage() {
  return <HomeClient />;
}
`,
);

const result = spawnSync("npx", ["next", "build"], {
  cwd: work,
  stdio: "inherit",
  env: {
    ...process.env,
    PAGES_EXPORT: "1",
    PAGES_BASE_PATH: process.env.PAGES_BASE_PATH || "/TokenLaunchAI",
    NEXT_PUBLIC_STATIC_HOST: "1",
  },
});

if (result.status !== 0) process.exit(result.status ?? 1);

rmSync(path.join(root, "out"), { recursive: true, force: true });
mkdirSync(path.join(root, "out"), { recursive: true });
cpSync(path.join(work, "out"), path.join(root, "out"), { recursive: true });
rmSync(path.join(root, "docs"), { recursive: true, force: true });
cpSync(path.join(work, "out"), path.join(root, "docs"), { recursive: true });
console.log("GitHub Pages files are in ./out and ./docs");
