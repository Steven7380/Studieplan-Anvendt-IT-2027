const { app } = require("@azure/functions");

const allowedCourseFiles = new Set([
  "emnebeskrivelser/Informasjonssystemer/emnebeskrivelse.html",
  "emnebeskrivelser/Universell-utforming-og-HCI/emnebeskrivelse.html",
  "emnebeskrivelser/Programmering/emnebeskrivelse.html",
  "emnebeskrivelser/Praktisk-prosjekt/emnebeskrivelse.html",
  "emnebeskrivelser/Systemutvikling/emnebeskrivelse.html",
  "emnebeskrivelser/Databaser/emnebeskrivelse.html",
  "emnebeskrivelser/Informasjonssikkerhet/emnebeskrivelse.html",
  "emnebeskrivelser/XR-AR/emnebeskrivelse.html",
  "emnebeskrivelser/Objektorientert-programmering/emnebeskrivelse.html",
  "emnebeskrivelser/Strategisk-bruk-av-IT/emnebeskrivelse.html",
  "emnebeskrivelser/Programvaretesting/emnebeskrivelse.html",
  "emnebeskrivelser/Operativsystemer-og-nettverk/emnebeskrivelse.html",
  "emnebeskrivelser/Applikasjonsutvikling/emnebeskrivelse.html",
  "emnebeskrivelser/Internet-of-Things/emnebeskrivelse.html",
  "emnebeskrivelser/Algoritmer-og-datastrukturer/emnebeskrivelse.html",
  "emnebeskrivelser/Bacheloroppgave/emnebeskrivelse.html",
  "emnebeskrivelser/Kunstig-intelligens-og-maskinlaering/emnebeskrivelse.html",
  "emnebeskrivelser/Programvaresikkerhet/emnebeskrivelse.html",
  "emnebeskrivelser/Datavitenskap-og-visualisering/emnebeskrivelse.html",
  "emnebeskrivelser/Applikasjonsutvikling-med-KI/emnebeskrivelse.html"
]);

app.http("save-html", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "save-html",
  handler: async (request, context) => {
    try {
      const payload = await request.json();
      const targetPath = normalizeWebPath(payload.path);
      const html = String(payload.html || "");

      validateRequest(targetPath, html);

      const owner = requiredEnv("GITHUB_OWNER");
      const repo = requiredEnv("GITHUB_REPO");
      const branch = process.env.GITHUB_BRANCH || "main";
      const token = requiredEnv("GITHUB_TOKEN");

      const currentFile = await getGitHubFile({ owner, repo, branch, targetPath, token });
      const update = await updateGitHubFile({
        owner,
        repo,
        branch,
        targetPath,
        token,
        sha: currentFile.sha,
        html
      });

      return json(200, {
        ok: true,
        path: targetPath,
        commit: update.commit?.sha || null
      });
    } catch (error) {
      context.error(error);
      return json(error.status || 500, { error: error.message });
    }
  }
});

function validateRequest(targetPath, html) {
  if (!allowedCourseFiles.has(targetPath)) {
    throw httpError(400, "This path is not allowed for saving.");
  }

  if (!html.trim().toLowerCase().startsWith("<!doctype html>")) {
    throw httpError(400, "The content must be a complete HTML document.");
  }
}

async function getGitHubFile({ owner, repo, branch, targetPath, token }) {
  const url = githubContentsUrl(owner, repo, targetPath, branch);
  const response = await fetch(url, {
    headers: githubHeaders(token)
  });

  if (!response.ok) {
    throw httpError(response.status, `Could not read ${targetPath} from GitHub.`);
  }

  return response.json();
}

async function updateGitHubFile({ owner, repo, branch, targetPath, token, sha, html }) {
  const url = githubContentsUrl(owner, repo, targetPath, branch);
  const response = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify({
      message: `Update ${targetPath} from editor`,
      content: Buffer.from(html, "utf8").toString("base64"),
      sha,
      branch
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(response.status, result.message || `Could not update ${targetPath}.`);
  }

  return result;
}

function githubContentsUrl(owner, repo, targetPath, branch) {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(
    targetPath
  )}?ref=${encodeURIComponent(branch)}`;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "studieplan-editor",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function normalizeWebPath(value) {
  return String(value || "")
    .replace(/^\/+/, "")
    .replaceAll("\\", "/");
}

function encodeURIComponentPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw httpError(500, `Missing Azure environment variable: ${name}`);
  }
  return value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(status, body) {
  return {
    status,
    jsonBody: body
  };
}
