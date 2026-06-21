import PQueue from "p-queue";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getTool } from "../shared/tools";
import type { EnqueuePayload, Job } from "../shared/types";
import { probe, runPass, tempBase, ensureDir, type RunHandle } from "./ffmpeg";
import { runRife } from "./rife";

// ponytail: concurrency 1 — ffmpeg already saturates CPU; bump if you add GPU-light tools
const queue = new PQueue({ concurrency: 1 });
const jobs = new Map<string, Job>();
const handles = new Map<string, RunHandle>();

type Emit = (job: Job) => void;
let emit: Emit = () => {};
export const onJobUpdate = (fn: Emit) => (emit = fn);

const update = (id: string, patch: Partial<Job>) => {
  const job = { ...jobs.get(id)!, ...patch };
  jobs.set(id, job);
  emit(job);
};

const outPath = (input: string, outputDir: string, toolId: string, ext: string): string => {
  const base = path.basename(input, path.extname(input));
  return path.join(outputDir, `${base}_${toolId}${ext}`);
};

export function enqueue(payload: EnqueuePayload): Job {
  const tool = getTool(payload.toolId);
  if (!tool || !tool.buildArgs) throw new Error(`unknown tool: ${payload.toolId}`);
  const id = randomUUID();
  const ext = typeof tool.ext === "function" ? tool.ext(payload.opts) : (tool.ext ?? ".mp4");
  const output = outPath(payload.input, payload.outputDir, tool.id, ext);
  const job: Job = {
    id,
    toolId: tool.id,
    toolLabel: tool.label,
    input: payload.input,
    output,
    status: "queued",
    progress: 0,
  };
  jobs.set(id, job);
  emit(job);

  queue.add(async () => {
    if (jobs.get(id)?.status === "cancelled") return;
    update(id, { status: "running" });
    try {
      const meta = await probe(payload.input);
      await ensureDir(output);

      // FPS booster with RIFE engine runs a GPU pipeline instead of a single ffmpeg pass
      if (tool.id === "fps" && payload.opts.engine === "rife") {
        const handle = runRife(payload.input, output, Number(payload.opts.target), (p) =>
          update(id, { progress: p }),
        );
        handles.set(id, handle);
        await handle.promise;
        handles.delete(id);
        update(id, { status: "done", progress: 1 });
        return;
      }

      const passes = tool.buildArgs!({
        input: payload.input,
        output,
        opts: payload.opts,
        probe: meta,
        temp: tempBase(),
      });
      for (let i = 0; i < passes.length; i++) {
        const handle = runPass(passes[i], meta.duration, (p) => {
          // weight progress across passes
          update(id, { progress: (i + p) / passes.length });
        });
        handles.set(id, handle);
        await handle.promise;
      }
      handles.delete(id);
      update(id, { status: "done", progress: 1 });
    } catch (e) {
      handles.delete(id);
      const msg = e instanceof Error ? e.message : String(e);
      update(id, { status: msg === "cancelled" ? "cancelled" : "error", error: msg });
    }
  });

  return job;
}

export function cancel(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  handles.get(id)?.cancel();
  if (job.status === "queued") update(id, { status: "cancelled" });
}

export const listJobs = () => [...jobs.values()];
