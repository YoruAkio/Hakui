import type { ToolDef, FieldOption, ProbeResult } from "./types";

// fixed standard targets above the source fps; falls back to all if source is already high
const fpsTargets = (probe?: ProbeResult): FieldOption[] => {
  const src = probe?.fps ?? 0;
  const tiers = [60, 90, 120, 144, 240];
  const above = tiers.filter((t) => t > src);
  return (above.length ? above : tiers).map((t) => ({ label: `${t} fps`, value: t }));
};

export const TOOLS: ToolDef[] = [
  {
    id: "fps",
    label: "FPS Booster",
    icon: "Gauge",
    description: "Motion-interpolate to a higher frame rate. Slow but real (mci).",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "engine",
        label: "Engine",
        type: "select",
        default: "rife",
        options: [
          { label: "RIFE (GPU, fast, best quality)", value: "rife" },
          { label: "Minterpolate (CPU, no GPU needed)", value: "minterpolate" },
        ],
        hint: "RIFE uses your GPU (Vulkan). Falls back to Minterpolate if no GPU.",
      },
      {
        name: "target",
        label: "Target frame rate",
        type: "select",
        default: 60,
        options: fpsTargets,
        hint: "Options scale from the detected source fps.",
      },
      {
        name: "mode",
        label: "Interpolation (Minterpolate only)",
        type: "select",
        default: "mci",
        options: [
          { label: "Motion-compensated (best, slow)", value: "mci" },
          { label: "Blend (fast, softer)", value: "blend" },
          { label: "Duplicate (fastest)", value: "dup" },
        ],
      },
    ],
    // RIFE is routed in queue.ts (multi-binary pipeline); this only builds the minterpolate path.
    buildArgs: ({ input, output, opts }) => {
      const mode = String(opts.mode);
      // mci does motion estimation; a smaller search window is much faster with minor quality loss.
      // blend/dup don't estimate motion, so they ignore these extra params.
      const vf =
        mode === "mci"
          ? `minterpolate=fps=${opts.target}:mi_mode=mci:me=epzs:search_param=16`
          : `minterpolate=fps=${opts.target}:mi_mode=${mode}`;
      return [
        [
          "-i",
          input,
          "-vf",
          vf,
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "medium",
          "-c:a",
          "copy",
          output,
        ],
      ];
    },
  },
  {
    id: "motionblur",
    label: "Motion Blur",
    icon: "Wind",
    description: "Average consecutive frames to add cinematic motion blur.",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "frames",
        label: "Blur strength",
        type: "select",
        default: 4,
        options: [
          { label: "Subtle (2 frames)", value: 2 },
          { label: "Medium (4 frames)", value: 4 },
          { label: "Heavy (8 frames)", value: 8 },
        ],
      },
    ],
    // ponytail: tmix averaging is the cheap real blur; interpolate-then-average is prettier but ~10x slower
    buildArgs: ({ input, output, opts }) => [
      [
        "-i",
        input,
        "-vf",
        `tmix=frames=${opts.frames}`,
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "medium",
        "-c:a",
        "copy",
        output,
      ],
    ],
  },
  {
    id: "convert",
    label: "Format Converter",
    icon: "FileVideo",
    description: "Re-container / re-encode to another format.",
    kind: "transform",
    ext: (opts) => `.${opts.format}`,
    fields: [
      {
        name: "format",
        label: "Output format",
        type: "select",
        default: "mp4",
        options: [
          { label: "MP4 (H.264)", value: "mp4" },
          { label: "MKV (H.264)", value: "mkv" },
          { label: "WebM (VP9)", value: "webm" },
          { label: "MOV", value: "mov" },
          { label: "GIF", value: "gif" },
        ],
      },
    ],
    buildArgs: ({ input, output, opts }) => {
      if (opts.format === "gif") {
        // ponytail: single-pass gif; add palettegen 2-pass if banding shows
        return [["-i", input, "-vf", "fps=15,scale=480:-1:flags=lanczos", "-loop", "0", output]];
      }
      if (opts.format === "webm") {
        return [
          ["-i", input, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus", output],
        ];
      }
      return [
        ["-i", input, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-c:a", "aac", output],
      ];
    },
  },
  {
    id: "upscale",
    label: "Video Upscaler",
    icon: "Expand",
    description: "Lanczos upscale to a target height. (AI upscale = separate binary, later.)",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "height",
        label: "Target resolution",
        type: "select",
        default: 1080,
        options: [
          { label: "720p", value: 720 },
          { label: "1080p", value: 1080 },
          { label: "1440p", value: 1440 },
          { label: "4K (2160p)", value: 2160 },
        ],
      },
    ],
    buildArgs: ({ input, output, opts }) => [
      [
        "-i",
        input,
        "-vf",
        `scale=-2:${opts.height}:flags=lanczos`,
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "medium",
        "-c:a",
        "copy",
        output,
      ],
    ],
  },
  {
    id: "trim",
    label: "Video Trimmer",
    icon: "Scissors",
    description: "Cut a clip between two timestamps without re-encoding.",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "start",
        label: "Start (s or HH:MM:SS)",
        type: "number",
        default: 0,
        min: 0,
        step: 1,
        unit: "s",
      },
      {
        name: "end",
        label: "End (s or HH:MM:SS)",
        type: "number",
        default: 10,
        min: 0,
        step: 1,
        unit: "s",
      },
    ],
    // ponytail: -c copy = instant but cuts on keyframes; add re-encode toggle if frame-accuracy needed
    buildArgs: ({ input, output, opts }) => [
      ["-ss", String(opts.start), "-to", String(opts.end), "-i", input, "-c", "copy", output],
    ],
  },
  {
    id: "bitrate",
    label: "Bitrate Optimizer",
    icon: "Minimize2",
    description: "Shrink file size via CRF re-encode.",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "crf",
        label: "Quality",
        type: "select",
        default: 23,
        options: [
          { label: "High quality (CRF 18)", value: 18 },
          { label: "Balanced (CRF 23)", value: 23 },
          { label: "Small size (CRF 28)", value: 28 },
        ],
      },
    ],
    buildArgs: ({ input, output, opts }) => [
      [
        "-i",
        input,
        "-c:v",
        "libx264",
        "-crf",
        String(opts.crf),
        "-preset",
        "slow",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        output,
      ],
    ],
  },
  {
    id: "extract",
    label: "Auto Extractor",
    icon: "Download",
    description: "Pull audio, subtitles, or frames out of a video.",
    kind: "transform",
    ext: (opts) => {
      if (opts.target === "audio") return ".m4a";
      if (opts.target === "subs") return ".srt";
      return "_frames/frame_%05d.png"; // dir + pattern, main mkdirs the parent
    },
    fields: [
      {
        name: "target",
        label: "Extract",
        type: "select",
        default: "audio",
        options: [
          { label: "Audio track", value: "audio" },
          { label: "Subtitles", value: "subs" },
          { label: "Frames (PNG)", value: "frames" },
        ],
      },
    ],
    buildArgs: ({ input, output, opts }) => {
      if (opts.target === "audio") return [["-i", input, "-vn", "-c:a", "aac", output]];
      if (opts.target === "subs") return [["-i", input, "-map", "0:s:0", output]];
      return [["-i", input, "-vf", "fps=1", output]];
    },
  },
  {
    id: "denoise",
    label: "Noise Reduction",
    icon: "Sparkles",
    description: "Clean video grain (hqdn3d) and/or audio hiss (afftdn).",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "mode",
        label: "Target",
        type: "select",
        default: "video",
        options: [
          { label: "Video", value: "video" },
          { label: "Audio", value: "audio" },
          { label: "Both", value: "both" },
        ],
      },
      {
        name: "strength",
        label: "Strength",
        type: "select",
        default: "medium",
        options: [
          { label: "Light", value: "light" },
          { label: "Medium", value: "medium" },
          { label: "Strong", value: "strong" },
        ],
      },
    ],
    buildArgs: ({ input, output, opts }) => {
      const hq = { light: "hqdn3d=2:1:2:3", medium: "hqdn3d=4:3:6:4", strong: "hqdn3d=8:6:12:9" }[
        opts.strength as string
      ];
      const args = ["-i", input];
      if (opts.mode !== "audio")
        args.push("-vf", hq, "-c:v", "libx264", "-crf", "18", "-preset", "medium");
      else args.push("-c:v", "copy");
      if (opts.mode !== "video") args.push("-af", "afftdn=nf=-25");
      else args.push("-c:a", "copy");
      args.push(output);
      return [args];
    },
  },
  {
    id: "stabilize",
    label: "Video Stabilizer",
    icon: "Crosshair",
    description: "Two-pass libvidstab smoothing of shaky footage.",
    kind: "transform",
    ext: ".mp4",
    fields: [
      {
        name: "smoothing",
        label: "Smoothing",
        type: "select",
        default: 10,
        options: [
          { label: "Light (5)", value: 5 },
          { label: "Medium (10)", value: 10 },
          { label: "Strong (20)", value: 20 },
        ],
      },
    ],
    buildArgs: ({ input, output, opts, temp }) => {
      const trf = `${temp}.trf`;
      return [
        ["-i", input, "-vf", `vidstabdetect=shakiness=8:result=${trf}`, "-f", "null", "-"],
        [
          "-i",
          input,
          "-vf",
          `vidstabtransform=smoothing=${opts.smoothing}:input=${trf},unsharp=5:5:0.8:3:3:0.4`,
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "medium",
          "-c:a",
          "copy",
          output,
        ],
      ];
    },
  },
  {
    id: "metadata",
    label: "Metadata Viewer",
    icon: "Info",
    description: "Inspect codec, resolution, fps, bitrate and full ffprobe data.",
    kind: "probe",
    fields: [],
  },
];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);
