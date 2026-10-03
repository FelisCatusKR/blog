import type { UIStrings } from "../types";

export default {
  nav: {
    home: "홈",
    posts: "글",
    tags: "태그",
    about: "소개",
    archives: "보관함",
    search: "검색",
  },
  post: {
    publishedAt: "작성",
    updatedAt: "수정",
    sharePostIntro: "공유:",
    sharePostOn: "{{platform}}에 공유",
    sharePostViaEmail: "메일로 공유",
    tagLabel: "태그",
    backToTop: "맨 위로",
    goBack: "뒤로",
    editPage: "글 수정",
    previousPost: "이전 글",
    nextPost: "다음 글",
  },
  pagination: {
    prev: "이전",
    next: "다음",
    page: "페이지",
  },
  home: {
    socialLinks: "링크",
    featured: "추천 글",
    recentPosts: "최근 글",
    allPosts: "모든 글",
  },
  footer: {
    copyright: "Copyright",
    allRightsReserved: "All rights reserved.",
  },
  pages: {
    tagTitle: "태그",
    tagDesc: "이 태그가 달린 글",

    tagsTitle: "태그",
    tagsDesc: "글에 쓰인 모든 태그",

    postsTitle: "글",
    postsDesc: "지금까지 쓴 글",

    archivesTitle: "보관함",
    archivesDesc: "날짜별로 모은 글",

    searchTitle: "검색",
    searchDesc: "글 검색",
  },
  a11y: {
    skipToContent: "본문으로 건너뛰기",
    openMenu: "메뉴 열기",
    closeMenu: "메뉴 닫기",
    toggleTheme: "밝게/어둡게 바꾸기",
    searchPlaceholder: "검색어",
    noResults: "결과가 없습니다",
    goToPreviousPage: "이전 페이지",
    goToNextPage: "다음 페이지",
  },
  notFound: {
    title: "404",
    message: "페이지를 찾을 수 없습니다",
    goHome: "홈으로",
  },
} satisfies UIStrings;
