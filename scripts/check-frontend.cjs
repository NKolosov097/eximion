const { chromium } = require("../frontend/node_modules/playwright");
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
  let catalogEmpty = false;
  let holdCatalog = false;
  let releaseCatalog;
  const api = http.createServer(async (req, res) => {
    requests++;
    if (holdCatalog && new URL(req.url, "http://localhost").pathname === "/api/v1/clinical-cases")
      await new Promise((resolve) => { releaseCatalog = resolve; });
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        healthy
          ? (new URL(req.url, "http://localhost").pathname === "/api/v1/clinical-cases"
            ? { items: catalogEmpty ? [] : [clinicalCase], has_more: !catalogEmpty && new URL(req.url, "http://localhost").searchParams.get("page") === "1" }
            : clinicalCase)
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
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHANNEL === "chromium" ? {} : { channel: "chrome" }),
      headless: true,
    });
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
    await page.getByTestId("nav-home-link").click();
    await page.waitForURL(`${origin}/`);
    const docs = page.getByTestId("nav-docs");
    const docsUrl = await docs.getAttribute("href");
    assert.equal(new URL(docsUrl).pathname, "/docs");
    assert.equal(await docs.getAttribute("target"), "_blank");
    assert.deepEqual(new Set((await docs.getAttribute("rel")).split(/\s+/)), new Set(["noopener", "noreferrer"]));
    assert(await docs.locator("svg").isVisible(), "Docs shows the external-link icon.");
    await page.context().route(docsUrl, (route) => route.fulfill({
      contentType: "text/html", body: "<title>Test API docs</title><h1>API docs</h1>",
    }));
    const popupPromise = page.waitForEvent("popup");
    await docs.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), docsUrl);
    assert.equal(await popup.evaluate(() => window.opener), null);
    assert.equal(page.url(), `${origin}/`, "Docs leaves the application tab intact.");
    await popup.close();
    await page.context().unroute(docsUrl);
    assert.equal(await page.getByTestId("footer-github").getAttribute("href"), "https://github.com/NKolosov097");
    await page.getByTestId("nav-all-cases").click();
    await page.getByTestId("case-catalog").waitFor();
    await page.getByTestId("nav-create-case").click();
    await page.getByTestId("author-source-text").waitFor();
    await page.getByTestId("nav-home").click();
    await page.waitForURL(`${origin}/`);
    await page.getByTestId("nav-all-cases").click();
    await page.getByRole("link", { name: draft.title, exact: true }).click();
    await page.getByTestId("case-title").waitFor();

    const browserRequests = [];
    let attemptUnavailable = false;
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      browserRequests.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
      let body = clinicalCase;
      if (request.url().endsWith("/extract")) body = { draft, warnings: [] };
      const isAttempt = request.url().endsWith("/attempts");
      if (isAttempt) {
        const correct = request.postDataJSON().diagnosis.trim().toLowerCase() !== "unrelated diagnosis";
        body = attemptUnavailable
          ? { error: { message: "Synthetic service unavailable." } }
          : { score: correct ? 100 : 0, max_score: 100, is_correct: correct,
              feedback: correct ? "Accepted synthetic answer." : "Incorrect synthetic answer." };
      }
      await route.fulfill({
        status: isAttempt && attemptUnavailable ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    await page.getByTestId("attempt-diagnosis").fill("   ");
    await page.getByTestId("attempt-submit").click();
    await page.getByTestId("attempt-error").waitFor();
    assert.equal(browserRequests.length, 0, "Invalid answers never reach the API.");
    assert.equal(await page.getByTestId("attempt-diagnosis").getAttribute("aria-invalid"), "true");
    for (const [answer, title, score] of [
      ["  FLU  ", "Accepted diagnosis", "100 / 100"],
      ["Unrelated diagnosis", "Keep thinking", "0 / 100"],
    ]) {
      await page.getByTestId("attempt-diagnosis").fill(answer);
      assert.equal(await page.getByTestId("attempt-result").count(), 0, "Editing clears stale feedback.");
      await page.getByTestId("attempt-submit").click();
      await page.getByTestId("attempt-result").waitFor();
      assert.equal(await page.getByTestId("attempt-result-title").textContent(), title);
      assert.equal(await page.getByTestId("attempt-score").textContent(), score);
      assert.equal(browserRequests.at(-1).body.diagnosis, answer);
    }
    attemptUnavailable = true;
    await page.getByTestId("attempt-diagnosis").fill("Influenza");
    await page.getByTestId("attempt-submit").click();
    await page.getByTestId("attempt-error").waitFor();
    assert.equal(await page.getByTestId("attempt-error").textContent(), "Synthetic service unavailable.");
    assert.equal(await page.getByTestId("attempt-diagnosis").inputValue(), "Influenza");
    assert(await page.getByTestId("attempt-submit").isEnabled());
    attemptUnavailable = false;
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
    assert.equal(await page.getByTestId("author-reference-diagnosis").inputValue(), "");
    await page.getByTestId("author-reference-diagnosis").fill("Influenza");
    const beforeUnreviewedSave = browserRequests.length;
    assert(await page.getByTestId("author-save-submit").isDisabled(), "Saving requires explicit review.");
    assert.equal(browserRequests.length, beforeUnreviewedSave);
    await page.getByTestId("author-review-confirmation").check();
    await page.getByTestId("author-draft-title").fill("Edited synthetic case");
    assert.equal(await page.getByTestId("author-review-confirmation").isChecked(), false);
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
    await page.unroute("**/api/v1/**");
    await page.getByTestId("case-back-home").click();
    await page.getByTestId("case-catalog").waitFor();
    assert.equal(new URL(page.url()).pathname, "/clinical-cases");
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await page.waitForURL(`${origin}/clinical-cases?page=2`);
    await page.getByRole("link", { name: "Previous page", exact: true }).click();
    await page.waitForURL(`${origin}/clinical-cases?page=1`);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Catalog overflow at ${width}px`);
      for (const selector of ["nav-home-link", "nav-all-cases", "nav-create-case", "nav-docs", "footer-github"]) {
        assert(await page.getByTestId(selector).isVisible(), `${selector} visible at ${width}px`);
      }
    }
    await page.getByRole("link", { name: draft.title, exact: true }).click();
    await page.getByTestId("case-title").waitFor();
    holdCatalog = true;
    try {
      await page.goto(origin + "/clinical-cases?page=2", { waitUntil: "commit" });
      const loading = page.getByTestId("catalog-loading");
      await loading.waitFor();
      assert.equal(await loading.locator("li").count(), 3);
      assert.equal(await loading.getByRole("status").textContent(), "Loading clinical cases...");
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(await loading.locator(".skeleton-line").first().evaluate(el => getComputedStyle(el).animationName), "none");
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(root, `.local/catalog-loading-${width}.png`), fullPage: true });
      }
    } finally {
      holdCatalog = false;
      releaseCatalog?.();
    }
    await page.getByTestId("catalog-case").waitFor();
    assert.equal(await page.getByTestId("catalog-loading").count(), 0);
    catalogEmpty = true;
    await page.goto(`${origin}/clinical-cases`);
    await page.getByTestId("catalog-empty").waitFor();
    assert(await page.getByText("No cases have been saved yet.").isVisible());
    assert.deepEqual(errors, []);
    healthy = false;
    await page.reload();
    await page.getByRole("heading", { name: "Unable to load cases" }).waitFor();
    const failedCatalogRequests = requests;
    healthy = true;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.getByTestId("catalog-empty").waitFor();
    assert(requests > failedCatalogRequests);
    errors.length = 0; // Expected Server Component error from the injected 503.

    const report = {
      status: "passed",
      header_home_cases_create_and_brand_navigation: true,
      docs_new_tab_icon_noopener_and_footer_github: true,
      attempt_validation_correct_incorrect_error_recovery: true,
      author_review_required_and_reset_on_edit: true,
      catalog_navigation_pagination_empty_retry: true,
      catalog_skeleton_transition_and_reduced_motion: true,
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
