import { isSafeNoteLink } from "../../../../domain/note/note";

export function sanitizePastedHTML(html: string) {
  if (typeof DOMParser === "undefined") return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,iframe,object,embed,form,template").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
    if (element.hasAttribute("href") && !isSafeNoteLink(element.getAttribute("href") ?? "")) element.removeAttribute("href");
    if (element.hasAttribute("src")) {
      const source = element.getAttribute("src") ?? "";
      if (element.tagName.toLowerCase() !== "img" || !source.startsWith("/api/workspaces/") || source.startsWith("//")) element.removeAttribute("src");
    }
  });
  return document.body.innerHTML;
}
