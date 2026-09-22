// 백호장군 안이명: 윈도우용 껍데기 앱
// 인터넷이 되면 GitHub Pages 의 최신 버전을 띄우고(자동 업데이트), 안 되면 앱에 담긴 사본을 띄운다.
const { app, BrowserWindow, shell, globalShortcut, session } = require("electron");
const path = require("path");

const LIVE_URL = "https://i20091119-ai.github.io/2026yang/";
const LOCAL_INDEX = path.join(__dirname, "www", "index.html");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 480, minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#120e12",
    title: "백호장군 안이명: 숫자 베기",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  // 외부 링크(로고 등)는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  let fellBack = false;
  const fallback = () => { if (!fellBack) { fellBack = true; win.loadFile(LOCAL_INDEX); } };
  win.webContents.on("did-fail-load", (_e, _code, _desc, _url, isMainFrame) => { if (isMainFrame) fallback(); });
  // 캐시를 비우고 서버에서 새로 받는다 (푸시한 내용이 바로 반영되도록)
  session.defaultSession.clearCache().finally(() => win.loadURL(LIVE_URL).catch(fallback));
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("F11", () => {
    const w = BrowserWindow.getFocusedWindow();
    if (w) w.setFullScreen(!w.isFullScreen());
  });
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => app.quit());
