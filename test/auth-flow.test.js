const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough, Writable } = require("node:stream");

const TEST_PASSWORD = "test-pass-123";

function loadServer() {
  process.env.ACCESS_PASSWORD = TEST_PASSWORD;
  delete require.cache[require.resolve("../src/server")];
  return require("../src/server");
}

function createMockReq({ method = "GET", path = "/", headers = {}, body = "" } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = path;
  req.headers = headers;
  process.nextTick(() => {
    if (body) {
      req.write(body);
    }
    req.end();
  });
  return req;
}

function createMockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  res.statusCode = 200;
  res.headers = {};

  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.getHeader = (name) => res.headers[name.toLowerCase()];
  res.writeHead = (statusCode, headers = {}) => {
    res.statusCode = statusCode;
    Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
    return res;
  };
  res.end = (chunk) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    res.body = Buffer.concat(chunks).toString("utf8");
    res.finished = true;
    res.emit("finish");
    return res;
  };

  return res;
}

async function request(serverModule, options) {
  const req = createMockReq(options);
  const res = createMockRes();
  await serverModule.requestListener(req, res);
  return res;
}

test("unauthenticated users see the password gate at root", async () => {
  const serverModule = loadServer();
  serverModule.sessions.clear();
  const response = await request(serverModule, { path: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /접근 비밀번호/);
  assert.match(response.body, /form method="post" action="\/login"/);
});

test("protected routes redirect unauthenticated users to root", async () => {
  const serverModule = loadServer();
  serverModule.sessions.clear();
  const response = await request(serverModule, { path: "/app" });

  assert.equal(response.statusCode, 302);
  assert.equal(response.getHeader("location"), "/");
});

test("wrong password returns an error without authenticating the session", async () => {
  const serverModule = loadServer();
  serverModule.sessions.clear();
  const response = await request(serverModule, {
    method: "POST",
    path: "/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=wrong-pass",
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /비밀번호가 올바르지 않습니다/);
  assert.equal(response.getHeader("set-cookie"), undefined);
});

test("correct password sets a session cookie and unlocks protected pages", async () => {
  const serverModule = loadServer();
  serverModule.sessions.clear();
  const login = await request(serverModule, {
    method: "POST",
    path: "/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `password=${encodeURIComponent(TEST_PASSWORD)}`,
  });

  assert.equal(login.statusCode, 302);
  assert.equal(login.getHeader("location"), "/app");

  const cookie = login.getHeader("set-cookie");
  assert.ok(cookie);
  assert.match(cookie, /ideabank_session=/);

  const protectedPage = await request(serverModule, {
    path: "/notes",
    headers: { cookie: cookie.split(";")[0] },
  });

  assert.equal(protectedPage.statusCode, 200);
  assert.match(protectedPage.body, /인증된 사용자 전용 메모/);
});

test("logout clears the cookie and protects routes again", async () => {
  const serverModule = loadServer();
  serverModule.sessions.clear();
  const login = await request(serverModule, {
    method: "POST",
    path: "/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `password=${encodeURIComponent(TEST_PASSWORD)}`,
  });
  const cookie = login.getHeader("set-cookie").split(";")[0];

  const logout = await request(serverModule, {
    path: "/logout",
    headers: { cookie },
  });

  assert.equal(logout.statusCode, 302);
  assert.equal(logout.getHeader("location"), "/");
  assert.match(logout.getHeader("set-cookie"), /Max-Age=0/);

  const blocked = await request(serverModule, {
    path: "/app",
    headers: { cookie },
  });
  assert.equal(blocked.statusCode, 302);
  assert.equal(blocked.getHeader("location"), "/");
});
