<div align="center">

<img src="public/icon.svg" alt="Hayai" width="96" height="96" />

# Hayai

**A fast, modern desktop toolkit for everyday media work.**

[![Build](https://github.com/yoruakio/hayai/actions/workflows/build.yml/badge.svg)](https://github.com/yoruakio/hayai/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#install)

</div>

Hayai (速い, "fast") wraps `ffmpeg` and GPU frame interpolation behind a clean, dark interface. Drop in a video, pick a tool, queue the job — no command line required.

## Features

- **FPS Booster** — GPU-accelerated frame interpolation via RIFE (Vulkan, works on Intel/AMD/Nvidia), with a CPU `minterpolate` fallback.
- **Video Trimmer** — drag-to-select start/end on a live filmstrip timeline.
- **Format Converter** — MP4, MKV, WebM, MOV, GIF.
- **Video Upscaler** — Lanczos scaling up to 4K.
- **Bitrate Optimizer** — CRF re-encode to shrink files.
- **Motion Blur**, **Noise Reduction**, **Video Stabilizer** — real ffmpeg filter chains.
- **Auto Extractor** — pull audio, subtitles, or frames.
- **Metadata Viewer** — codec, resolution, fps, bitrate at a glance.
- **Batch Queue** — line up multiple jobs and watch progress live.

## Install

Grab the installer for your platform from the [Releases](https://github.com/yoruakio/hayai/releases) page:

- **Windows** — `.exe`
- **macOS** — `.dmg`
- **Linux** — `.deb` or `.rpm`

`ffmpeg` and the RIFE engine ship inside the package — nothing extra to download.

## Development

Requires [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install      # install dependencies
pnpm setup:rife   # fetch the RIFE binary + model for your platform
pnpm start        # launch in dev mode
```

To build distributables locally:

```bash
pnpm make
```

The RIFE binary (~20 MB) is not committed to the repo. `pnpm setup:rife` downloads the platform-matched build from the [rife-ncnn-vulkan](https://github.com/nihui/rife-ncnn-vulkan) releases; the same step runs automatically before `pnpm make`.

## Tech

Electron · React · TypeScript · Vite · Tailwind CSS · ffmpeg · rife-ncnn-vulkan

## License

Licensed under the [Apache License 2.0](LICENSE).
