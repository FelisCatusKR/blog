import type { CollectionEntry } from "astro:content";
import { execSync } from "node:child_process";
import { postFilter } from "./postFilter";

// front matter에 modDatetime이 없으면 글 파일의 git 마지막 커밋 시각을 쓴다(작성 시각 뒤일 때만).
// CI에서는 전체 이력이 필요하다(actions/checkout의 fetch-depth: 0).
const gitCache = new Map<string, Date | undefined>();
function gitLastModified(filePath?: string): Date | undefined {
  if (!filePath) return undefined;
  if (!gitCache.has(filePath)) {
    let d: Date | undefined;
    try {
      const out = execSync(`git log -1 --pretty=format:%cI -- "${filePath}"`)
        .toString()
        .trim();
      d = out ? new Date(out) : undefined;
    } catch {
      d = undefined;
    }
    gitCache.set(filePath, d);
  }
  return gitCache.get(filePath);
}
function withGitModDatetime(post: CollectionEntry<"posts">) {
  if (!post.data.modDatetime) {
    const git = gitLastModified(post.filePath);
    if (git && git > post.data.pubDatetime) post.data.modDatetime = git;
  }
  return post;
}

/**
 * Returns posts that are eligible to be shown to users, sorted by “last updated”
 * descending (uses `modDatetime` when present, otherwise `pubDatetime`).
 *
 * Note: filtering respects drafts and scheduled posts via `postFilter()`.
 */
export function getSortedPosts(posts: CollectionEntry<"posts">[]) {
  return posts
    .filter(postFilter)
    .map(withGitModDatetime)
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
}
