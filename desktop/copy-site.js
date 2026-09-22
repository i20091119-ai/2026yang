// 저장소의 웹 게임 파일을 desktop/www 로 복사한다 (오프라인 대체용).
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const out = path.join(__dirname, "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ["index.html", "css", "js", "assets"]) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log("copied site into", out);
