// 백호장군 안이명: 윈도우용 껍데기 앱
// 인터넷이 되면 GitHub Pages 의 최신 버전을 띄우고(자동 업데이트), 안 되면 앱에 담긴 사본을 띄운다.
const { app, BrowserWindow, shell, globalShortcut, session, net } = require("electron");
const path = require("path");
const fs = require("fs");

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
  // 가벼운 업데이트 확인: HEAD 요청 하나로 index.html 의 ETag 를 보고, 바뀌었을 때만 캐시를 비운다.
  checkForUpdate().then((changed) => changed ? session.defaultSession.clearCache() : null)
    .finally(() => win.loadURL(LIVE_URL).catch(fallback));
}

async function checkForUpdate() {
  const tagFile = path.join(app.getPath("userData"), "etag.txt");
  try {
    const res = await net.fetch(LIVE_URL, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const tag = res.headers.get("etag") || res.headers.get("last-modified") || "";
    if (!tag) return false;
    let old = "";
    try { old = fs.readFileSync(tagFile, "utf8"); } catch (e) { /* 첫 실행 */ }
    if (tag !== old) { fs.writeFileSync(tagFile, tag); return old !== ""; }
  } catch (e) { /* 오프라인 등 */ }
  return false;
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
