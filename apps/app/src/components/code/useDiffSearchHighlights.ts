import { useEffect, useId } from "react";
import type { RefObject } from "react";

interface CssHighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

type CssHighlightConstructor = new (...ranges: Range[]) => unknown;

interface TextNodePosition {
  node: Text;
  offset: number;
}

const HIGHLIGHT_STYLE =
  "background-color: color-mix(in oklab, var(--primary) 34%, transparent); color: inherit;";

function getHighlightApi(): {
  registry: CssHighlightRegistry;
  Highlight: CssHighlightConstructor;
} | null {
  const browser = globalThis as typeof globalThis & {
    CSS?: { highlights?: CssHighlightRegistry };
    Highlight?: CssHighlightConstructor;
  };
  if (
    browser.CSS?.highlights === undefined ||
    browser.Highlight === undefined
  ) {
    return null;
  }
  return { registry: browser.CSS.highlights, Highlight: browser.Highlight };
}

function findTextPosition(
  nodes: readonly Text[],
  offset: number,
): TextNodePosition | null {
  let remaining = offset;
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      return { node, offset: remaining };
    }
    remaining -= node.data.length;
  }
  return null;
}

export function findDiffSearchRanges(root: ParentNode, query: string): Range[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const ranges: Range[] = [];
  for (const line of root.querySelectorAll<HTMLElement>("[data-line]")) {
    const walker = line.ownerDocument.createTreeWalker(
      line,
      NodeFilter.SHOW_TEXT,
    );
    const nodes: Text[] = [];
    let text = "";
    let node = walker.nextNode();
    while (node !== null) {
      if (node instanceof Text) {
        nodes.push(node);
        text += node.data;
      }
      node = walker.nextNode();
    }

    const normalizedText = text.toLowerCase();
    let matchStart = normalizedText.indexOf(normalizedQuery);
    while (matchStart >= 0) {
      const matchEnd = matchStart + normalizedQuery.length;
      const start = findTextPosition(nodes, matchStart);
      const end = findTextPosition(nodes, matchEnd);
      if (start !== null && end !== null) {
        const range = line.ownerDocument.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        ranges.push(range);
      }
      matchStart = normalizedText.indexOf(normalizedQuery, matchEnd);
    }
  }
  return ranges;
}

function addHighlightStyle(shadowRoot: ShadowRoot, highlightName: string) {
  const existing = shadowRoot.querySelector<HTMLStyleElement>(
    `style[data-bb-diff-search-highlight="${highlightName}"]`,
  );
  if (existing !== null) {
    return existing;
  }
  const style = shadowRoot.ownerDocument.createElement("style");
  style.dataset.bbDiffSearchHighlight = highlightName;
  style.textContent = `::highlight(${highlightName}) { ${HIGHLIGHT_STYLE} }`;
  shadowRoot.append(style);
  return style;
}

export function useDiffSearchHighlights(
  containerRef: RefObject<HTMLElement | null>,
  query: string | undefined,
) {
  const componentId = useId().replaceAll(/[^a-zA-Z0-9_-]/g, "");
  const highlightName = `bb-diff-search-${componentId}`;
  const normalizedQuery = query?.trim() ?? "";

  useEffect(() => {
    const api = getHighlightApi();
    if (api === null || normalizedQuery.length === 0) {
      return;
    }

    let frameId: number | null = null;
    const observers: MutationObserver[] = [];
    const observedRoots = new Set<ShadowRoot>();
    const styles = new Set<HTMLStyleElement>();
    const scheduleUpdate = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateHighlights();
      });
    };
    const observeRoot = (root: ShadowRoot) => {
      if (observedRoots.has(root)) {
        return;
      }
      observedRoots.add(root);
      const observer = new MutationObserver(scheduleUpdate);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      observers.push(observer);
    };
    const updateHighlights = () => {
      const container = containerRef.current;
      if (container === null) {
        return;
      }
      const ranges: Range[] = [];
      for (const host of container.querySelectorAll<HTMLElement>(
        "diffs-container",
      )) {
        const shadowRoot = host.shadowRoot;
        if (shadowRoot === null) {
          continue;
        }
        observeRoot(shadowRoot);
        styles.add(addHighlightStyle(shadowRoot, highlightName));
        ranges.push(...findDiffSearchRanges(shadowRoot, normalizedQuery));
      }
      api.registry.set(highlightName, new api.Highlight(...ranges));
    };

    const container = containerRef.current;
    if (container !== null) {
      const observer = new MutationObserver(scheduleUpdate);
      observer.observe(container, { childList: true, subtree: true });
      observers.push(observer);
    }
    updateHighlights();

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      for (const observer of observers) {
        observer.disconnect();
      }
      for (const style of styles) {
        style.remove();
      }
      api.registry.delete(highlightName);
    };
  }, [containerRef, highlightName, normalizedQuery]);
}
