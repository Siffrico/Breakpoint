// Pure helpers for the Notion-style composer.
// Two responsibilities:
//   1. Markdown <-> contentEditable HTML conversion (so the textarea draft
//      and the rich editor share a single source of truth: markdown).
//   2. DOM mutations the editor needs (block conversion, list nesting,
//      caret placement). Kept here so the React component stays focused.

type BlockMatch =
  | { type: "h1" | "h2" | "h3"; rest: string }
  | { type: "ul" | "ol" | "quote"; rest: string };

const HEADING_RE = /^(#{1,3})\s(.*)$/;
const UL_RE = /^[-*+]\s(.*)$/;
const OL_RE = /^\d+\.\s(.*)$/;
const QUOTE_RE = /^>\s(.*)$/;

export function matchMarkdownTrigger(text: string): BlockMatch | null {
  const heading = HEADING_RE.exec(text);
  if (heading) {
    const level = heading[1].length as 1 | 2 | 3;
    return { type: `h${level}`, rest: heading[2] ?? "" };
  }
  const ul = UL_RE.exec(text);
  if (ul) return { type: "ul", rest: ul[1] ?? "" };
  const ol = OL_RE.exec(text);
  if (ol) return { type: "ol", rest: ol[1] ?? "" };
  const quote = QUOTE_RE.exec(text);
  if (quote) return { type: "quote", rest: quote[1] ?? "" };
  return null;
}

// --- selection / DOM helpers ----------------------------------------------

export function getDirectChildBlock(
  root: HTMLElement,
  anchor: Node | null,
): HTMLElement | null {
  if (!anchor) return null;
  let node: Node | null = anchor;
  while (node && node.parentNode !== root) {
    node = node.parentNode;
  }
  return node instanceof HTMLElement ? node : null;
}

export function getAncestorLi(anchor: Node | null): HTMLLIElement | null {
  let node: Node | null = anchor;
  while (node) {
    if (node instanceof HTMLLIElement) return node;
    node = node.parentNode;
  }
  return null;
}

export function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function emptyWithBr(el: HTMLElement) {
  el.innerHTML = "";
  el.appendChild(document.createElement("br"));
}

export function ensureEditorHasBlock(root: HTMLElement) {
  if (root.children.length === 0) {
    const p = document.createElement("p");
    emptyWithBr(p);
    root.appendChild(p);
  }
}

export function replaceBlockWithTag(
  block: HTMLElement,
  tag: string,
  restText: string,
) {
  const next = document.createElement(tag);
  if (restText) {
    next.textContent = restText;
  } else {
    emptyWithBr(next);
  }
  block.replaceWith(next);
  placeCaretAtEnd(next);
}

export function convertBlockToList(
  block: HTMLElement,
  listTag: "ul" | "ol",
  restText: string,
) {
  const list = document.createElement(listTag);
  const li = document.createElement("li");
  if (restText) li.textContent = restText;
  else emptyWithBr(li);
  list.appendChild(li);
  block.replaceWith(list);
  placeCaretAtEnd(li);
}

// Indent in a list = nest current LI under the previous sibling LI.
// Indent outside a list = convert current paragraph into a bullet.
export function indentOrStartBullet(root: HTMLElement, anchor: Node | null) {
  const li = getAncestorLi(anchor);
  if (li) {
    const prev = li.previousElementSibling as HTMLLIElement | null;
    const parentList = li.parentElement;
    if (!prev || !parentList) return;
    let nested = prev.querySelector(":scope > ul, :scope > ol");
    if (!nested) {
      nested = document.createElement(parentList.tagName.toLowerCase());
      prev.appendChild(nested);
    }
    nested.appendChild(li);
    placeCaretAtEnd(li);
    return;
  }
  const block = getDirectChildBlock(root, anchor);
  if (!block) return;
  const text = block.textContent;
  convertBlockToList(block, "ul", text);
}

export function outdent(anchor: Node | null) {
  const li = getAncestorLi(anchor);
  if (!li) return;
  const parentList = li.parentElement;
  if (!parentList) return;
  const grandparent = parentList.parentElement;
  if (!grandparent) return;

  if (grandparent.tagName === "LI") {
    const greatList = grandparent.parentElement;
    if (!greatList) return;
    greatList.insertBefore(li, grandparent.nextSibling);
    if (parentList.children.length === 0) parentList.remove();
    placeCaretAtEnd(li);
    return;
  }

  const p = document.createElement("p");
  p.innerHTML = li.innerHTML || "<br>";
  parentList.parentElement.insertBefore(p, parentList.nextSibling);
  li.remove();
  if (parentList.children.length === 0) parentList.remove();
  placeCaretAtEnd(p);
}

// Enter on an empty <li> exits the list (one level). Notion does this too.
export function exitEmptyListItem(li: HTMLLIElement) {
  const parentList = li.parentElement;
  if (!parentList) return;
  const grandparent = parentList.parentElement;

  if (grandparent?.tagName === "LI") {
    const greatList = grandparent.parentElement;
    if (greatList) {
      const newLi = document.createElement("li");
      emptyWithBr(newLi);
      greatList.insertBefore(newLi, grandparent.nextSibling);
      li.remove();
      if (parentList.children.length === 0) parentList.remove();
      placeCaretAtEnd(newLi);
      return;
    }
  }

  const p = document.createElement("p");
  emptyWithBr(p);
  parentList.parentElement?.insertBefore(p, parentList.nextSibling);
  li.remove();
  if (parentList.children.length === 0) parentList.remove();
  placeCaretAtEnd(p);
}

// --- markdown <-> html ----------------------------------------------------

const ESCAPE_HTML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESCAPE_HTML[c] ?? c);
}

function inlineMarkdownToHtml(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<![\w])_([^_\n]+)_(?![\w])/g, "<em>$1</em>");
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  return t;
}

export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  const lines = md.split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToHtml(heading[2] ?? "")}</h${level}>`);
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      blocks.push(
        `<blockquote>${inlineMarkdownToHtml(line.replace(/^>\s/, ""))}</blockquote>`,
      );
      i++;
      continue;
    }
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i] ?? "")) {
        items.push(
          `<li>${inlineMarkdownToHtml((lines[i] ?? "").replace(/^[-*+]\s/, ""))}</li>`,
        );
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i] ?? "")) {
        items.push(
          `<li>${inlineMarkdownToHtml((lines[i] ?? "").replace(/^\d+\.\s/, ""))}</li>`,
        );
        i++;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    blocks.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
    i++;
  }
  return blocks.join("");
}

function serializeInline(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    const tag = node.tagName;
    if (tag === "BR") {
      out += "\n";
      continue;
    }
    if (tag === "STRONG" || tag === "B") {
      out += `**${serializeInline(node)}**`;
      continue;
    }
    if (tag === "EM" || tag === "I") {
      out += `_${serializeInline(node)}_`;
      continue;
    }
    if (tag === "U") {
      // Markdown has no underline; pass through as-is text.
      out += serializeInline(node);
      continue;
    }
    if (tag === "CODE") {
      out += "`" + serializeInline(node) + "`";
      continue;
    }
    if (tag === "UL" || tag === "OL") continue;
    out += serializeInline(node);
  }
  return out;
}

function serializeBlock(el: Element, lines: string[], indent: number) {
  const pad = "  ".repeat(indent);
  switch (el.tagName) {
    case "H1":
      lines.push(`${pad}# ${serializeInline(el)}`);
      lines.push("");
      return;
    case "H2":
      lines.push(`${pad}## ${serializeInline(el)}`);
      lines.push("");
      return;
    case "H3":
      lines.push(`${pad}### ${serializeInline(el)}`);
      lines.push("");
      return;
    case "BLOCKQUOTE":
      lines.push(`${pad}> ${serializeInline(el)}`);
      lines.push("");
      return;
    case "UL":
    case "OL": {
      const ordered = el.tagName === "OL";
      let n = 1;
      for (const child of Array.from(el.children)) {
        if (child.tagName !== "LI") continue;
        const marker = ordered ? `${n}.` : "-";
        lines.push(`${pad}${marker} ${serializeInline(child)}`);
        for (const grand of Array.from(child.children)) {
          if (grand.tagName === "UL" || grand.tagName === "OL") {
            serializeBlock(grand, lines, indent + 1);
          }
        }
        n++;
      }
      if (indent === 0) lines.push("");
      return;
    }
    case "BR":
      return;
    default:
      lines.push(`${pad}${serializeInline(el)}`);
      lines.push("");
  }
}

export function htmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = [];
  for (const child of Array.from(root.children)) {
    serializeBlock(child, lines, 0);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
