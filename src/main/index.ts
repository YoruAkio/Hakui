import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { registerIpc } from "./ipc";

if (started) app.quit();

Menu.setApplicationMenu(null);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 600,
    minHeight: 450,
    backgroundColor: "#191a1f",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  registerIpc(win);
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
