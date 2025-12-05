import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Widget HTML template that wraps the JavaScript
const GITHUB_STATS_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitHub Stats Widget</title>
</head>
<body>
  <script>
// GitHub Stats Widget for OpenAI Apps SDK
// This component renders inside ChatGPT via iframe

(function () {
  // Color palette for languages (GitHub-inspired colors)
  const languageColors = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    Go: "#00ADD8",
    Rust: "#dea584",
    Ruby: "#701516",
    PHP: "#4F5D95",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Scala: "#c22d40",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Dart: "#00B4AB",
    Elixir: "#6e4a7e",
    Haskell: "#5e5086",
    Lua: "#000080",
    R: "#198CE7",
    Julia: "#a270ba",
    Perl: "#0298c3",
    Clojure: "#db5855",
    Erlang: "#B83998",
    default: "#8b8b8b",
  };

  function getLanguageColor(language) {
    return languageColors[language] || languageColors.default;
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function createWidget(data) {
    const isDark =
      window.openai?.theme === "dark" ||
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;

    const styles = {
      bg: isDark ? "#1a1a1a" : "#ffffff",
      cardBg: isDark ? "#252525" : "#f6f8fa",
      text: isDark ? "#e6e6e6" : "#24292f",
      textMuted: isDark ? "#8b949e" : "#57606a",
      border: isDark ? "#30363d" : "#d0d7de",
      accent: "#2f81f7",
    };

    const container = document.createElement("div");
    container.innerHTML = \`
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
          background: \${styles.bg};
          color: \${styles.text};
          padding: 16px;
          line-height: 1.5;
        }
        .github-stats-widget {
          max-width: 800px;
          margin: 0 auto;
        }
        .profile-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid \${styles.border};
        }
        .avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px solid \${styles.border};
        }
        .profile-info h1 {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .profile-info h1 a {
          color: \${styles.text};
          text-decoration: none;
        }
        .profile-info h1 a:hover {
          color: \${styles.accent};
          text-decoration: underline;
        }
        .profile-info .username {
          color: \${styles.textMuted};
          font-size: 16px;
        }
        .profile-info .bio {
          margin-top: 8px;
          color: \${styles.textMuted};
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: \${styles.cardBg};
          border: 1px solid \${styles.border};
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }
        .stat-card .number {
          font-size: 24px;
          font-weight: 600;
          color: \${styles.accent};
        }
        .stat-card .label {
          font-size: 12px;
          color: \${styles.textMuted};
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .languages-chart {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .language-bar-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .language-name {
          width: 100px;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .language-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .language-bar-wrapper {
          flex: 1;
          height: 20px;
          background: \${styles.cardBg};
          border-radius: 4px;
          overflow: hidden;
        }
        .language-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease-out;
        }
        .language-count {
          width: 50px;
          text-align: right;
          font-size: 14px;
          color: \${styles.textMuted};
        }
        .repos-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .repo-card {
          background: \${styles.cardBg};
          border: 1px solid \${styles.border};
          border-radius: 8px;
          padding: 16px;
        }
        .repo-card:hover {
          border-color: \${styles.accent};
        }
        .repo-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .repo-name {
          font-size: 16px;
          font-weight: 600;
        }
        .repo-name a {
          color: \${styles.accent};
          text-decoration: none;
        }
        .repo-name a:hover {
          text-decoration: underline;
        }
        .repo-stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: \${styles.textMuted};
        }
        .repo-stat {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .repo-description {
          font-size: 14px;
          color: \${styles.textMuted};
          margin-bottom: 8px;
        }
        .repo-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 12px;
          color: \${styles.textMuted};
        }
        .repo-language {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .member-since {
          font-size: 12px;
          color: \${styles.textMuted};
          margin-top: 4px;
        }
        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .profile-header {
            flex-direction: column;
            text-align: center;
          }
        }
      </style>
      <div class="github-stats-widget">
        <div class="profile-header">
          <img class="avatar" src="\${data.user.avatarUrl}" alt="\${data.user.login}" />
          <div class="profile-info">
            <h1><a href="\${data.user.profileUrl}" target="_blank">\${data.user.name || data.user.login}</a></h1>
            <div class="username">@\${data.user.login}</div>
            \${data.user.bio ? \`<div class="bio">\${data.user.bio}</div>\` : ""}
            <div class="member-since">Member since \${formatDate(data.user.memberSince)}</div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="number">\${formatNumber(data.stats.totalRepos)}</div>
            <div class="label">Repositories</div>
          </div>
          <div class="stat-card">
            <div class="number">\${formatNumber(data.stats.totalStars)}</div>
            <div class="label">Total Stars</div>
          </div>
          <div class="stat-card">
            <div class="number">\${formatNumber(data.user.followers)}</div>
            <div class="label">Followers</div>
          </div>
          <div class="stat-card">
            <div class="number">\${formatNumber(data.stats.totalForks)}</div>
            <div class="label">Total Forks</div>
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>
            </svg>
            Languages
          </h2>
          <div class="languages-chart" id="languages-chart"></div>
        </div>

        <div class="section">
          <h2 class="section-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
            </svg>
            Top Repositories
          </h2>
          <div class="repos-list" id="repos-list"></div>
        </div>
      </div>
    \`;

    document.body.appendChild(container);

    // Render languages chart
    const languagesChart = document.getElementById("languages-chart");
    const languages = Object.entries(data.languages).slice(0, 8);
    const maxCount = Math.max(...languages.map(([, count]) => count));

    languages.forEach(([language, count]) => {
      const percentage = (count / maxCount) * 100;
      const color = getLanguageColor(language);

      const row = document.createElement("div");
      row.className = "language-bar-container";
      row.innerHTML = \`
        <div class="language-name">
          <span class="language-dot" style="background: \${color}"></span>
          <span>\${language}</span>
        </div>
        <div class="language-bar-wrapper">
          <div class="language-bar" style="width: \${percentage}%; background: \${color}"></div>
        </div>
        <div class="language-count">\${count} repos</div>
      \`;
      languagesChart.appendChild(row);
    });

    // Render top repos
    const reposList = document.getElementById("repos-list");
    data.topRepos.slice(0, 5).forEach((repo) => {
      const card = document.createElement("div");
      card.className = "repo-card";
      card.innerHTML = \`
        <div class="repo-header">
          <div class="repo-name">
            <a href="\${repo.url}" target="_blank">\${repo.name}</a>
          </div>
          <div class="repo-stats">
            <span class="repo-stat">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
              </svg>
              \${formatNumber(repo.stars)}
            </span>
            <span class="repo-stat">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>
              </svg>
              \${formatNumber(repo.forks)}
            </span>
          </div>
        </div>
        \${repo.description ? \`<div class="repo-description">\${repo.description}</div>\` : ""}
        <div class="repo-meta">
          \${
            repo.language
              ? \`
            <span class="repo-language">
              <span class="language-dot" style="background: \${getLanguageColor(repo.language)}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
              \${repo.language}
            </span>
          \`
              : ""
          }
          <span>Updated \${formatDate(repo.updatedAt)}</span>
        </div>
      \`;
      reposList.appendChild(card);
    });
  }

  // Parse toolOutput data
  function parseToolOutput(rawOutput) {
    if (!rawOutput) return null;

    // Data may come as {text: "JSON string"} or as direct object
    if (typeof rawOutput.text === 'string') {
      try {
        return JSON.parse(rawOutput.text);
      } catch (e) {
        console.error("Failed to parse toolOutput.text:", e);
        return null;
      }
    }
    return rawOutput;
  }

  // Render the widget with data
  function renderWithData() {
    const rawOutput = window.openai?.toolOutput;
    const data = parseToolOutput(rawOutput);

    if (data && data.user) {
      // Clear the body and render the widget
      document.body.innerHTML = '';
      createWidget(data);
    }
  }

  // Initialize widget
  function init() {
    // Try to render immediately if data is available
    const rawOutput = window.openai?.toolOutput;
    const data = parseToolOutput(rawOutput);

    if (data && data.user) {
      createWidget(data);
    } else {
      // Show loading state
      document.body.innerHTML = \`
        <div style="padding: 20px; font-family: sans-serif; color: #666; text-align: center;">
          <p>Loading GitHub statistics...</p>
        </div>
      \`;
    }

    // Listen for data updates from the host
    window.addEventListener("openai:set_globals", () => {
      renderWithData();
    });
  }

  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
  </script>
</body>
</html>`;

export default async function (request: ZuploRequest, context: ZuploContext) {
  // Return the widget HTML with the correct MIME type for OpenAI Apps SDK
  return new Response(GITHUB_STATS_WIDGET_HTML, {
    headers: {
      "Content-Type": "text/html+skybridge",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
