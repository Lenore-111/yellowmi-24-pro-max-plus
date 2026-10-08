function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"\']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "\'": '&#39;',
  }[char]));
}

export function findMessageMatches(messages, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  return (Array.isArray(messages) ? messages : []).flatMap((message, index) =>
    String(message?.text ?? '').toLowerCase().includes(needle) ? [index] : []);
}

export function highlightMessageText(value, query) {
  const source = String(value ?? '');
  const needle = String(query ?? '').trim();
  if (!needle) return escapeHtml(source);
  const haystack = source.toLowerCase();
  const target = needle.toLowerCase();
  let cursor = 0;
  let html = '';
  while (cursor < source.length) {
    const index = haystack.indexOf(target, cursor);
    if (index < 0) break;
    html += escapeHtml(source.slice(cursor, index));
    html += '<mark class="wp-wx-highlight">' + escapeHtml(source.slice(index, index + needle.length)) + '</mark>';
    cursor = index + needle.length;
  }
  return html + escapeHtml(source.slice(cursor));
}
