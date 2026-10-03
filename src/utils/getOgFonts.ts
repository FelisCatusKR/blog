import { readFile } from "node:fs/promises";
import path from "node:path";

// 미리보기(OG) 이미지는 satori로 빌드 때 그린다. 테마 기본 글꼴(Google Sans Code)에는 한글이 없어
// 제목이 네모로 깨졌다. 본문과 같은 Pretendard를 쓴다. satori는 woff2를 못 읽으므로 OTF를 넘긴다.
const FONT_DIR = path.join(
  process.cwd(),
  "node_modules/pretendard/dist/public/static"
);

type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let cached: Promise<OgFont[]> | undefined;

export function getOgFonts(): Promise<OgFont[]> {
  cached ??= Promise.all([
    readFile(path.join(FONT_DIR, "Pretendard-Regular.otf")),
    readFile(path.join(FONT_DIR, "Pretendard-Bold.otf")),
  ]).then(([regular, bold]) => [
    { name: "Pretendard", data: regular, weight: 400, style: "normal" },
    { name: "Pretendard", data: bold, weight: 700, style: "normal" },
  ]);
  return cached;
}
