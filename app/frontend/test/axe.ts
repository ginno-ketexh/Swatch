import axe from "axe-core";

export async function expectNoSeriousViolations(node: HTMLElement) {
  const results = await axe.run(node, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  });
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  if (serious.length > 0) {
    const detail = serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n");
    throw new Error(detail);
  }
}
