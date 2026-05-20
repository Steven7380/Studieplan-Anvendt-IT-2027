const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8010);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

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

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendEmpty(response, 204);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/save-html") {
    await saveHtml(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  serveStatic(url.pathname, request, response);
});

server.listen(port, host, () => {
  console.log(`Editor server running at http://${host}:${port}/editor.html`);
});

async function saveHtml(request, response) {
  try {
    const body = await readBody(request, 1_000_000);
    const payload = JSON.parse(body);
    const targetPath = normalizeWebPath(payload.path);
    const html = String(payload.html || "");

    if (!allowedCourseFiles.has(targetPath)) {
      sendJson(response, 400, { error: "This path is not allowed for saving." });
      return;
    }

    if (!html.trim().toLowerCase().startsWith("<!doctype html>")) {
      sendJson(response, 400, { error: "The content must be a complete HTML document." });
      return;
    }

    const absoluteTarget = path.resolve(rootDir, targetPath);
    if (!absoluteTarget.startsWith(rootDir)) {
      sendJson(response, 400, { error: "Invalid path." });
      return;
    }

    await fs.promises.writeFile(absoluteTarget, html, "utf8");
    sendJson(response, 200, {
      ok: true,
      path: targetPath,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function serveStatic(urlPath, request, response) {
  const safePath = normalizeWebPath(urlPath === "/" ? "/index.html" : urlPath);
  const absolutePath = path.resolve(rootDir, safePath);

  if (!absolutePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.stat(absolutePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(absolutePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(absolutePath).pipe(response);
  });
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function normalizeWebPath(value) {
  return String(value || "")
    .replace(/^\/+/, "")
    .replaceAll("\\", "/");
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function sendEmpty(response, status) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff"
  });
  response.end();
}

function sendText(response, status, message) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(message);
}
