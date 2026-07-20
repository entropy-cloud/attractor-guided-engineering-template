# Playwright E2E Test Diagnostic Guide

Technology choice: **Playwright** is the fixed e2e testing framework. Do not introduce alternatives.

## Why E2E Diagnostics Are Expensive

Historical analysis of AI-assisted e2e sessions shows three dominant time sinks:

| Pattern                                                                        | Root Cause                           |
| ------------------------------------------------------------------------------ | ------------------------------------ |
| **Blind retries** — re-running the same failing test without investigating why | Agent treats re-run as investigation |
| **Timeout loops** — 45s timeout → re-run → timeout again                       | Async rendering race, not inspected  |
| **Full suite for partial changes** — running all tests after one widget fix    | No targeted verification strategy    |

**Key principle**: _Inspect before retrying._ One 2-minute diagnostic script saves 30 minutes of blind re-runs.

---

## Diagnostic Decision Tree

When a test fails, follow this sequence:

```
1. Is the dev server alive?
   ├── NO → Start it. Check port conflicts. Re-run once.
   └── YES → continue

2. Is the target element in the DOM at all?
   ├── NO → Component not rendering
   │   ├── Check browser console for errors
   │   ├── Check component registration / import
   │   └── Check routing: does the URL resolve to the expected page?
   └── YES → Element exists but wrong state
       ├── Check getComputedStyle for display:none / visibility:hidden
       ├── Check if async data has loaded (network tab / waitForResponse)
       └── Check if CSS classes are generated (Tailwind / build pipeline)

3. Is the failure consistent or flaky?
   ├── Consistent → code or test bug. Fix and re-run once.
   └── Flaky (passes on retry without code change)
       ├── Check for race conditions (replace waitForTimeout with waitForSelector / waitForResponse)
       ├── Check for test state leakage (global state between tests)
       └── Check for dev server stale cache (restart server)
```

---

## Inline Diagnostic Script Template

Do **not** create temporary `.spec.ts` files for diagnostics. Use inline scripts:

```bash
pnpm exec node -e "const { chromium } = require('@playwright/test'); (async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://127.0.0.1:<PORT>/<PATH>', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  console.log(JSON.stringify({ errors, text: text?.substring(0, 500) }, null, 2));
  await browser.close();
})();"
```

Customize `<PORT>` and `<PATH>` for your project. Add project-specific runtime inspection (debugger API, state dumps) as needed.

---

## Layered Verification Strategy

**Never run the full suite to verify a single fix.** Follow this escalation:

```
Level 0: Single failing line
  playwright test "path/to/test.spec.ts:LINE" --workers=1

Level 1: Single spec file
  playwright test "path/to/test.spec.ts" --workers=1

Level 2: Related spec files
  playwright test tests/e2e/<feature-area>/*.spec.ts --workers=1

Level 3: Full suite (only before commit / PR)
  playwright test
```

| Change scope                                 | Verification level |
| -------------------------------------------- | ------------------ |
| Single component / page                      | Level 0 → Level 1  |
| Shared infrastructure (routing, state, auth) | Level 1 → Level 2  |
| CSS / build pipeline / config                | Level 1 → Level 2  |
| Before commit or PR                          | Level 3            |

---

## Log-First Debugging

When an E2E test fails with timeout, blank page, or slow rendering, always check the server log first. These symptoms are almost always caused by server-side errors, not browser issues. Do not adjust timeout parameters or retry strategies before identifying the specific error code or exception stack.

Diagnostic protocol:

- **Fresh instance**: start a new server instance with an isolated data source for each diagnostic session. Do not reuse a shared or stale server.
- **Health polling**: loop until HTTP 200 before running tests — do not rely on a fixed wait time.
- **Minimum reproduction**: reproduce the failure with a single test case or pass/fail pair first, not the full suite.
- **Reverse log reading**: read the server log from the tail backward. Look for `ERROR`, `exception`, or error codes near the end of the log first — not from the beginning.

---

## Common Failure Patterns

### Timeout / Element Not Visible

**Symptoms**: `toBeVisible()` failed, `Test timeout of Xms exceeded`

**Root causes (ordered by likelihood)**:

| Cause                       | How to Identify                                                       | Fix                                                                                          |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Async data not loaded**   | Check network tab; element exists but content is placeholder          | `await page.waitForResponse(...)` or `await expect(locator).toBeVisible({ timeout: 10000 })` |
| **Race condition**          | Test passes on retry without code change                              | Replace `waitForTimeout(N)` with explicit wait on the async condition                        |
| **CSS class not generated** | Element in DOM, class applied, but `getComputedStyle` shows no effect | Check build pipeline (Tailwind `@source`, PostCSS config, etc.)                              |
| **Component not rendered**  | Target element not in DOM at all                                      | Check console errors; verify component registration / routing                                |

### Port Conflicts

**Symptoms**: `Error: Port XXXX is already in use`

**Cause**: Previous dev server still running.

**Fix**: Kill stale server processes before starting tests. Do **not** increment port numbers to evade conflicts — this leaves orphaned processes.

**Avoid repeated rediscovery**: The first time you encounter a port mismatch between your framework default and your application config, record the fix in a shared reference doc. Do not rediscover the same port conflict across multiple plans.

```bash
# Linux / macOS
lsof -ti :4173 | xargs kill -9 2>/dev/null

# Windows
for /f "tokens=5" %a in ('netstat -aon ^| findstr ":4173"') do taskkill /F /PID %a 2>nul
```

Set `reuseExistingServer: !process.env.CI` in `playwright.config.ts` so local runs reuse an already-running server.

### Flaky / Intermittent Failures

**Symptoms**: Same test sometimes passes, sometimes fails. Port change "fixes" it.

| Cause                        | Evidence                                | Fix                                                                  |
| ---------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| **Stale dev server / cache** | Restarting server fixes it              | Kill and restart; clear build cache if applicable                    |
| **Race condition**           | First run fails, immediate retry passes | Add explicit `waitFor` for the async dependency                      |
| **Test ordering dependency** | Passes alone, fails in full suite       | Run with `--workers=1`; check global state in `beforeAll`/`afterAll` |

### Test State Leakage

**Symptoms**: Passes with `--workers=1` but fails with parallel workers. Or passes in isolation but fails in full suite.

**Fix**: Ensure each test navigates to a clean page. Do not rely on global state set in `beforeAll` that later tests depend on. Each test should be independently runnable.

---

## Anti-Patterns

1. **Blind retry loop**: Re-running the same failing test >2 times without any investigation. Each retry costs server startup time + test execution time. Total waste across a session can exceed hours.

2. **Port escalation**: Incrementing the port number to avoid conflicts, leaving N orphaned dev server processes. Kill stale servers instead.

3. **Full suite for partial changes**: Running `playwright test` (all specs) after changing one component. Run only the affected spec first.

4. **Screenshot-based debugging**: Examining Playwright failure screenshots to guess the cause. Use `page.evaluate()`, `page.locator().innerHTML()`, and `getComputedStyle` for programmatic inspection.

5. **Creating temporary diagnostic specs**: Writing `tmp-*.spec.ts` or `diag-*.spec.ts` files that are never cleaned up. Use inline `node -e` scripts for one-off diagnostics.

---

## Playwright Config Baseline

Recommended `playwright.config.ts` structure:

```typescript
import { defineConfig, devices } from '@playwright/test';

const port = parseInt(process.env.PLAYWRIGHT_PORT || '4173', 10);
const baseUrl = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Key decisions:

- `retries: 0` — flaky tests should be fixed, not hidden by retries
- `trace: 'retain-on-failure'` — only capture traces on failure to keep CI fast
- `PLAYWRIGHT_PORT` env var — allows switching ports when debugging
- `reuseExistingServer: !process.env.CI` — reuse local server, fresh in CI

---

## Isolating The E2E Runtime

When E2E tests run alongside a development instance, the two can clash over the same data source or file locks. Prefer to isolate the E2E runtime:

- point E2E at an isolated data source (in-memory or throwaway database, or a separate schema)
- use a dedicated port and profile for the E2E instance
- let `webServer` start this isolated instance and wait for the port to be ready before running tests

This avoids file/resource lock conflicts with whatever is already running in the development environment.

### Running Against An Already-Running Server

If the application is already running manually (for example, during interactive debugging), skip the auto-started `webServer`:

```bash
SKIP_WEBSERVER=1 BASE_URL=http://127.0.0.1:<port> npx playwright test
```

Implement this by gating `webServer` on the env var in `playwright.config.ts` (for example, define `webServer` only when `!process.env.SKIP_WEBSERVER`).

### No Output For A Long Time After Launch

If Playwright shows no output for a long time, the most common cause is that the application failed to start while Playwright is waiting for the port readiness check (up to `webServer.timeout`). Troubleshoot:

1. Check whether another instance already holds the data source or file lock.
2. Run the application start command manually with the E2E overrides and read the error.
3. Confirm the runnable artifact is already built.

---

## Recommended Diagnostic Workflow

```
1. Test fails
   ↓
2. Inspect (inline node -e script, not a new .spec.ts)
   ↓
3. Classify: code bug | test bug | environment flakiness
   ↓
4. Fix
   ↓
5. Verify: single test line (Level 0)
   ↓
6. Expand: full spec file (Level 1)
   ↓
7. If infrastructure change: related specs (Level 2)
   ↓
8. Full suite only before commit (Level 3)
```

---

## Copy Checklist

After copying this template, customize:

- [ ] Port number in `playwright.config.ts` and all scripts
- [ ] Dev server start command in `webServer.command`
- [ ] `testDir` path
- [ ] Add project-specific runtime inspection hooks (debugger API, state dumps)
- [ ] Add project-specific failure patterns to the Common Failure Patterns section
- [ ] Add project-specific test files and their known issues to a local appendix
