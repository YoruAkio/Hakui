export type ProbeResult = {
  path: string;
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  vcodec: string;
  acodec: string;
  bitrate: number; // bits/s
  size: number; // bytes
  format: string;
  raw: unknown; // full ffprobe json
};

export type FieldOption = { label: string; value: string | number };

export type Field = {
  name: string;
  label: string;
  type: "select" | "number" | "range" | "checkbox";
  default: string | number | boolean;
  options?: FieldOption[] | ((probe?: ProbeResult) => FieldOption[]);
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
};

// context handed to a tool's buildArgs — pure, no fs access
export type BuildCtx = {
  input: string;
  output: string;
  opts: Record<string, string | number | boolean>;
  probe: ProbeResult;
  temp: string; // unique temp path base for intermediate files (e.g. vidstab .trf)
};

export type ToolKind = "transform" | "probe";

export type ToolDef = {
  id: string;
  label: string;
  icon: string;
  description: string;
  kind: ToolKind;
  ext?: string | ((opts: Record<string, string | number | boolean>) => string); // output extension for transforms
  fields: Field[];
  // returns one arg-array per ffmpeg pass (most tools = 1 pass, stabilizer = 2)
  buildArgs?: (ctx: BuildCtx) => string[][];
};

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type Job = {
  id: string;
  toolId: string;
  toolLabel: string;
  input: string;
  output: string;
  status: JobStatus;
  progress: number; // 0..1
  error?: string;
};

// renderer -> main enqueue payload
export type EnqueuePayload = {
  toolId: string;
  input: string;
  outputDir: string;
  opts: Record<string, string | number | boolean>;
};
