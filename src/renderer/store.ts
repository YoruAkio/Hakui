import { create } from "zustand";
import { TOOLS } from "../shared/tools";
import type { Job, ProbeResult } from "../shared/types";

type State = {
  toolId: string;
  inputs: string[];
  outputDir: string | null;
  opts: Record<string, string | number | boolean>;
  probe: ProbeResult | null;
  jobs: Job[];
  setTool: (id: string) => void;
  addInputs: (paths: string[]) => void;
  removeInput: (path: string) => void;
  clearInputs: () => void;
  setOutputDir: (dir: string | null) => void;
  setOpt: (name: string, value: string | number | boolean) => void;
  setProbe: (p: ProbeResult | null) => void;
  upsertJob: (job: Job) => void;
};

// seed opts from a tool's field defaults
const defaultsFor = (toolId: string): Record<string, string | number | boolean> => {
  const tool = TOOLS.find((t) => t.id === toolId);
  const out: Record<string, string | number | boolean> = {};
  tool?.fields.forEach((f) => (out[f.name] = f.default));
  return out;
};

export const useStore = create<State>((set) => ({
  toolId: TOOLS[0].id,
  inputs: [],
  outputDir: null,
  opts: defaultsFor(TOOLS[0].id),
  probe: null,
  jobs: [],
  setTool: (id) => set({ toolId: id, opts: defaultsFor(id) }),
  // append new picks, dedup by path so re-picking the same file doesn't double it
  addInputs: (paths) => set((s) => ({ inputs: [...new Set([...s.inputs, ...paths])] })),
  removeInput: (path) => set((s) => ({ inputs: s.inputs.filter((p) => p !== path) })),
  clearInputs: () => set({ inputs: [] }),
  setOutputDir: (dir) => set({ outputDir: dir }),
  setOpt: (name, value) => set((s) => ({ opts: { ...s.opts, [name]: value } })),
  setProbe: (p) => set({ probe: p }),
  upsertJob: (job) =>
    set((s) => {
      const i = s.jobs.findIndex((j) => j.id === job.id);
      if (i === -1) return { jobs: [job, ...s.jobs] };
      const next = [...s.jobs];
      next[i] = job;
      return { jobs: next };
    }),
}));
