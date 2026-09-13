// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillBadge } from "./SkillBadge";
import { TooltipProvider } from "@/components/ui/tooltip";

const renderWithTooltip = (ui: React.ReactElement) =>
  renderToStaticMarkup(<TooltipProvider>{ui}</TooltipProvider>);

describe("SkillBadge", () => {
  it("renders ponytail badge", () => {
    const html = renderWithTooltip(<SkillBadge skill="ponytail" />);
    expect(html).toContain("Ponytail");
  });

  it("renders caveman badge", () => {
    const html = renderWithTooltip(<SkillBadge skill="caveman" />);
    expect(html).toContain("Caveman");
  });

  it("shows ponytail icon emoji", () => {
    const html = renderWithTooltip(<SkillBadge skill="ponytail" />);
    expect(html).toContain("🪮");
  });

  it("shows caveman icon emoji", () => {
    const html = renderWithTooltip(<SkillBadge skill="caveman" />);
    expect(html).toContain("🪨");
  });

  it("renders custom label when provided", () => {
    const html = renderWithTooltip(<SkillBadge skill="caveman" label="Custom" />);
    expect(html).toContain("Custom");
  });
});