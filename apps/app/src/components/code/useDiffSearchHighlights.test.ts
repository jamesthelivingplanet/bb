// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findDiffSearchRanges } from "./useDiffSearchHighlights";

function createDiffRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<span data-column-number="true">12</span>',
    "<span data-line><span>.ht</span><span>ml</span> preview</span>",
    "<span data-line>another .HTML preview</span>",
  ].join("");
  return root;
}

describe("findDiffSearchRanges", () => {
  it("finds case-insensitive matches across syntax token boundaries", () => {
    const ranges = findDiffSearchRanges(createDiffRoot(), ".html");

    expect(ranges.map((range) => range.toString())).toEqual([".html", ".HTML"]);
  });

  it("does not search line-number gutters", () => {
    const ranges = findDiffSearchRanges(createDiffRoot(), "12");

    expect(ranges).toHaveLength(0);
  });
});
