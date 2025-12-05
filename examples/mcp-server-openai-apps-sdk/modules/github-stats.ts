import {
  ZuploContext,
  ZuploRequest,
  ZuploMcpSdk,
  environment,
} from "@zuplo/runtime";

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
  avatar_url: string;
  html_url: string;
  created_at: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  html_url: string;
  updated_at: string;
}

interface LanguageStats {
  [language: string]: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  // Get username from request body or environment variable
  let username: string | undefined;

  try {
    const body = await request.json();
    username = body?.username;
  } catch {
    // No body or invalid JSON
  }

  // Fallback to environment variable
  if (!username) {
    username = environment.GITHUB_USERNAME;
  }

  if (!username) {
    return {
      error:
        "No GitHub username provided. Please specify a username like 'octocat' or 'torvalds'.",
    };
  }

  // Prepare headers for GitHub API
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Zuplo-MCP-GitHub-Stats",
  };

  // Add auth token if available (increases rate limit from 60 to 5000 requests/hour)
  if (environment.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${environment.GITHUB_TOKEN}`;
  }

  try {
    // Fetch user profile and repos in parallel
    const [userResponse, reposResponse] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(
        `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
        { headers }
      ),
    ]);

    if (!userResponse.ok) {
      if (userResponse.status === 404) {
        return { error: `GitHub user '${username}' not found` };
      }
      return { error: `GitHub API error: ${userResponse.status}` };
    }

    if (!reposResponse.ok) {
      return { error: `GitHub API error fetching repos: ${reposResponse.status}` };
    }

    const user: GitHubUser = await userResponse.json();
    const reposData = await reposResponse.json();

    // Ensure repos is an array (GitHub might return an error object)
    const repos: GitHubRepo[] = Array.isArray(reposData) ? reposData : [];

    // Calculate language statistics across all repos
    const languages: LanguageStats = {};
    for (const repo of repos) {
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
      }
    }

    // Sort languages by count
    const sortedLanguages = Object.entries(languages)
      .sort(([, a], [, b]) => b - a)
      .reduce(
        (acc, [lang, count]) => {
          acc[lang] = count;
          return acc;
        },
        {} as LanguageStats
      );

    // Get top 10 repos by stars
    const topRepos = repos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 10)
      .map((repo) => ({
        name: repo.name,
        description: repo.description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        url: repo.html_url,
        updatedAt: repo.updated_at,
      }));

    // Calculate total stars and forks
    const totalStars = repos.reduce(
      (sum, repo) => sum + repo.stargazers_count,
      0
    );
    const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);

    // Prepare the response data
    const statsData = {
      user: {
        login: user.login,
        name: user.name,
        bio: user.bio,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url,
        publicRepos: user.public_repos,
        followers: user.followers,
        following: user.following,
        memberSince: user.created_at,
      },
      stats: {
        totalStars,
        totalForks,
        totalRepos: repos.length,
      },
      topRepos,
      languages: sortedLanguages,
    };

    // Use ZuploMcpSdk to set the widget output template and data for OpenAI Apps SDK
    const mcpSdk = new ZuploMcpSdk(context);
    mcpSdk.setRawCallToolResult({
      content: [
        {
          type: "text",
          text: `GitHub stats for ${user.login}: ${totalStars} stars, ${repos.length} repos`,
        },
      ],
      // structuredContent becomes window.openai.toolOutput in the widget
      structuredContent: statsData,
      _meta: {
        "openai/outputTemplate": "resource://widget/github-stats",
        "openai/widgetAccessible": true,
        "openai/widgetPrefersBorder": true,
      },
    });

    // Return the data for non-widget consumers
    return statsData;
  } catch (error) {
    context.log.error("Error fetching GitHub stats", { error });
    return {
      error: "Failed to fetch GitHub statistics",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
