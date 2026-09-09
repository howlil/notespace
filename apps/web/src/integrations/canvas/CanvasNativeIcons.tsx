import type { SVGProps } from "react";
import type { Arrowhead } from "@excalidraw/excalidraw/element/types";
import type { FillStyle, StrokeStyle, StrokeVariability, TextAlign } from "@excalidraw/excalidraw/element/types";

// These glyphs mirror Excalidraw's MIT-licensed icons from
// packages/excalidraw/components/icons.tsx. The installed package does not
// expose that internal module as a supported runtime import, so Notespace keeps
// one adapter instead of inventing look-alike SVGs across canvas components.

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ viewBox = "0 0 24 24", children, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" focusable="false" role="img" viewBox={viewBox} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}

export function NativeSelectionIcon(props: IconProps) {
  return <Icon viewBox="0 0 22 22" strokeWidth={1.25} {...props}><path d="M6 6l4.153 11.793a.365.365 0 0 0 .331.207.366.366 0 0 0 .332-.207L13 13l4.787-1.994a.355.355 0 0 0 .213-.323.355.355 0 0 0-.213-.323L6 6Z" /><path d="M13.5 13.5 18 18" /></Icon>;
}

export function NativeLassoIcon(props: IconProps) {
  return <Icon viewBox="0 0 22 22" strokeWidth={1.25} {...props}><path d="M4.028 13.252C3.371 12.28 3 11.174 3 10c0-3.866 4.03-7 9-7s9 3.134 9 7-4.03 7-9 7c-1.913 0-3.686-.464-5.144-1.255" /><path d="M5 15m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0" /><path d="M5 17c0 1.42.316 2.805 1 4" /></Icon>;
}

export function NativeRectangleIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><rect x="4" y="4" width="16" height="16" rx="2" /></Icon>;
}

export function NativeDiamondIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><path d="m10.5 20.4-6.9-6.9c-.781-.781-.781-2.219 0-3l6.9-6.9c.781-.781 2.219-.781 3 0l6.9 6.9c.781.781.781 2.219 0 3l-6.9 6.9c-.781.781-2.219.781-3 0Z" /></Icon>;
}

export function NativeEllipseIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><circle cx="12" cy="12" r="9" /></Icon>;
}

export function NativeArrowIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><line x1="5" y1="12" x2="19" y2="12" /><line x1="15" y1="16" x2="19" y2="12" /><line x1="15" y1="8" x2="19" y2="12" /></Icon>;
}

export function NativeLineIcon(props: IconProps) {
  return <Icon viewBox="0 0 20 20" strokeWidth={1.5} {...props}><path d="M4.167 10h11.666" /></Icon>;
}

export function NativeFreedrawIcon(props: IconProps) {
  return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><path d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" /><path d="m11.25 5.417 3.333 3.333" /></Icon>;
}

export function NativeTextIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><line x1="4" y1="20" x2="7" y2="20" /><line x1="14" y1="20" x2="21" y2="20" /><line x1="6.9" y1="15" x2="13.8" y2="15" /><line x1="10.2" y1="6.3" x2="16" y2="20" /><polyline points="5 20 11 4 13 4 20 20" /></Icon>;
}

export function NativeImageIcon(props: IconProps) {
  return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><path d="M12.5 6.667h.01" /><path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" /><path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" /><path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" /></Icon>;
}

export function NativeEraserIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><path d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41L11.5 20" /><path d="M18 13.3 11.7 7" /></Icon>;
}

export function NativeBucketFillIcon(props: IconProps) {
  return <Icon strokeWidth={1.25} {...props}><path d="M5 16 6.465 17.638a2 2 0 1 1-3.015.099L5 16Z" /><path d="M13.737 9.737c2.299-2.3 3.23-5.095 2.081-6.245-1.15-1.15-3.945-.217-6.244 2.082-2.3 2.299-3.231 5.095-2.082 6.244 1.15 1.15 3.946.218 6.245-2.081Z" /><path d="M7.492 11.818c.362.362.768.676 1.208.934l6.895 4.047c1.078.557 2.255-.075 3.692-1.512 1.437-1.437 2.07-2.614 1.512-3.692-.372-.718-1.72-3.017-4.047-6.895a6.015 6.015 0 0 0-.934-1.208" /></Icon>;
}

export function NativeAutoShapeIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 9.5a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0" /><path d="M10 12a2 2 0 0 1 2 -2h7a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-7a2 2 0 0 1 -2 -2l0 -7" /></Icon>;
}

export function NativeLaserPointerIcon(props: IconProps) {
  return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><g transform="rotate(90 10 10)"><path clipRule="evenodd" d="m9.644 13.69 7.774-7.773a2.357 2.357 0 0 0-3.334-3.334l-7.773 7.774L8 12l1.643 1.69Z" /><path d="m13.25 3.417 3.333 3.333M10 10l2-2M5 15l3-3M2.156 17.894l1-1M5.453 19.029l-.144-1.407M2.377 11.887l.866 1.118M8.354 17.273l-1.194-.758M.953 14.652l1.408.13" /></g></Icon>;
}

export function NativeMagicFrameIcon(props: IconProps) {
  return <Icon strokeWidth={2} {...props}><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M6 21l15 -15l-3 -3l-15 15l3 3" /><path d="M15 6l3 3" /><path d="M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /><path d="M19 13a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" /></Icon>;
}

export function NativeLibraryIcon(props: IconProps) {
  return <Icon strokeWidth={1.25} {...props}><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0" /><line x1="3" y1="6" x2="3" y2="19" /><line x1="12" y1="6" x2="12" y2="19" /><line x1="21" y1="6" x2="21" y2="19" /></Icon>;
}

export type NativeArrowType = "sharp" | "round" | "elbow";
export function NativeArrowTypeIcon({ type, ...props }: IconProps & { type: NativeArrowType }) {
  if (type === "round") return <Icon strokeWidth={2} {...props}><path d="M16 12 20 9l-4-3" /><path d="M6 20c0-6.075 4.925-11 11-11h3" /></Icon>;
  if (type === "elbow") return <Icon strokeWidth={2} {...props}><path d="M4 19h6c1.097 0 2-.903 2-2V9c0-1.097.903-2 2-2h7" /><path d="m18 4 3 3-3 3" /></Icon>;
  return <Icon strokeWidth={2} {...props}><path d="m6 18 12-12" /><path d="M18 10V6h-4" /></Icon>;
}

export function NativeAdjustmentsIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><circle cx="14" cy="6" r="2" /><path d="M4 6h8m4 0h4" /><circle cx="8" cy="12" r="2" /><path d="M4 12h2m4 0h10" /><circle cx="17" cy="18" r="2" /><path d="M4 18h11m4 0h1" /></Icon>;
}

export function NativeTextSizeIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><path d="M3 7V5h13v2M10 5v14M12 19H8M15 13v-1h6v1M18 12v7M17 19h2" /></Icon>;
}

export function NativePencilIcon(props: IconProps) {
  return <Icon strokeWidth={1.25} {...props}><path d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Icon>;
}

export function NativeDotsHorizontalIcon(props: IconProps) {
  return <Icon strokeWidth={1.5} {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>;
}

export function NativeFillIcon({ value, ...props }: IconProps & { value: FillStyle }) {
  if (value === "solid") return <Icon viewBox="0 0 20 20" strokeWidth={1.25} fill="currentColor" {...props}><path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" /></Icon>;
  return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><rect x="2.625" y="2.625" width="14.75" height="14.75" rx="3.254" />{value === "hachure" ? <><path d="M2.258 15.156 15.156 2.258M7.324 20.222 20.222 7.325" /><path d="m-.222 12.675 12.897-12.897M4.518 18.118 17.416 5.22" /></> : <><path d="M2.426 15.044 15.044 2.426M7.383 20 20 7.383M0 12.617 12.617 0M4.637 17.941 17.256 5.324" /><path d="M15.045 17.574 2.426 4.956M20 12.617 7.383 0M12.617 20 0 7.383M17.941 15.363 5.324 2.745" /></>}</Icon>;
}

export type NativeStrokeWidth = "thin" | "medium" | "bold";
export function NativeStrokeWidthIcon({ value, ...props }: IconProps & { value: NativeStrokeWidth }) {
  const width = value === "thin" ? 1.25 : value === "medium" ? 2.5 : 3.75;
  return <Icon viewBox="0 0 20 20" strokeWidth={width} {...props}><path d="M5 10h10" /></Icon>;
}

export function NativeStrokeStyleIcon({ value, ...props }: IconProps & { value: StrokeStyle }) {
  if (value === "solid") return <Icon viewBox="0 0 40 20" strokeWidth={2} {...props}><path d="M6 10h28" /></Icon>;
  if (value === "dashed") return <Icon strokeWidth={2} {...props}><path d="M5 12h2m4 0h2m4 0h2" /></Icon>;
  return <Icon strokeWidth={2} {...props}><path d="M4 12v.01M8 12v.01M12 12v.01M16 12v.01M20 12v.01" /></Icon>;
}

export function NativeSloppinessIcon({ value, ...props }: IconProps & { value: number }) {
  if (value === 0) return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><path d="M2.5 12.038c1.655-.885 5.9-3.292 8.568-4.354 2.668-1.063.101 2.821 1.32 3.104 1.218.283 5.112-1.814 5.112-1.814" /></Icon>;
  if (value === 1) return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><path d="M2.5 12.563c1.655-.886 5.9-3.293 8.568-4.355 2.668-1.062.101 2.822 1.32 3.105 1.218.283 5.112-1.814 5.112-1.814m-13.469 2.23c2.963-1.586 6.13-5.62 7.468-4.998 1.338.623-1.153 4.11-.132 5.595 1.02 1.487 6.133-1.43 6.133-1.43" /></Icon>;
  return <Icon viewBox="0 0 20 20" strokeWidth={1.25} {...props}><path d="M2.5 11.936c1.737-.879 8.627-5.346 10.42-5.268 1.795.078-.418 5.138.345 5.736.763.598 3.53-1.789 4.235-2.147M2.929 9.788c1.164-.519 5.47-3.28 6.987-3.114 1.519.165 1 3.827 2.121 4.109 1.122.281 3.839-2.016 4.606-2.42" /></Icon>;
}

export function NativePressureIcon({ value, ...props }: IconProps & { value: StrokeVariability }) {
  const widths = value === "constant" ? [1, 1, 1, 1] : [1.5, 2, 2.75, 3.25];
  return <Icon {...props}><path d="M4 12c1-4 2-4 4 0" strokeWidth={widths[0]} /><path d="M8 12c1 4 2 4 4 0" strokeWidth={widths[1]} /><path d="M12 12c2-4 3-4 4 0" strokeWidth={widths[2]} /><path d="M16 12c1 4 2 4 3 0" strokeWidth={widths[3]} /></Icon>;
}

export function NativeEdgeIcon({ value, ...props }: IconProps & { value: "sharp" | "round" }) {
  if (value === "round") return <Icon strokeWidth={1.5} {...props}><path d="M4 12V8a4 4 0 0 1 4-4h4" /><path d="M16 4h.01M20 4h.01M20 8h.01M20 12h.01M4 16h.01M20 16h.01M4 20h.01M8 20h.01M12 20h.01M16 20h.01M20 20h.01" /></Icon>;
  return <Icon viewBox="0 0 20 20" strokeWidth={1.5} {...props}><path d="M3.333 10V3.336C4.952 3.334 6.063 3.333 6.667 3.333H10" /><path d="M13.333 3.333h.01M16.667 3.333h.01M16.667 6.667h.01M16.667 10h.01M3.333 13.333h.01M16.667 13.333h.01M3.333 16.667h.01M6.667 16.667h.01M10 16.667h.01M13.333 16.667h.01M16.667 16.667h.01" /></Icon>;
}

export function NativeTextAlignIcon({ value, ...props }: IconProps & { value: TextAlign }) {
  if (value === "center") return <Icon strokeWidth={1.5} {...props}><path d="M4 8h16M8 12h8M6 16h12" /></Icon>;
  if (value === "right") return <Icon strokeWidth={1.5} {...props}><path d="M4 8h16M10 12h10M8 16h12" /></Icon>;
  return <Icon strokeWidth={1.5} {...props}><path d="M4 8h16M4 12h8M4 16h12" /></Icon>;
}

export function NativeArrowheadIcon({ value, flip = false, ...props }: IconProps & { value: Arrowhead | null; flip?: boolean }) {
  const transform = flip ? "translate(40, 0) scale(-1, 1)" : undefined;
  if (value === null) return <Icon viewBox="0 0 40 22" strokeWidth={2} opacity={0.5} {...props}><g transform={transform}><path d="M7 11h12" /><path d="m25 6 8 10m0-10-8 10" /></g></Icon>;
  if (value === "arrow") return <Icon viewBox="0 0 40 22" strokeWidth={2} {...props}><g transform={transform}><path d="M7 11h26M23 5l10 6-10 6" /></g></Icon>;
  if (value === "triangle" || value === "triangle_outline") return <Icon viewBox="0 0 40 22" strokeWidth={2} {...props}><g transform={transform}><path d="M7 11h16" /><path d="m23 5 12 6-12 6Z" fill={value === "triangle" ? "currentColor" : "none"} /></g></Icon>;
  if (value === "circle" || value === "circle_outline") return <Icon viewBox="0 0 40 22" strokeWidth={2} {...props}><g transform={transform}><path d="M7 11h18" /><circle cx="29" cy="11" r="4" fill={value === "circle" ? "currentColor" : "none"} /></g></Icon>;
  if (value === "diamond" || value === "diamond_outline") return <Icon viewBox="0 0 40 22" strokeWidth={2} {...props}><g transform={transform}><path d="M7 11h14" /><path d="m21 11 7-6 7 6-7 6Z" fill={value === "diamond" ? "currentColor" : "none"} /></g></Icon>;
  return <Icon viewBox="0 0 40 22" strokeWidth={2} {...props}><g transform={transform}><path d="M11 11h20M31 5v12" /></g></Icon>;
}
