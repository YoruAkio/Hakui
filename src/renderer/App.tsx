import { useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { TOOLS, getTool } from "../shared/tools";
import type { Field, FieldOption } from "../shared/types";
import { useStore } from "./store";

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const C = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Box;
  return <C className={className} />;
};

const fmtBytes = (n: number) => {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) ((n /= 1024), i++);
  return `${n.toFixed(1)} ${u[i]}`;
};
const fmtDur = (s: number) => {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h, m, sec].map((x) => String(x).padStart(2, "0")).join(":");
};
// compact clock for the trim timeline: M:SS, or H:MM:SS when over an hour
const fmtTime = (s: number) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

function Sidebar() {
  const { toolId, setTool } = useStore();
  return (
    <aside className="surface-gradient flex w-60 shrink-0 flex-col">
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              toolId === t.id
                ? "bg-accent text-accent-foreground elevated"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function FieldInput({ field }: { field: Field }) {
  const { opts, setOpt, probe } = useStore();
  const value = opts[field.name];
  const options: FieldOption[] = useMemo(() => {
    if (typeof field.options === "function") return field.options(probe ?? undefined);
    return field.options ?? [];
  }, [field, probe]);

  if (field.type === "select") {
    return (
      <select
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          setOpt(field.name, opt ? opt.value : e.target.value);
        }}
        className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => setOpt(field.name, e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        {field.hint}
      </label>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number(value)}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={(e) => setOpt(field.name, Number(e.target.value))}
        className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
      {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
    </div>
  );
}

function ProbePanel() {
  const probe = useStore((s) => s.probe);
  if (!probe) return null;
  const rows: [string, string][] = [
    ["Resolution", probe.width ? `${probe.width}×${probe.height}` : "—"],
    ["Frame rate", probe.fps ? `${probe.fps.toFixed(2)} fps` : "—"],
    ["Duration", fmtDur(probe.duration)],
    ["Video codec", probe.vcodec || "—"],
    ["Audio codec", probe.acodec || "—"],
    ["Bitrate", probe.bitrate ? `${(probe.bitrate / 1000).toFixed(0)} kbps` : "—"],
    ["Size", fmtBytes(probe.size)],
    ["Container", probe.format || "—"],
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border elevated">
      {rows.map(([k, v]) => (
        <div key={k} className="bg-card px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
          <div className="mt-0.5 text-sm font-medium">{v}</div>
        </div>
      ))}
    </div>
  );
}

function TrimTimeline() {
  const { inputs, opts, setOpt, probe } = useStore();
  const input = inputs[0];
  const duration = probe?.duration ?? 0;
  const [strip, setStrip] = useState<string | null>(null);
  const [stripErr, setStripErr] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);
  const initFor = useRef<string | null>(null);

  const start = Number(opts.start) || 0;
  const end = Number(opts.end) || 0;
  // keep latest values readable from the stable pointer handler
  const valsRef = useRef({ start, end, duration });
  valsRef.current = { start, end, duration };

  // load the filmstrip for the current input
  useEffect(() => {
    setStrip(null);
    setStripErr(false);
    if (!input) return;
    let alive = true;
    window.hayai
      .filmstrip(input)
      .then((d) => alive && setStrip(d))
      .catch(() => alive && setStripErr(true));
    return () => {
      alive = false;
    };
  }, [input]);

  // default the selection to the whole clip when a new video's duration arrives
  useEffect(() => {
    if (!input || !duration || initFor.current === input) return;
    initFor.current = input;
    setOpt("start", 0);
    setOpt("end", Math.round(duration * 100) / 100);
  }, [input, duration, setOpt]);

  // drag handlers bound once; read live values via ref
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = trackRef.current;
      const { start: s, end: en, duration: dur } = valsRef.current;
      if (!el || !dur || !dragging.current) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const t = Math.round(frac * dur * 100) / 100;
      if (dragging.current === "start") setOpt("start", Math.min(t, en - 0.1));
      else setOpt("end", Math.max(t, s + 0.1));
    };
    const up = () => {
      dragging.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [setOpt]);

  const startPct = duration ? (start / duration) * 100 : 0;
  const endPct = duration ? (end / duration) * 100 : 100;

  return (
    <section className="surface-gradient mb-5 rounded-xl border border-border p-5 elevated">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium">Trim</span>
        <span className="text-muted-foreground">
          {fmtTime(start)} – {fmtTime(end)}{" "}
          <span className="text-foreground">({fmtTime(end - start)})</span>
        </span>
      </div>
      {!input ? (
        <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          Select a video to trim
        </div>
      ) : (
        <div
          ref={trackRef}
          className="relative h-20 select-none overflow-hidden rounded-lg border border-border bg-background"
          style={
            strip ? { backgroundImage: `url(${strip})`, backgroundSize: "100% 100%" } : undefined
          }
        >
          <div
            className="absolute inset-y-0 left-0 bg-background/70"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-background/70"
            style={{ width: `${100 - endPct}%` }}
          />
          <div
            className="pointer-events-none absolute inset-y-0 border-y-2 border-primary"
            style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
          />
          <div
            onPointerDown={() => (dragging.current = "start")}
            className="absolute inset-y-0 z-10 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm bg-primary"
            style={{ left: `${startPct}%` }}
          >
            <div className="h-6 w-0.5 rounded bg-primary-foreground/70" />
          </div>
          <div
            onPointerDown={() => (dragging.current = "end")}
            className="absolute inset-y-0 z-10 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm bg-primary"
            style={{ left: `${endPct}%` }}
          >
            <div className="h-6 w-0.5 rounded bg-primary-foreground/70" />
          </div>
          {stripErr && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              preview unavailable
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ToolPanel() {
  const {
    toolId,
    inputs,
    outputDir,
    opts,
    addInputs,
    removeInput,
    clearInputs,
    setOutputDir,
    setProbe,
    probe,
  } = useStore();
  const tool = getTool(toolId)!;
  const isProbe = tool.kind === "probe";

  // probe the first input whenever it changes (drives fps options + metadata viewer)
  useEffect(() => {
    if (!inputs[0]) return setProbe(null);
    let alive = true;
    window.hayai
      .probe(inputs[0])
      .then((p) => alive && setProbe(p))
      .catch(() => alive && setProbe(null));
    return () => {
      alive = false;
    };
  }, [inputs, setProbe]);

  const pickFiles = async () => addInputs(await window.hayai.pickFiles());
  const pickDir = async () => setOutputDir(await window.hayai.pickDir());

  const run = async () => {
    if (!inputs.length || !outputDir) return;
    for (const input of inputs) {
      await window.hayai.enqueue({ toolId, input, outputDir, opts });
    }
  };

  const canRun = inputs.length > 0 && (isProbe || outputDir);

  return (
    <div className="flex-1 overflow-y-auto rounded-tr-2xl bg-background px-8 py-7">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary elevated">
          <Icon name={tool.icon} className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{tool.label}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </div>

      <section className="surface-gradient mb-5 rounded-xl border border-border p-5 elevated">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">Input</span>
          <div className="flex items-center gap-2">
            {inputs.length > 0 && (
              <button
                onClick={clearInputs}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-destructive"
              >
                <Icons.Trash2 className="h-3.5 w-3.5" />
                Remove all
              </button>
            )}
            <button
              onClick={pickFiles}
              className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Icons.FolderOpen className="h-3.5 w-3.5" />
              Choose files
            </button>
          </div>
        </div>
        {inputs.length === 0 ? (
          <button
            onClick={pickFiles}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <Icons.Upload className="h-6 w-6" />
            <span className="text-sm">Select media to get started</span>
          </button>
        ) : (
          <ul className="space-y-1">
            {inputs.map((f) => (
              <li
                key={f}
                className="group flex items-center gap-2 rounded-md bg-background/40 px-3 py-2 text-sm"
              >
                <Icons.FileVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.split("/").pop()}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => window.hayai.preview(f)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Preview"
                  >
                    <Icons.Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeInput(f)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    title="Remove"
                  >
                    <Icons.Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isProbe ? (
        <ProbePanel />
      ) : (
        <>
          {tool.id === "trim" ? (
            <TrimTimeline />
          ) : (
            tool.fields.length > 0 && (
              <section className="surface-gradient mb-5 grid grid-cols-2 gap-4 rounded-xl border border-border p-5 elevated">
                {tool.fields.map((f) => (
                  <div key={f.name} className={tool.fields.length === 1 ? "col-span-2" : ""}>
                    <label className="mb-1.5 block text-sm font-medium">{f.label}</label>
                    <FieldInput field={f} />
                    {f.hint && f.type !== "checkbox" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p>
                    )}
                  </div>
                ))}
              </section>
            )
          )}

          <section className="surface-gradient mb-5 flex items-center justify-between rounded-xl border border-border p-5 elevated">
            <div>
              <div className="text-sm font-medium">Output folder</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {outputDir ?? "Not selected"}
              </div>
            </div>
            <button
              onClick={pickDir}
              className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Choose
            </button>
          </section>

          <button
            onClick={run}
            disabled={!canRun}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground elevated transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icons.Play className="h-4 w-4" />
            {inputs.length > 1 ? `Queue ${inputs.length} jobs` : "Run"}
          </button>
        </>
      )}

      {probe && !isProbe && (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Detected {probe.fps ? `${probe.fps.toFixed(0)} fps · ` : ""}
          {probe.width ? `${probe.width}×${probe.height}` : ""}
        </p>
      )}
    </div>
  );
}

const statusMeta: Record<string, { icon: string; color: string; label: string; spin?: boolean }> = {
  queued: { icon: "Clock", color: "text-muted-foreground", label: "Queued" },
  running: { icon: "Loader2", color: "text-primary", label: "Running", spin: true },
  done: { icon: "CheckCircle2", color: "text-[hsl(var(--success))]", label: "Done" },
  cancelled: { icon: "Ban", color: "text-destructive", label: "Cancelled" },
  error: { icon: "AlertCircle", color: "text-destructive", label: "Error" },
};

function QueueList({ pinned, onUnpin }: { pinned?: boolean; onUnpin?: () => void }) {
  const jobs = useStore((s) => s.jobs);
  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Queue</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {jobs.filter((j) => j.status === "running" || j.status === "queued").length} active
          </span>
          {pinned && (
            <button
              onClick={onUnpin}
              className="text-muted-foreground hover:text-foreground"
              title="Unpin"
            >
              <Icons.PinOff className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {jobs.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No jobs yet</div>
        )}
        {jobs.map((j) => (
          <div key={j.id} className="rounded-lg border border-border bg-card p-3 elevated">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{j.input.split("/").pop()}</span>
              {(j.status === "running" || j.status === "queued") && (
                <button
                  onClick={() => window.hayai.cancel(j.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Icons.X className="h-3.5 w-3.5" />
                </button>
              )}
              {j.status === "done" && (
                <button
                  onClick={() => window.hayai.reveal(j.output)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icons.FolderOpen className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{j.toolLabel}</span>
              <Icon
                name={statusMeta[j.status].icon}
                className={`h-3.5 w-3.5 ${statusMeta[j.status].color} ${statusMeta[j.status].spin ? "animate-spin" : ""}`}
              />
            </div>
            {(j.status === "running" || j.status === "queued") && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(j.progress * 100)}%` }}
                />
              </div>
            )}
            {j.status === "error" && (
              <p className="mt-1.5 text-[11px] text-destructive">{j.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueButton() {
  const { jobs, upsertJob } = useStore();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = hovered || pinned;
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued").length;

  useEffect(() => {
    window.hayai.listJobs().then((js) => js.forEach(upsertJob));
    return window.hayai.onJobUpdate(upsertJob);
  }, [upsertJob]);

  // small grace period so moving the cursor button -> popover doesn't close it
  const enter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const leave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 200);
  };

  return (
    <div className="no-drag relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        onClick={() => setPinned((p) => !p)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
          pinned
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Icons.ListChecks className="h-3.5 w-3.5" />
        Queue
        {active > 0 && (
          <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {active}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 w-80 pt-1.5">
          <div className="overflow-hidden rounded-xl border border-border bg-popover elevated">
            <QueueList pinned={pinned} onUnpin={() => setPinned(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  return (
    <header className="drag flex h-10 shrink-0 items-center justify-between bg-card pl-3 pr-2">
      <div className="flex items-center gap-2">
        <img src="/icon.svg" alt="" className="h-5 w-5" />
        <span className="text-xs font-semibold">Hayai</span>
      </div>
      <div className="flex items-center gap-1">
        <QueueButton />
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          onClick={() => window.hayai.minimize()}
          className="no-drag rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Icons.Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => window.hayai.toggleMaximize()}
          className="no-drag rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Icons.Square className="h-3 w-3" />
        </button>
        <button
          onClick={() => window.hayai.close()}
          className="no-drag rounded p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        >
          <Icons.X className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="surface-gradient flex min-h-0 flex-1">
        <ToolPanel />
        <Sidebar />
      </div>
    </div>
  );
}
