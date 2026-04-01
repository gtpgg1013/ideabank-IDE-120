# IDE-120

비밀번호 게이트가 적용된 최소 Node 서비스입니다. 루트 경로(`/`)에서 접근 비밀번호를 입력해야 보호 페이지(`/app`, `/notes`)에 접근할 수 있습니다.

## Requirements

- Node.js 20+
- Docker / Docker Compose

## Run locally

```bash
PORT=3202 ACCESS_PASSWORD=ideabank2026 npm start
```

개발 중 자동 재시작이 필요하면:

```bash
PORT=3202 ACCESS_PASSWORD=ideabank2026 npm run dev
```

## Run with Docker

```bash
PORT=3202 ACCESS_PASSWORD=ideabank2026 docker compose up --build
```

브라우저에서 `http://localhost:3202`를 열면 비밀번호 입력 화면이 표시됩니다.

## Test

```bash
npm test
```

테스트 범위:

- 루트 경로 비밀번호 게이트 렌더링
- 미인증 사용자의 보호 라우트 접근 차단
- 잘못된 비밀번호 처리
- 올바른 비밀번호 입력 시 세션 쿠키 발급
- 로그아웃 후 재차단

## Environment variables

- `PORT`: 서버 포트, 기본값 `3202`
- `ACCESS_PASSWORD`: 접근 비밀번호, 기본값 `ideabank2026`
