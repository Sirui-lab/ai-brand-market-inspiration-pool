import { fetchRecentPosts } from "../src/lib/collect/recent-post-fetcher";

const sourceId = process.argv[2] ?? "company/openai";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await fetchRecentPosts("linkedin", sourceId);

  console.log(
    JSON.stringify(
      {
        status: result.status,
        platformSlug: result.platformSlug,
        sourceId: result.sourceId,
        since: result.since,
        posts: result.posts.length,
        message: result.message,
        sample: result.posts.slice(0, 3).map((post) => ({
          id: post.id,
          title: post.title,
          url: post.url,
          publishedAt: post.publishedAt,
          author: post.author
        }))
      },
      null,
      2
    )
  );

  if (result.status === "failed") {
    throw new Error(result.message ?? "LinkedIn recent-post capture failed");
  }

  if (result.status === "fetched") {
    console.log(`LinkedIn recent smoke completed: fetched ${result.posts.length} post(s).`);
  } else {
    console.log("LinkedIn recent smoke completed: capture needs project account or runner fallback.");
  }
}
