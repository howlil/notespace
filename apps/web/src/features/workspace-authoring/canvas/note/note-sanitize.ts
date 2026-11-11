function safeHref(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/workspaces/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizePastedHTML(html: string) {
  if (typeof DOMParser === "undefined") return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,object,embed,form,template").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
    if (element.hasAttribute("href") && !safeHref(element.getAttribute("href") ?? "")) element.removeAttribute("href");
    if (element.hasAttribute("src")) {
      const source = element.getAttribute("src") ?? "";
      if (element.tagName.toLowerCase() !== "img" || !source.startsWith("/api/workspaces/") || source.startsWith("//")) element.removeAttribute("src");
    }
  });
  return document.body.innerHTML;
}
