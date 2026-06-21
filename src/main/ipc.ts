import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { probe, filmstrip } from "./ffmpeg";
import { enqueue, cancel, listJobs, onJobUpdate } from "./queue";
import type { EnqueuePayload } from "../shared/types";

export function registerIpc(win: BrowserWindow) {
  onJobUpdate((job) => win.webContents.send("job:update", job));

  ipcMain.handle("probe", (_e, input: string) => probe(input));
  ipcMain.handle("filmstrip", (_e, input: string) => filmstrip(input));
  ipcMain.handle("jobs:list", () => listJobs());
  ipcMain.handle("job:enqueue", (_e, payload: EnqueuePayload) => enqueue(payload));
  ipcMain.handle("job:cancel", (_e, id: string) => cancel(id));

  ipcMain.handle("pick:files", async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: ["mp4", "mkv", "mov", "avi", "webm", "flv", "m4v", "mp3", "wav", "flac"],
        },
      ],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle("pick:dir", async () => {
    const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("reveal", (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle("preview", (_e, p: string) => shell.openPath(p));

  ipcMain.on("win:minimize", () => win.minimize());
  ipcMain.on("win:toggle-maximize", () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on("win:close", () => win.close());
}
