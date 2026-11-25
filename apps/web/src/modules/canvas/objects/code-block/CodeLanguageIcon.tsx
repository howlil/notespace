import { cn } from "../../../../shared/ui";

export function CodeLanguageIcon({ language, className }: { language: string; className?: string }) {
  const cls = cn("size-4 shrink-0", className);

  switch (language) {
    case "javascript":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#F7DF1E" />
          <text x="8.5" y="12.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#1E1E1E">JS</text>
        </svg>
      );
    case "typescript":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#3178C6" />
          <text x="8.2" y="12.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#FFFFFF">TS</text>
        </svg>
      );
    case "python":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <path d="M7.9 1.5c-2.9 0-2.7 1.3-2.7 1.3v1.3h2.8v.4H4.1S2 4.3 2 7.4s1.8 3 1.8 3h1.1V8.9s-.1-1.8 1.8-1.8h3s1.7 0 1.7-1.6V3.1S11.6 1.5 7.9 1.5zm-1.6 1a.55.55 0 1 1 0 1.1.55.55 0 0 1 0-1.1z" fill="#3776AB" />
          <path d="M8.1 14.5c2.9 0 2.7-1.3 2.7-1.3v-1.3H8v-.4h3.9s2.1.2 2.1-2.9-1.8-3-1.8-3h-1.1v1.5s.1 1.8-1.8 1.8h-3s-1.7 0-1.7 1.6v2.4s-.2 1.6 3.5 1.6zm1.6-1a.55.55 0 1 1 0-1.1.55.55 0 0 1 0 1.1z" fill="#FFD43B" />
        </svg>
      );
    case "go":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#00ADD8" />
          <text x="8" y="11.5" textAnchor="middle" fontSize="8" fontWeight="800" fontStyle="italic" fontFamily="system-ui, sans-serif" fill="#FFFFFF">Go</text>
        </svg>
      );
    case "java":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <path d="M6.2 6.8c.5-.8 1.6-1 1.4-2.2-.1-.5-.5-.9-.4-1.5.1-.5.6-.9.9-1.1-.3.8.5 1.1.7 1.9.2.9-.4 1.6-1.1 2.2-.4.3-.9.6-1.5.7z" fill="#E76F00" />
          <path d="M8.8 6.4c.4-.5 1-.8.9-1.6-.1-.4-.3-.6-.3-1 .3.3.9.7.8 1.5-.1.6-.7 1-1.4 1.1z" fill="#E76F00" />
          <path d="M3.5 8h7.5v2.4a3 3 0 0 1-3 3H6.5a3 3 0 0 1-3-3V8z" fill="#5382A1" />
          <path d="M11 8.6h1.2a1.4 1.4 0 0 1 0 2.8H11" fill="none" stroke="#5382A1" strokeWidth="1.2" />
          <path d="M3 14.2h8.5" stroke="#E76F00" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "rust":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <circle cx="8" cy="8" r="6.3" fill="none" stroke="#CE422B" strokeWidth="1.7" strokeDasharray="2.2 1.1" />
          <circle cx="8" cy="8" r="4.6" fill="#CE422B" />
          <text x="8.1" y="11" textAnchor="middle" fontSize="8" fontWeight="800" fontFamily="Georgia, serif" fill="#FFFFFF">R</text>
        </svg>
      );
    case "c":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" fill="#5C6BC0" />
          <text x="8" y="11.2" textAnchor="middle" fontSize="8.8" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#FFFFFF">C</text>
        </svg>
      );
    case "cpp":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" fill="#00599C" />
          <text x="8" y="10.7" textAnchor="middle" fontSize="6.6" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#FFFFFF">C++</text>
        </svg>
      );
    case "csharp":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <polygon points="8,1.2 14,4.6 14,11.4 8,14.8 2,11.4 2,4.6" fill="#68217A" />
          <text x="8" y="11" textAnchor="middle" fontSize="7.4" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#FFFFFF">C#</text>
        </svg>
      );
    case "bash":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#293138" />
          <path d="M3.5 5.2L6.8 8l-3.3 2.8" fill="none" stroke="#4EAA25" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 10.8h4" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "json":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#F59E0B" fillOpacity="0.16" />
          <text x="8" y="11.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fontFamily="monospace" fill="#D97706">{"{}"}</text>
        </svg>
      );
    case "sql":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <ellipse cx="8" cy="4" rx="5.2" ry="2.2" fill="#336791" />
          <path d="M2.8 4v3.8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V4" fill="none" stroke="#336791" strokeWidth="1.4" />
          <path d="M2.8 7.8v3.8c0 1.2 2.3 2.2 5.2 2.2s5.2-1 5.2-2.2V7.8" fill="none" stroke="#336791" strokeWidth="1.4" />
        </svg>
      );
    case "xml":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <path d="M2.5 2h11l-1 10.6L8 14.2l-4.5-1.6L2.5 2z" fill="#E34F26" />
          <path d="M6.4 6.2L4.7 8l1.7 1.8M9.6 6.2L11.3 8l-1.7 1.8" fill="none" stroke="#FFFFFF" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "css":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <path d="M2.5 2h11l-1 10.6L8 14.2l-4.5-1.6L2.5 2z" fill="#1572B6" />
          <path d="M5.2 5.5h5.6l-.3 2.4H6.2l.1 1.3h3.9l-.2 1.8-2 .6-2-.6-.1-1.1" fill="none" stroke="#FFFFFF" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "yaml":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect width="16" height="16" rx="3" fill="#CB171E" />
          <text x="8" y="11.8" textAnchor="middle" fontSize="8.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#FFFFFF">Y</text>
        </svg>
      );
    case "markdown":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect x="1" y="2.8" width="14" height="10.4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
          <path d="M3.6 10.5V5.5l2.2 2.4L8 5.5v5M11.4 5.5v4.6m-1.5-1.5l1.5 1.6 1.5-1.6" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "auto":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <path d="M8 2l1.3 3.7L13 7l-3.7 1.3L8 12l-1.3-3.7L3 7l3.7-1.3L8 2z" fill="currentColor" opacity="0.85" />
          <circle cx="12.5" cy="12" r="1.1" fill="currentColor" opacity="0.6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden="true">
          <rect x="2.5" y="2" width="11" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.65" />
          <path d="M5 5.8h6M5 8.2h6M5 10.6h4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
        </svg>
      );
  }
}
