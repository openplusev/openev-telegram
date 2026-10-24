export function esc(text: string | number): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function link(url: string, label: string): string {
  return `<a href="${esc(url)}">${esc(label)}</a>`;
}
