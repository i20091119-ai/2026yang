# 도구

## capture-howto.js

게임 방법 슬라이드에 쓰는 예시 장면 8장을 게임을 실제로 돌려서 찍는 Playwright 스크립트입니다.
배경 그림이나 규칙을 바꾼 뒤 다시 찍을 때 씁니다.

```bash
python3 -m http.server 8080 &            # 저장소 루트에서
npm i -g playwright && npx playwright install chromium
OUT=/tmp/howto NODE_PATH=$(npm root -g) node tools/capture-howto.js
# /tmp/howto/step-1.png ~ step-8.png 가 생기면 폭 540px JPG 로 줄여 assets/howto/ 에 넣습니다.
```
