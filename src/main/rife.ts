import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, readdir, access } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { FFMPEG, probe, tempBase, ensureDir, type RunHandle } from "./ffmpeg";

// rife-ncnn-vulkan binary + v4.6 model, vendored under vendor/rife/<platform>/
// dev: repo path; prod: shipped via extraResource into resources/rife/
const RIFE_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "rife")
  : path.join(app.getAppPath(), "vendor", "rife", process.platform);
const RIFE_BIN = path.join(
  RIFE_DIR,
  process.platform === "win32" ? "rife-ncnn-vulkan.exe" : "rife-ncnn-vulkan",
);
const RIFE_MODEL = path.join(RIFE_DIR, "rife-v4.6");

type Phase = { proc: ChildProcess | null; killed: boolean };

const run = (bin: string, args: string[], state: Phase, onLine?: (s: string) => void) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args);
    state.proc = proc;
    let err = "";
    proc.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
      onLine?.(d.toString());
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (state.killed) return reject(new Error("cancelled"));
      if (code === 0) return resolve();
      reject(new Error(err.split("\n").filter(Boolean).slice(-3).join(" ") || `exit ${code}`));
    });
  });

// GPU-accelerated frame interpolation: extract -> rife -> reassemble.
// targetFps can be arbitrary; rife's -n sets the exact output frame count.
export function runRife(
  input: string,
  output: string,
  targetFps: number,
  onProgress: (p: number) => void,
): RunHandle {
  const state: Phase = { proc: null, killed: false };
  const base = tempBase();
  const framesIn = `${base}-in`;
  const framesOut = `${base}-out`;

  const promise = (async () => {
    if (
      !(await access(RIFE_BIN).then(
        () => true,
        () => false,
      ))
    ) {
      throw new Error(
        "RIFE binary not found — run `pnpm setup:rife`, or use the Minterpolate engine.",
      );
    }
    const meta = await probe(input);
    const outCount = Math.max(2, Math.round(meta.duration * targetFps));
    await ensureDir(output);
    await mkdir(framesIn, { recursive: true });
    await mkdir(framesOut, { recursive: true });
    try {
      // 1. extract original frames (0..30% of progress bar)
      await run(
        FFMPEG,
        ["-y", "-hide_banner", "-i", input, path.join(framesIn, "%08d.png")],
        state,
        (line) => {
          const m = line.match(/frame=\s*(\d+)/);
          if (m && meta.duration && meta.fps) {
            onProgress(Math.min(0.3, (Number(m[1]) / (meta.duration * meta.fps)) * 0.3));
          }
        },
      );
      if (state.killed) throw new Error("cancelled");

      // 2. interpolate to outCount frames (30..90%); poll output dir for progress
      const poll = setInterval(async () => {
        try {
          const n = (await readdir(framesOut)).length;
          onProgress(0.3 + Math.min(0.6, (n / outCount) * 0.6));
        } catch {
          /* dir may not exist yet */
        }
      }, 500);
      try {
        await run(
          RIFE_BIN,
          ["-i", framesIn, "-o", framesOut, "-n", String(outCount), "-m", RIFE_MODEL, "-g", "0"],
          state,
        );
      } finally {
        clearInterval(poll);
      }
      if (state.killed) throw new Error("cancelled");

      // 3. reassemble at target fps, carry original audio if present (90..100%)
      const args = [
        "-y",
        "-hide_banner",
        "-framerate",
        String(targetFps),
        "-i",
        path.join(framesOut, "%08d.png"),
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "1:a?",
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        output,
      ];
      await run(FFMPEG, args, state, (line) => {
        const m = line.match(/frame=\s*(\d+)/);
        if (m) onProgress(0.9 + Math.min(0.099, (Number(m[1]) / outCount) * 0.1));
      });
    } finally {
      rm(framesIn, { recursive: true, force: true }).catch(() => {});
      rm(framesOut, { recursive: true, force: true }).catch(() => {});
    }
  })();

  return {
    promise,
    cancel: () => {
      state.killed = true;
      state.proc?.kill("SIGKILL");
    },
  };
}
