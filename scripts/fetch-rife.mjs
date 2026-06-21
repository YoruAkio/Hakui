// Fetches rife-ncnn-vulkan binary + the rife-v4.6 model into vendor/rife/<platform>/.
// Not committed to git (see .gitignore) — run once per machine via `pnpm setup:rife`.
import { createWriteStream } from "node:fs";
import { mkdir, rm, access, chmod, cp, readdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const REPO = "nihui/rife-ncnn-vulkan";
const TAG = "20221029";
const MODEL = "rife-v4.6";

// platform -> release asset suffix
const ASSET = { linux: "ubuntu", win32: "windows", darwin: "macos" }[process.platform];
if (!ASSET) {
  console.error(`unsupported platform: ${process.platform}`);
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const destDir = path.join(root, "vendor", "rife", process.platform);
const binName = process.platform === "win32" ? "rife-ncnn-vulkan.exe" : "rife-ncnn-vulkan";
const binPath = path.join(destDir, binName);

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

if (await exists(binPath)) {
  console.log(`rife already present at ${binPath} — skipping.`);
  process.exit(0);
}

const url = `https://github.com/${REPO}/releases/download/${TAG}/rife-ncnn-vulkan-${TAG}-${ASSET}.zip`;
const tmpZip = path.join(os.tmpdir(), `hayai-rife-${TAG}-${ASSET}.zip`);

console.log(`downloading ${url}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(res.body, createWriteStream(tmpZip));

console.log("extracting binary + model");
const tmpOut = path.join(os.tmpdir(), `hayai-rife-extract-${TAG}`);
await rm(tmpOut, { recursive: true, force: true });
await mkdir(tmpOut, { recursive: true });
// windows CI runners have no `unzip`; use PowerShell's Expand-Archive there
const unzip =
  process.platform === "win32"
    ? spawnSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${tmpOut}' -Force`,
        ],
        { stdio: "inherit" },
      )
    : spawnSync("unzip", ["-q", "-o", tmpZip, "-d", tmpOut], { stdio: "inherit" });
if (unzip.status !== 0) {
  console.error("extraction failed");
  process.exit(1);
}

// release wraps everything in one top-level dir
const [inner] = await readdir(tmpOut);
const srcDir = path.join(tmpOut, inner);

await mkdir(destDir, { recursive: true });
await cp(path.join(srcDir, binName), binPath);
await cp(path.join(srcDir, MODEL), path.join(destDir, MODEL), { recursive: true });
if (process.platform !== "win32") await chmod(binPath, 0o755);

await rm(tmpZip, { force: true });
await rm(tmpOut, { recursive: true, force: true });

console.log(`done — vendored to ${destDir}`);
