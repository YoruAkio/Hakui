import { contextBridge, ipcRenderer } from "electron";
import type { ProbeResult, EnqueuePayload, Job } from "../shared/types";

const api = {
  probe: (input: string): Promise<ProbeResult> => ipcRenderer.invoke("probe", input),
  filmstrip: (input: string): Promise<string> => ipcRenderer.invoke("filmstrip", input),
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke("pick:files"),
  pickDir: (): Promise<string | null> => ipcRenderer.invoke("pick:dir"),
  enqueue: (payload: EnqueuePayload): Promise<Job> => ipcRenderer.invoke("job:enqueue", payload),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke("job:cancel", id),
  listJobs: (): Promise<Job[]> => ipcRenderer.invoke("jobs:list"),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke("reveal", path),
  preview: (path: string): Promise<string> => ipcRenderer.invoke("preview", path),
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  close: () => ipcRenderer.send("win:close"),
  onJobUpdate: (cb: (job: Job) => void) => {
    const handler = (_e: unknown, job: Job) => cb(job);
    ipcRenderer.on("job:update", handler);
    return () => {
      ipcRenderer.removeListener("job:update", handler);
    };
  },
};

contextBridge.exposeInMainWorld("hayai", api);

export type HayaiApi = typeof api;
