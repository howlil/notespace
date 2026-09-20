export type CanvasSelectionElementLike = {
  type: string;
  customData?: Record<string, unknown>;
};

export type CanvasSelectionCapabilities = {
  count: number;
  types: string[];
  mixed: boolean;
  hasCode: boolean;
  common: {
    stroke: boolean;
    opacity: boolean;
  };
  specific: {
    fill: boolean;
    line: boolean;
    arrow: boolean;
    text: boolean;
    freeDraw: boolean;
  };
};

const strokeTypes = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text"]);
const fillTypes = new Set(["rectangle", "diamond", "ellipse"]);
const lineTypes = new Set(["arrow", "line"]);

function semanticType(element: CanvasSelectionElementLike) {
  const code = element.customData?.notespaceCodeBlock;
  return code && typeof code === "object" ? "code" : element.type;
}

export function analyzeCanvasSelection(elements: readonly CanvasSelectionElementLike[]): CanvasSelectionCapabilities {
  const types = [...new Set(elements.map(semanticType))];
  const nonCode = elements.filter((element) => semanticType(element) !== "code");
  return {
    count: elements.length,
    types,
    mixed: types.length > 1,
    hasCode: types.includes("code"),
    common: {
      stroke: nonCode.length > 0 && nonCode.every((element) => strokeTypes.has(element.type)),
      opacity: elements.length > 0,
    },
    specific: {
      fill: nonCode.some((element) => fillTypes.has(element.type)),
      line: nonCode.some((element) => lineTypes.has(element.type)),
      arrow: nonCode.some((element) => element.type === "arrow"),
      text: nonCode.some((element) => element.type === "text"),
      freeDraw: nonCode.some((element) => element.type === "freedraw"),
    },
  };
}
