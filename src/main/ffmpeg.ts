import { spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { app } from "electron";
import type { ProbeResult } from "../shared/types";

// dev: resolve from node_modules (externalized so __dirname is correct).
// prod: forge-vite doesn't copy node_modules into the asar, so the binaries are
// shipped via extraResource (see forge.config.ts) and live in resources/.
export let FFMPEG: string;
let FFPROBE: string;
if (app.isPackaged) {
  FFMPEG = path.join(process.resourcesPath, "ffmpeg");
  FFPROBE = path.join(process.resourcesPath, "ffprobe");
} else {
  FFMPEG = require("ffmpeg-static") as string;
  FFPROBE = (require("ffprobe-static") as { path: string }).path;
}

export async function probe(input: string): Promise<ProbeResult> {
  const args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", input];
  const json = await new Promise<string>((resolve, reject) => {
    let out = "";
    let err = "";
    const p = spawn(FFPROBE, args);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `ffprobe exit ${code}`)),
    );
  });
  const data = JSON.parse(json);
  const v = data.streams?.find((s: { codec_type: string }) => s.codec_type === "video") ?? {};
  const a = data.streams?.find((s: { codec_type: string }) => s.codec_type === "audio") ?? {};
  const fpsStr: string =
    v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : (v.r_frame_rate ?? "0/1");
  const [num, den] = fpsStr.split("/").map(Number);
  return {
    path: input,
    duration: Number(data.format?.duration) || 0,
    width: v.width ?? 0,
    height: v.height ?? 0,
    fps: den ? num / den : 0,
    vcodec: v.codec_name ?? "",
    acodec: a.codec_name ?? "",
    bitrate: Number(data.format?.bit_rate) || 0,
    size: Number(data.format?.size) || 0,
    format: data.format?.format_name ?? "",
    raw: data,
  };
}

// hh:mm:ss.xx -> seconds, for progress parsing
const toSeconds = (t: string): number => {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

export type RunHandle = { promise: Promise<void>; cancel: () => void };

// runs one ffmpeg pass; onProgress 0..1 derived from time= vs total duration
export function runPass(
  args: string[],
  totalDuration: number,
  onProgress: (p: number) => void,
): RunHandle {
  let proc: ReturnType<typeof spawn>;
  let killed = false;
  const promise = new Promise<void>((resolve, reject) => {
    proc = spawn(FFMPEG, ["-y", "-hide_banner", ...args]);
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      const m = text.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (m && totalDuration > 0) onProgress(Math.min(toSeconds(m[1]) / totalDuration, 0.999));
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (killed) return reject(new Error("cancelled"));
      if (code === 0) return resolve();
      reject(
        new Error(stderr.split("\n").filter(Boolean).slice(-3).join(" ") || `ffmpeg exit ${code}`),
      );
    });
  });
  return {
    promise,
    cancel: () => {
      killed = true;
      proc?.kill("SIGKILL");
    },
  };
}

export const tempBase = () =>
  path.join(os.tmpdir(), `hayai-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const ensureDir = (p: string) => mkdir(path.dirname(p), { recursive: true });

// tile `count` evenly-spaced frames into one horizontal strip, return as a data URL for the timeline bg
export async function filmstrip(input: string, count = 12): Promise<string> {
  const meta = await probe(input);
  if (!meta.duration) throw new Error("no duration");
  const out = `${tempBase()}.jpg`;
  const fps = count / meta.duration;
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-frames:v",
    "1",
    "-vf",
    `fps=${fps},scale=-1:72,tile=${count}x1`,
    out,
  ];
  await new Promise<void>((resolve, reject) => {
    const p = spawn(FFMPEG, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`)),
    );
  });
  const buf = await readFile(out);
  unlink(out).catch(() => {});
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
