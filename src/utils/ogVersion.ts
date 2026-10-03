import { createHash } from "node:crypto";

// 디스코드 등은 미리보기 이미지를 이미지 주소 기준으로 캐시한다(페이지 주소에 쿼리를 붙여도 이미지 주소가 같으면 예전 이미지).
// 이미지를 그리는 재료로 만든 해시를 주소 뒤에 ?v=로 붙여, 내용이 바뀔 때만 주소가 바뀌게 한다.
// OG 이미지의 디자인·글꼴(src/pages/og.png.ts, posts/[...slug]/index.png.ts, getOgFonts.ts)을 바꾸면 이 값을 올린다.
export const OG_DESIGN_VERSION = 2;

export function ogVersion(...parts: (string | undefined)[]): string {
  return createHash("sha1")
    .update([OG_DESIGN_VERSION, ...parts].join("\u0000"))
    .digest("hex")
    .slice(0, 8);
}
