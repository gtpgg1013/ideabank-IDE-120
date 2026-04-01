const crypto = require("node:crypto");
const http = require("node:http");
const { URL } = require("node:url");

const DEFAULT_PORT = 3202;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "ideabank2026";
const PORT = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
const SESSION_COOKIE = "ideabank_session";
const sessions = new Map();

function html(title, content) {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f3ea;
        --panel: rgba(255, 255, 255, 0.88);
        --line: #d7c8af;
        --ink: #1f2937;
        --accent: #9a3412;
        --accent-soft: #fed7aa;
        --danger: #b91c1c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        background:
          radial-gradient(circle at top, rgba(154, 52, 18, 0.12), transparent 30%),
          linear-gradient(135deg, #f5efe2 0%, #efe7d6 55%, #f9f5ee 100%);
        color: var(--ink);
        min-height: 100vh;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(100%, 460px);
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(14px);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
        padding: 32px;
      }
      .eyebrow {
        margin: 0 0 12px;
        font-size: 12px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: #7c2d12;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 6vw, 44px);
        line-height: 0.98;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.55;
      }
      form {
        display: grid;
        gap: 14px;
        margin-top: 24px;
      }
      label {
        font-size: 14px;
        font-weight: 600;
      }
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px 16px;
        font: inherit;
        background: rgba(255, 255, 255, 0.92);
      }
      button, .link {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        border: 0;
        border-radius: 999px;
        padding: 13px 18px;
        background: var(--accent);
        color: white;
        font: inherit;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }
      .hint {
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--accent-soft);
        font-size: 14px;
      }
      .error {
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(185, 28, 28, 0.1);
        color: var(--danger);
        font-size: 14px;
      }
      .stack {
        display: grid;
        gap: 12px;
      }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 20px;
      }
      @media (max-width: 600px) {
        .card { padding: 24px; border-radius: 20px; }
      }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [key, ...rest] = part.split("=");
      acc[key] = decodeURIComponent(rest.join("="));
      return acc;
    }, {});
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseForm(body) {
  return new URLSearchParams(body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
}

function createSession() {
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, { createdAt: Date.now() });
  return sessionId;
}

function getAuthenticatedSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }
  return sessions.has(sessionId) ? sessionId : null;
}

function setSessionCookie(res, sessionId) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function renderGate({ error } = {}) {
  return html(
    "IdeaBank Access",
    `<section class="card">
      <p class="eyebrow">IdeaBank Access</p>
      <h1>보호된 공간에 입장하세요</h1>
      <p>서비스 내용을 보려면 접근 비밀번호가 필요합니다. 인증되면 같은 세션 동안 다시 묻지 않습니다.</p>
      <div class="hint">기본 비밀번호는 <strong>ACCESS_PASSWORD</strong> 환경 변수로 제어됩니다.</div>
      <form method="post" action="/login">
        <div class="stack">
          <label for="password">접근 비밀번호</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        ${error ? `<div class="error">${error}</div>` : ""}
        <button type="submit">입장하기</button>
      </form>
    </section>`
  );
}

function renderApp() {
  return html(
    "IdeaBank Workspace",
    `<section class="card">
      <p class="eyebrow">Authenticated</p>
      <h1>인증이 완료되었습니다</h1>
      <p>이 페이지는 유효한 세션 쿠키가 있을 때만 접근할 수 있습니다. 다른 보호 경로도 같은 방식으로 확장할 수 있습니다.</p>
      <div class="actions">
        <a class="link" href="/notes">보호 메모 보기</a>
        <a class="link" href="/logout">로그아웃</a>
      </div>
    </section>`
  );
}

function renderNotes() {
  return html(
    "Protected Notes",
    `<section class="card">
      <p class="eyebrow">Protected Route</p>
      <h1>인증된 사용자 전용 메모</h1>
      <p>핵심 플로우 검증 포인트:</p>
      <div class="hint">1. 루트는 비밀번호 게이트를 제공함 2. 인증 전 모든 보호 경로는 루트로 이동함 3. 인증 후 세션이 유지됨</div>
      <div class="actions">
        <a class="link" href="/app">대시보드</a>
        <a class="link" href="/logout">로그아웃</a>
      </div>
    </section>`
  );
}

async function requestListener(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const isAuthenticated = Boolean(getAuthenticatedSession(req));

  if (req.method === "GET" && pathname === "/") {
    if (isAuthenticated) {
      return redirect(res, "/app");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderGate());
    return;
  }

  if (req.method === "POST" && pathname === "/login") {
    try {
      const body = await readBody(req);
      const form = parseForm(body);
      const submittedPassword = form.get("password") || "";

      if (!safeEqual(submittedPassword, ACCESS_PASSWORD)) {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderGate({ error: "비밀번호가 올바르지 않습니다." }));
        return;
      }

      const sessionId = createSession();
      setSessionCookie(res, sessionId);
      redirect(res, "/app");
    } catch (error) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
    }
    return;
  }

  if (req.method === "GET" && pathname === "/logout") {
    const sessionId = getAuthenticatedSession(req);
    if (sessionId) {
      sessions.delete(sessionId);
    }
    clearSessionCookie(res);
    redirect(res, "/");
    return;
  }

  if (!isAuthenticated) {
    return redirect(res, "/");
  }

  if (req.method === "GET" && pathname === "/app") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderApp());
    return;
  }

  if (req.method === "GET" && pathname === "/notes") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderNotes());
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

const server = http.createServer((req, res) => {
  requestListener(req, res).catch((error) => {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
    console.error(error);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = {
  ACCESS_PASSWORD,
  DEFAULT_PORT,
  PORT,
  SESSION_COOKIE,
  requestListener,
  server,
  sessions,
};
