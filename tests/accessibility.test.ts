import { styleText } from "node:util";
import { expect, getRoutes, localURL, test } from "./accessibility";

function formatImpact(impact: string | null | undefined) {
  if (!impact) {
    return "unknown";
  }

  const impactKey: Record<string, string> = {
    minor: styleText("blue", impact),
    moderate: styleText("yellowBright", impact),
    serious: styleText("yellow", impact),
    critical: styleText("red", impact),
  };

  return impactKey[impact] ?? impact;
}

// One test per route: each page gets its own timeout, failures don't hide
// the routes behind them, and workers can run pages in parallel.
for (const route of getRoutes()) {
  const pageLabel = route === "/" ? "homepage" : route;

  test(`${pageLabel} has no accessibility violations`, async ({ page, makeAxeBuilder }) => {
    const pageURL = new URL(route, localURL).toString();

    // Pages are server-rendered, so the DOM is complete at domcontentloaded;
    // networkidle never settles here (map tiles, analytics) and is what
    // Playwright itself recommends against.
    const response = await page.goto(pageURL, { waitUntil: "domcontentloaded" });
    expect(response, `Expected ${pageLabel} to return a response.`).not.toBeNull();
    expect(
      response?.ok(),
      `Expected ${pageLabel} to load successfully, received HTTP ${response?.status() ?? "no response"}.`
    ).toBe(true);
    await page.locator("body").waitFor();

    const { violations } = await makeAxeBuilder().analyze();
    const reportMessage = `Found ${violations.length} accessibility violations on ${pageLabel}.`;

    if (violations.length === 0) {
      expect(violations, reportMessage).toHaveLength(0);
      return;
    }

    const violationLog = violations
      .map((violation, violationIndex) => {
        const nodes = violation.nodes
          .map(
            (node, nodeIndex) => `
${styleText("redBright", `  Node ${nodeIndex + 1} HTML:`)} ${node.html}
${styleText("redBright", `  Node ${nodeIndex + 1} CSS:`)} ${node.target.join(", ")}
${styleText("green", "  Suggested fix:")}
  ${node.failureSummary ?? "No failure summary provided."}`
          )
          .join("\n");

        return `
${styleText(["redBright", "bold"], `Violation ${violationIndex + 1}:`)}
${styleText("redBright", "  Violation ID:")} ${violation.id}
${styleText("redBright", "  Violation Impact:")} ${formatImpact(violation.impact)}
${styleText("redBright", "  Violation Description:")} ${violation.help}
${styleText("redBright", "  More info:")} ${violation.helpUrl}
${nodes}`;
      })
      .join("\n\n");

    throw new Error(`${violationLog}\n\n${reportMessage}`);
  });
}
