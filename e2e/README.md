# End-to-end tests

Two suites, one stack.

| Suite | Lives in | Drives | Proves |
| --- | --- | --- | --- |
| API + WebSocket | `wkai-backend/tests/e2e/` | real HTTP and `ws` against a running backend | session lifecycle, token gates, socket fan-out |
| Browser | `wkai-student/e2e/` | Playwright against the student app | landing, join, room, error routes, theming |

The unit tests in `wkai-backend/tests/*.test.js` import modules directly and
need nothing running. These do the opposite: they exercise the wire.

## Requirements

- **Docker** with the compose plugin — the backend needs Postgres and Redis.
- **Chromium for Playwright**, once: `npm run test:e2e:install`.

## Running

From the repo root:

```bash
npm run test:e2e
```

That runs both suites in turn. Each one owns its stack: throwaway containers
come up, the schema is applied, a backend starts, tests run, everything is torn
down again.

Individually:

```bash
npm run test:e2e:api
```

```bash
npm run test:e2e:ui
```

Everything, unit tests included:

```bash
npm test
```

## Iterating on a test

Booting containers on every run gets old. Leave the stack up instead:

```bash
WKAI_E2E_KEEP_STACK=true npm run test:e2e:ui
```

Then re-run specs against it as often as you like. Take it down with
`npm run e2e:down`.

For the API suite, bring the databases up once and point the suite at them:

```bash
npm run e2e:up
```

```bash
node e2e/run-api.mjs --keep-databases
```

## Isolation

The suites never touch a developer's own stack. `docker-compose.e2e.yml` uses
its own project name, its own ports (Postgres 55432, Redis 56379), and tmpfs
rather than named volumes, so the test database cannot outlive the run. The
backend under test listens on 4100 and the student app on 3100, clear of the
dev ports 4000 and 3000.

## Notes

- The backend is given a placeholder `GROQ_API_KEY`. It has to be set to
  something: `src/ai/groqClient.js` builds its client at module load and throws
  without one, so the process will not boot. No test calls an AI route.
- Each suite gets a fresh backend process. The rate limiter keeps its counters
  in module memory, so a shared process would carry one suite's join attempts
  into the next and eventually answer 429 to a test that did nothing wrong.
- The browser suite runs with a single worker for the same reason — the join
  route allows 10 attempts a minute per IP.
- The instructor app is a Tauri desktop build, so the browser suite plays the
  instructor's part over the HTTP API it uses rather than driving its UI.
