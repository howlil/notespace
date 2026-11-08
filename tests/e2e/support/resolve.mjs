/* Playwright-compatible element resolution for the Notespace browser suite.
 *
 * `resolveInPage` runs inside the page as a single self-contained function: it
 * understands explicit and implicit roles, author/content accessible names,
 * `aria-hidden`/hidden subtrees, and scoped lookups by re-resolving each scope in
 * the same page call, so a React re-render can never orphan a scope selector.
 */
export function resolveInPage(config) {
  function normalize(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  const NAME_FROM_CONTENT = new Set([
    "button", "link", "heading", "menuitem", "option", "tab", "treeitem", "cell", "list", "listitem", "tooltip",
  ]);

  function explicitRole(element) {
    const value = element.getAttribute("role");
    return value ? value.trim().split(/\s+/)[0] : null;
  }

  function implicitRole(element) {
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") ?? "").toLowerCase();
    switch (tag) {
      case "button": return "button";
      case "a": return element.hasAttribute("href") ? "link" : null;
      case "textarea": return "textbox";
      case "select": return element.multiple ? "listbox" : "combobox";
      case "option": return "option";
      case "nav": return "navigation";
      case "main": return "main";
      case "aside": return "complementary";
      case "dialog": return "dialog";
      case "hr": return "separator";
      case "ul":
      case "ol":
      case "menu": return "list";
      case "li": return "listitem";
      case "img": return "img";
      case "output": return "status";
      case "fieldset": return "group";
      case "section": {
        const labelled = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
        return labelled ? "region" : null;
      }
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": return "heading";
      case "input": {
        if (["button", "submit", "reset", "image"].includes(type)) return "button";
        if (["checkbox", "radio", "range", "file", "color", "hidden"].includes(type)) return null;
        if (type === "search") return "searchbox";
        return "textbox";
      }
      default: return null;
    }
  }

  function roleOf(element) {
    return explicitRole(element) ?? implicitRole(element);
  }

  function hiddenFromAccessibility(element) {
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.getAttribute("aria-hidden") === "true" || node.hasAttribute("hidden") || node.inert) return true;
    }
    if (typeof element.checkVisibility === "function") {
      return !element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
    }
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function accessibleName(element, elementRole) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const fromIds = labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      if (normalize(fromIds)) return normalize(fromIds);
    }
    const label = element.getAttribute("aria-label");
    if (label) return normalize(label);
    if (element.tagName.toLowerCase() === "img") return normalize(element.getAttribute("alt"));
    const tag = element.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (element.id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (explicit) return normalize(explicit.textContent);
      }
      const wrapping = element.closest("label");
      if (wrapping) return normalize(wrapping.textContent);
      const type = (element.getAttribute("type") ?? "").toLowerCase();
      if (tag === "input" && ["button", "submit", "reset"].includes(type)) return normalize(element.value);
      return normalize(element.getAttribute("title"));
    }
    if (NAME_FROM_CONTENT.has(elementRole)) return normalize(element.textContent);
    return normalize(element.getAttribute("title"));
  }

  function nameMatches(value, spec) {
    if (spec.pattern === null) return true;
    if (spec.flags !== null) return new RegExp(spec.pattern, spec.flags).test(value);
    if (spec.exact) return value === spec.pattern;
    return value.toLowerCase().includes(spec.pattern.toLowerCase());
  }

  function matchesSpec(element, spec) {
    if (hiddenFromAccessibility(element)) return false;
    if (spec.exclude !== null && new RegExp(spec.exclude, spec.excludeFlags ?? "").test(accessibleName(element, spec.role))) {
      return false;
    }
    if (spec.hasText !== null && !new RegExp(spec.hasText, spec.hasTextFlags ?? "").test(normalize(element.textContent))) {
      return false;
    }
    if (spec.kind === "text") return nameMatches(normalize(element.textContent), spec);
    if (roleOf(element) !== spec.role) return false;
    if (spec.level && element.tagName.toLowerCase() !== `h${spec.level}`) return false;
    return nameMatches(accessibleName(element, spec.role), spec);
  }

  function candidatesIn(root, spec) {
    const all = [...root.querySelectorAll("*")].filter((element) => matchesSpec(element, spec));
    if (spec.kind !== "text") return all;
    // Playwright resolves text to the innermost, smallest matching element.
    const innermost = all.filter((element) => ![...element.children].some((child) => all.includes(child)));
    innermost.sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length);
    return innermost.filter((element, position) => innermost
      .findIndex((other) => normalize(other.textContent) === normalize(element.textContent)) === position);
  }

  /**
   * @param {object} config { spec, scopeChain, nonce }
   *   spec: the description of the element to find
   *   scopeChain: array of specs, outermost first
   */

  const attribute = `data-wdio-${config.nonce}`;
  let root = document;
  for (const scopeSpec of config.scopeChain ?? []) {
    const [scope] = candidatesIn(root, scopeSpec);
    if (!scope) return { found: 0 };
    root = scope;
  }
  const candidates = candidatesIn(root, config.spec);
  candidates.forEach((element, position) => element.setAttribute(attribute, String(position)));
  return { found: candidates.length, attribute };
}
