export type CanvasSelectionElementLike = {
  type: string;
  customData?: Record<string, unknown>;
  strokeOptions?: { variability: string; streamline: number };
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
const drawingTypes = new Set([...fillTypes, ...lineTypes]);

export type SharedCanvasValue<T> = { kind: "unsupported" } | { kind: "mixed" } | { kind: "shared"; value: T };
export type CanvasStyleProperty = "strokeColor" | "backgroundColor" | "fillStyle" | "strokeWidth" | "strokeStyle"
  | "roughness" | "roundness" | "pressure" | "opacity" | "startArrowhead" | "endArrowhead"
  | "fontFamily" | "fontSize" | "textAlign" | "arrowType";

const styleTypes: Record<Exclude<CanvasStyleProperty, "opacity">, ReadonlySet<string>> = {
  strokeColor: strokeTypes, strokeWidth: strokeTypes,
  backgroundColor: fillTypes, fillStyle: fillTypes, roundness: fillTypes,
  strokeStyle: drawingTypes, roughness: drawingTypes,
  pressure: new Set(["freedraw"]),
  startArrowhead: new Set(["arrow"]), endArrowhead: new Set(["arrow"]), arrowType: new Set(["arrow"]),
  fontFamily: new Set(["text"]), fontSize: new Set(["text"]), textAlign: new Set(["text"]),
};

export function supportsCanvasStyle(element: CanvasSelectionElementLike, property: CanvasStyleProperty): boolean {
  if (property === "opacity") return true;
  return semanticType(element) !== "code" && styleTypes[property].has(element.type);
}

export function sharedCanvasValue<E, T>(elements: readonly E[], read: (element: E) => T): SharedCanvasValue<T> {
  if (elements.length === 0) return { kind: "unsupported" };
  const value = read(elements[0]);
  return elements.every((element) => Object.is(read(element), value)) ? { kind: "shared", value } : { kind: "mixed" };
}

const styleFields: Record<string, CanvasStyleProperty> = {
  strokeColor: "strokeColor", backgroundColor: "backgroundColor", fillStyle: "fillStyle",
  strokeWidth: "strokeWidth", strokeStyle: "strokeStyle", roughness: "roughness", roundness: "roundness",
  strokeOptions: "pressure", opacity: "opacity", startArrowhead: "startArrowhead", endArrowhead: "endArrowhead",
  fontFamily: "fontFamily", fontSize: "fontSize", textAlign: "textAlign", elbowed: "arrowType",
};

export function canvasStylePatchForElement<P extends object>(element: CanvasSelectionElementLike, patch: P): Partial<P> {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    const property = styleFields[field];
    if (property && supportsCanvasStyle(element, property)) result[field] = value;
  }
  const strokeOptions = result.strokeOptions as { variability: string } | undefined;
  if (strokeOptions && element.strokeOptions) result.strokeOptions = { ...element.strokeOptions, variability: strokeOptions.variability };
  if (supportsCanvasStyle(element, "arrowType") && "elbowed" in patch && "roundness" in patch) result.roundness = patch.roundness;
  return result as Partial<P>;
}

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
