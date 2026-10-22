const HTML_ATTRIBUTE_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
}

/** Escape untrusted text before interpolating it into a quoted HTML attribute. */
export const escapeHtmlAttribute = (value: string) =>
  value.replace(/[&"'<>]/g, (character) => HTML_ATTRIBUTE_ESCAPES[character])
