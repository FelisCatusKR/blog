# blog.felis.kr

개인 블로그. [AstroPaper](https://github.com/satnaing/astro-paper)(MIT) 기반이다.

## 쓰기

- 글: `src/content/posts/<slug>/index.md`(이미지는 같은 폴더) 또는 `src/content/posts/<slug>.md`
- front matter: `title`, `description`, `pubDatetime`, `tags`. 수정일(`modDatetime`)은 적지 않으면 git 마지막 커밋 시각을 쓴다.

## 빌드

```bash
pnpm install
pnpm dev      # 로컬 미리보기
pnpm build    # dist/
```

수정일을 git에서 가져오므로 CI에서는 전체 이력이 필요하다(`actions/checkout`의 `fetch-depth: 0`).

## 테마에서 바꾼 것

- 한국어 UI(`src/i18n/lang/ko.ts`), 한국 시간대
- 수정일: front matter가 없으면 git 마지막 커밋 시각(`src/utils/getSortedPosts.ts`), 작성일과 같은 날이면 숨김
- 글꼴: 본문 Pretendard(동적 서브셋), 코드만 고정폭. 합자 끄기(숫자 사이 x가 ×로 바뀜), 한글 `word-break: keep-all`
- 글 폴더(`<slug>/index.md`)의 주소에 slug가 두 번 붙지 않게(`src/utils/getPostPaths.ts`)
