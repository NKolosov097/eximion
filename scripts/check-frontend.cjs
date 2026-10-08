const { chromium } = require("../.local/browser-check/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const root = path.resolve(__dirname, "..");
const id = "4613eeb7-7064-41da-bb06-62630b3eaebc";
const draft = {
  title: "Synthetic browser case",
  vignette: "Synthetic fever and cough.",
  symptoms: ["Fever"],
  age_years: null,
};
const clinicalCase = { ...draft, id, created_at: "2026-10-08T12:00:00Z" };
const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};

(async () => {
  let requests = 0;
  let healthy = false;
  const api = http.createServer((req, res) => {
    requests++;
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        healthy
          ? clinicalCase
          : { error: { message: "Temporary test failure." } },
      ),
    );
  });
  const apiPort = await listen(api);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      String(port),
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: path.join(root, "frontend"),
      env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}` },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      if (server.exitCode !== null) throw new Error(logs);
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      if (n === 99)
        throw new Error("Test production server did not become ready.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/clinical-cases/${id}`);
    await page.getByTestId("case-load-retry").waitFor();
    const failedRequests = requests;
    assert(failedRequests > 0);
    healthy = true;
    await page.getByTestId("case-load-retry").click();
    await page.getByTestId("case-title").waitFor();
    assert(
      requests > failedRequests,
      "Retry must issue a new server-side API request.",
    );
    assert.equal(
      await page.getByTestId("case-title").textContent(),
      draft.title,
    );
    // The deliberately failed Server Component reports an expected production error.
    errors.length = 0;
    const browserRequests = [];
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      browserRequests.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
      let body = clinicalCase;
      if (request.url().endsWith("/extract")) body = { draft, warnings: [] };
      if (request.url().endsWith("/attempts"))
        body = {
          score: 100,
          max_score: 100,
          is_correct: true,
          feedback: "Accepted synthetic answer.",
        };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const emoji = String.fromCodePoint(0x1f600);
    await page.getByTestId("attempt-diagnosis").fill(` ${emoji.repeat(200)} `);
    await page.getByTestId("attempt-diagnosis").press("Enter");
    await page.getByTestId("attempt-result").waitFor();
    assert.equal([...browserRequests.at(-1).body.diagnosis.trim()].length, 200);
    await page.goto(`${origin}/clinical-cases/new`);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
      "skip-to-content",
    );
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
    await page.getByTestId("author-source-text").fill(" ".repeat(20) + "short");
    await page.getByTestId("author-extract-submit").click();
    assert.equal(
      await page.getByTestId("author-source-text").getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "source-text",
    );
    await page.getByTestId("author-source-text").fill(emoji.repeat(20000));
    await page.getByTestId("author-extract-submit").click();
    await page.getByTestId("author-draft-title").waitFor();
    assert.equal([...browserRequests.at(-1).body.source_text].length, 20000);
    for (const [selector, count] of [
      ["author-draft-title", 120],
      ["author-draft-vignette", 8000],
      ["author-reference-diagnosis", 200],
      ["author-draft-symptoms", 200],
      ["author-accepted-alternatives", 200],
    ]) {
      await page.getByTestId(selector).fill(` ${emoji.repeat(count)} `);
      assert.equal(
        await page.getByTestId(selector).getAttribute("maxlength"),
        null,
      );
    }
    await page.getByTestId("author-draft-title").fill(emoji.repeat(121));
    await page.getByTestId("author-review-confirmation").check();
    await page.getByTestId("author-save-submit").click();
    assert.equal(
      await page.getByTestId("author-draft-title").getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "case-title",
    );
    assert.equal(
      await page
        .getByTestId("author-draft-title")
        .getAttribute("aria-describedby"),
      "save-error",
    );
    await page.getByTestId("author-draft-title").fill(emoji.repeat(120));
    await page.getByTestId("author-review-confirmation").check();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `No overflow at ${width}px`,
      );
    }
    assert.equal(
      await page
        .getByTestId("author-save-submit")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await page.getByTestId("author-save-submit").click();
    await page.waitForURL(`${origin}/clinical-cases/${id}`);
    await page.getByTestId("case-title").waitFor();
    const saved = browserRequests.find(
      (request) => request.path === "/api/v1/clinical-cases",
    ).body;
    assert.equal([...saved.title].length, 120);
    assert.equal([...saved.vignette.trim()].length, 8000);
    assert.equal([...saved.reference_diagnosis.trim()].length, 200);
    assert.equal([...saved.symptoms[0]].length, 200);
    assert.equal([...saved.accepted_answers[0]].length, 200);
    assert.deepEqual(errors, []);
    const report = {
      status: "passed",
      production_retry_new_api_request: true,
      keyboard_skip_and_submit: true,
      unicode_boundaries: true,
      inline_errors_and_focus: true,
      reduced_motion: true,
      responsive_widths: [320, 390, 768, 1440],
      page_errors: errors,
      synthetic_mock_api: true,
    };
    fs.mkdirSync(path.join(root, ".local"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".local/frontend-check.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (server.exitCode === null) await once(server, "exit");
    await new Promise((resolve) => api.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
