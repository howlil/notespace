export type CanvasSelectionElementLike = {
  type: string;
  customData?: Record<string, unknown>;
};

export type CapabilityCoverage = "all" | "some" | "none";

export type CanvasSelectionCapabilities = {
  count: number;
  types: string[];
  mixed: boolean;
  hasCode: boolean;
  stroke: CapabilityCoverage;
  opacity: CapabilityCoverage;
  fill: CapabilityCoverage;
  line: CapabilityCoverage;
  arrow: CapabilityCoverage;
  text: CapabilityCoverage;
  freeDraw: CapabilityCoverage;
  embed: CapabilityCoverage;
};

const strokeTypes = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text"]);
const fillTypes = new Set(["rectangle", "diamond", "ellipse"]);
const lineTypes = new Set(["arrow", "line"]);

function semanticType(element: CanvasSelectionElementLike) {
  const code = element.customData?.notespaceCodeBlock;
  return code && typeof code === "object" ? "code" : element.type;
}

function coverage(elements: readonly CanvasSelectionElementLike[], predicate: (element: CanvasSelectionElementLike) => boolean): CapabilityCoverage {
  if (elements.length === 0) return "none";
  const supported = elements.reduce((count, element) => count + (predicate(element) ? 1 : 0), 0);
  if (supported === 0) return "none";
  return supported === elements.length ? "all" : "some";
}

export function analyzeCanvasSelection(elements: readonly CanvasSelectionElementLike[]): CanvasSelectionCapabilities {
  const types = [...new Set(elements.map(semanticType))];
  return {
    count: elements.length,
    types,
    mixed: types.length > 1,
    hasCode: types.includes("code"),
    stroke: coverage(elements, (element) => semanticType(element) !== "code" && strokeTypes.has(element.type)),
    opacity: coverage(elements, () => true),
    fill: coverage(elements, (element) => semanticType(element) !== "code" && fillTypes.has(element.type)),
    line: coverage(elements, (element) => semanticType(element) !== "code" && lineTypes.has(element.type)),
    arrow: coverage(elements, (element) => semanticType(element) !== "code" && element.type === "arrow"),
    text: coverage(elements, (element) => semanticType(element) !== "code" && element.type === "text"),
    freeDraw: coverage(elements, (element) => semanticType(element) !== "code" && element.type === "freedraw"),
    embed: coverage(elements, (element) => element.type === "embeddable"),
  };
}
