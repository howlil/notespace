import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Inline helpers
// ---------------------------------------------------------------------------

async function createWorkspace(page: Page, title: string): Promise<string> {
  await page.goto("/");
  await page
    .getByRole("button", { name: /New workspace/ })
    .first()
    .click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: title }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  return page.url().split("/").at(-1)!;
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: Anti-Slop Detection
// Based on DESIGN.md anti-slop rules
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Anti-Slop Detection", () => {
  test("no gradient hero areas on home", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      const all = document.querySelectorAll("*");
      for (const el of all) {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundImage;
        if (
          bg.includes("linear-gradient") ||
          bg.includes("radial-gradient")
        ) {
          const rect = el.getBoundingClientRect();
          // Hero = tall gradient > 200px high
          if (rect.height > 200) {
            return `Gradient hero detected: <${el.tagName} class="${el.className}"> height=${Math.round(rect.height)}px, bg=${bg.slice(0, 80)}`;
          }
        }
      }
      return null;
    });

    expect(issue, issue || "").toBeNull();
    await capture(page, "anti-slop-no-gradient-hero");
  });

  test("no neon glow or excessive blur", async ({ page }) => {
    // Check on home
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();
    let issue = await scanForGlowAndBlur(page);
    expect(issue, issue || "").toBeNull();

    // Check in workspace
    const wsId = await createWorkspace(page, `Glow check ${Date.now()}`);
    issue = await scanForGlowAndBlur(page);
    expect(issue, issue || "").toBeNull();
    await capture(page, "anti-slop-no-glow");
    await page.request.delete(`/api/projects/${wsId}`);
  });

  test("no decorative sparkle or AI motifs", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();
    let issue = await scanForAIMotifs(page);
    expect(issue, issue || "").toBeNull();

    const wsId = await createWorkspace(page, `Motifs check ${Date.now()}`);
    issue = await scanForAIMotifs(page);
    expect(issue, issue || "").toBeNull();
    await page.request.delete(`/api/projects/${wsId}`);
  });

  test("no excessive card nesting (max 2 levels)", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      function isCardLike(el: Element): boolean {
        const s = window.getComputedStyle(el);
        const radius = parseFloat(s.borderRadius) || 0;
        const shadow = s.boxShadow !== "none";
        const bg = s.backgroundColor;
        const parentBg = el.parentElement
          ? window.getComputedStyle(el.parentElement).backgroundColor
          : null;
        return radius > 8 && shadow && bg !== "rgba(0, 0, 0, 0)" && bg !== parentBg;
      }

      function maxCardDepth(el: Element): number {
        let depth = isCardLike(el) ? 1 : 0;
        let childMax = 0;
        for (const child of el.children) {
          childMax = Math.max(childMax, maxCardDepth(child));
        }
        return depth + childMax;
      }

      const depth = maxCardDepth(document.body);
      return depth > 2
        ? `Excessive card nesting: depth ${depth} (max allowed 2)`
        : null;
    });

    expect(issue, issue || "").toBeNull();
  });

  test("no oversized rounded rectangles on ordinary content", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        const role = el.getAttribute("role");
        if (
          role === "dialog" ||
          role === "alertdialog" ||
          el.tagName === "DIALOG"
        )
          continue;

        const s = window.getComputedStyle(el);
        const radius = parseFloat(s.borderRadius) || 0;
        const rect = el.getBoundingClientRect();

        if (radius > 24 && rect.width > 400) {
          const cls = el.className?.toString() || "";
          if (!cls.includes("search") && !el.id?.includes("search")) {
            return `Oversized rounded rect: <${el.tagName} class="${cls}"> w=${Math.round(rect.width)} radius=${radius}`;
          }
        }
      }
      return null;
    });

    expect(issue, issue || "").toBeNull();
  });

  test("no low-density dashboard wasting space", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      const main = document.querySelector("main") || document.body;
      const rect = main.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area === 0) return null;

      const interactives = main.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [role='link'], li",
      );
      let visible = 0;
      for (const el of interactives) {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        if (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== "hidden" &&
          s.display !== "none"
        )
          visible++;
      }

      const density = visible / area;
      return density < 1 / 50_000
        ? `Low density: ${visible} elements in ${Math.round(area)}px² (${(density * 100_000).toFixed(2)} per 100k px²)`
        : null;
    });

    expect(issue, issue || "").toBeNull();
  });

  test("no duplicate navigation surfaces", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      // Navigation regions must each have distinct aria-labels (no duplicate nav regions)
      const navs = document.querySelectorAll("nav, [role='navigation']");
      const labels = new Set<string>();
      for (const nav of navs) {
        const label =
          nav.getAttribute("aria-label") ||
          nav.getAttribute("aria-labelledby") ||
          "unlabeled";
        if (labels.has(label)) {
          return `Duplicate navigation region detected: "${label}"`;
        }
        labels.add(label);
      }

      // Check for duplicate action buttons
      const counts: Record<string, number> = {};
      for (const btn of document.querySelectorAll("button, a[role='button']")) {
        const text = btn.textContent?.trim();
        if (text && text.length > 3) {
          counts[text] = (counts[text] || 0) + 1;
          if (counts[text] > 2)
            return `Action "${text}" appears ${counts[text]} times`;
        }
      }
      return null;
    });

    expect(issue, issue || "").toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Visual Direction Contract
// From DESIGN.md: steel-blue accent, no library chrome in workspace
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Visual Direction Contract", () => {
  test("steel-blue accent is restrained — no electric/neon blue", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    const issue = await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        const s = window.getComputedStyle(el);
        for (const prop of [s.color, s.backgroundColor, s.borderColor]) {
          const m = prop.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (m) {
            const [, rs, gs, bs] = m;
            const r = parseInt(rs, 10);
            const g = parseInt(gs, 10);
            const b = parseInt(bs, 10);
            // Electric blue: high blue, low red+green
            if (b > 200 && r < 100 && g < 100) {
              return `Electric blue: rgb(${r},${g},${b}) on <${el.tagName} class="${el.className}">`;
            }
          }
        }
      }
      return null;
    });

    expect(issue, issue || "").toBeNull();
  });

  test("workspace has no library sidebar chrome", async ({ page, request }) => {
    const wsId = await createWorkspace(page, `Chrome check ${Date.now()}`);
    try {
      // Workspace should not have sidebar/category navigation
      await expect(
        page.getByRole("navigation", { name: "Categories" }),
      ).toHaveCount(0);

      // Workspace header should be present
      await expect(page.locator(".workspace-header")).toBeVisible();

      // Back link should exist (the only library reference)
      await expect(
        page.getByRole("link", { name: "Back to library", exact: true }),
      ).toBeVisible();

      await capture(page, "workspace-no-library-chrome");
    } finally {
      await request.delete(`/api/projects/${wsId}`);
    }
  });

  test("workspace header is visible on open", async ({ page, request }) => {
    const wsId = await createWorkspace(page, `Header check ${Date.now()}`);
    try {
      await expect(page.locator(".workspace-header")).toBeVisible();
      await capture(page, "workspace-header-visible");
    } finally {
      await request.delete(`/api/projects/${wsId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Broken Feature / Integrity Detection
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Feature Integrity", () => {
  test("no console errors on all major routes", async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Home
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();
    expect(errors, `Errors on Home: ${errors.join("; ")}`).toEqual([]);

    // Workspace
    const wsId = await createWorkspace(page, `Integrity ${Date.now()}`);
    expect(errors, `Errors in Workspace: ${errors.join("; ")}`).toEqual([]);

    await request.delete(`/api/projects/${wsId}`);
  });

  test("no failed network requests on core workflow", async ({
    page,
    request,
  }) => {
    const failures: string[] = [];
    page.on("requestfailed", (req) => {
      // Ignore normal browser aborts on page transition
      if (req.failure()?.errorText !== "net::ERR_ABORTED") {
        failures.push(`${req.url()}: ${req.failure()?.errorText}`);
      }
    });

    await page.goto("/");
    const wsId = await createWorkspace(page, `Network ${Date.now()}`);

    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.click();
    await editor.fill("Content for integrity test");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    expect(failures, `Failed requests: ${failures.join("; ")}`).toEqual([]);
    await request.delete(`/api/projects/${wsId}`);
  });

  test("dark mode toggle renders without invisible text", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();

    // Toggle to dark mode if not already
    const themeToggle = page.getByRole("button", { name: /theme|dark|light/i });
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    }

    const issue = await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        const s = window.getComputedStyle(el);
        if (
          s.color === s.backgroundColor &&
          s.color !== "rgba(0, 0, 0, 0)" &&
          el.textContent?.trim()
        ) {
          return `Invisible text: <${el.tagName} class="${el.className}"> color=${s.color}`;
        }
      }
      return null;
    });

    expect(issue, issue || "").toBeNull();
    await capture(page, "dark-mode-home");
  });

  test("all interactive elements have accessible names", async ({
    page,
    request,
  }) => {
    // Check home
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();
    let issue = await checkAccessibleNames(page);
    expect(issue, `Home: ${issue || ""}`).toBeNull();

    // Check workspace
    const wsId = await createWorkspace(page, `A11y ${Date.now()}`);
    issue = await checkAccessibleNames(page);
    expect(issue, `Workspace: ${issue || ""}`).toBeNull();
    await request.delete(`/api/projects/${wsId}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Reusable page.evaluate scanners
// ═══════════════════════════════════════════════════════════════════════════

async function scanForGlowAndBlur(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      const s = window.getComputedStyle(el);

      // Neon box-shadow
      if (s.boxShadow && s.boxShadow !== "none") {
        const m = s.boxShadow.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (m) {
          const [r, g, b] = [m[1], m[2], m[3]].map(Number);
          if (
            (r > 200 || g > 200 || b > 200) &&
            Math.max(r, g, b) - Math.min(r, g, b) > 100
          )
            return `Neon shadow on <${el.tagName}.${el.className}>: ${s.boxShadow.slice(0, 60)}`;
        }
      }

      // Excessive filter blur
      if (s.filter?.includes("blur")) {
        const m = s.filter.match(/blur\(([\d.]+)px\)/);
        if (m && parseFloat(m[1]) > 8)
          return `Filter blur ${m[1]}px on <${el.tagName}.${el.className}>`;
      }

      // Excessive backdrop blur
      if (s.backdropFilter?.includes("blur")) {
        const m = s.backdropFilter.match(/blur\(([\d.]+)px\)/);
        if (m && parseFloat(m[1]) > 20)
          return `Backdrop blur ${m[1]}px on <${el.tagName}.${el.className}>`;
      }
    }
    return null;
  });
}

async function scanForAIMotifs(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const slopEmojis = ["✨", "🪄", "🤖", "💫"];
    for (const el of document.querySelectorAll("*")) {
      const cls = el.className?.toString() || "";

      // Exclude loading skeletons (pulse on skeleton is standard, not AI slop)
      if (cls.includes("skeleton") || el.closest(".loading-skeleton")) continue;

      if (/\b(sparkle|ai-|magic|wand)\b/i.test(cls))
        return `AI motif class: "${cls}" on <${el.tagName}>`;

      // Text emojis
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent) {
          for (const emoji of slopEmojis) {
            if (child.textContent.includes(emoji))
              return `Decorative emoji "${emoji}" in <${el.tagName}>`;
          }
        }
      }

      // Animation names
      const anim = window.getComputedStyle(el).animationName?.toLowerCase();
      if (
        anim &&
        anim !== "none" &&
        /sparkle|shimmer|glow/.test(anim)
      )
        return `Slop animation "${anim}" on <${el.tagName}.${cls}>`;
    }
    return null;
  });
}

async function checkAccessibleNames(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const selectors =
      "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox']";
    for (const el of document.querySelectorAll(selectors)) {
      // Exclude third-party canvas editor internals
      if (el.closest(".excalidraw")) continue;

      const s = window.getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if ((el as HTMLInputElement).type === "hidden") continue;
      if (el.closest("svg")) continue;

      const hasName =
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        (el.textContent?.trim() || "").length > 0;

      if (!hasName)
        return `Missing accessible name: <${el.tagName} class="${el.className}">`;
    }
    return null;
  });
}
