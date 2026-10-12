function decode(value) {
  try { return { value: JSON.parse(value), partial: false }; } catch { return null; }
}

// Recover only fully closed, independently valid JSON objects from a truncated
// posts array. Never close strings or invent the missing end of a post.
function completePosts(value) {
  const prefix = value.match(/^\{\s*"posts"\s*:\s*\[/);
  if (!prefix) return null;
  const posts = [];
  let position = prefix[0].length;
  while (position < value.length) {
    while (/\s/.test(value[position] || '') && position < value.length) position++;
    if (position === value.length || /^\]\s*$/.test(value.slice(position))) return posts.length ? posts : null;
    if (value[position] !== '{') return null;
    const start = position, stack = [];
    let quoted = false, escaped = false, closed = false;
    for (; position < value.length; position++) {
      const character = value[position];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === '{' || character === '[') stack.push(character);
      else if (character === '}' || character === ']') {
        if (stack.pop() !== (character === '}' ? '{' : '[')) return null;
        if (!stack.length) { position++; closed = true; break; }
      }
    }
    if (!closed) return posts.length ? posts : null;
    const post = decode(value.slice(start, position));
    if (!post || !post.value || typeof post.value !== 'object' || Array.isArray(post.value)) return null;
    posts.push(post.value);
    while (/\s/.test(value[position] || '') && position < value.length) position++;
    if (position === value.length || /^\]\s*$/.test(value.slice(position))) return posts;
    if (value[position++] !== ',') return null;
  }
  return posts.length ? posts : null;
}

export function parsePhoneGameResponse(raw, { feed = false } = {}) {
  const value = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed = decode(value);
  if (!parsed) {
    const start = value.indexOf('{'), end = value.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = decode(value.slice(start, end + 1));
  }
  if (parsed) {
    if (feed && !Array.isArray(parsed.value?.posts)) throw new Error('模型没有返回有效动态，请重新刷新。已有帖子已保留。');
    return parsed;
  }
  if (feed) {
    const posts = completePosts(value);
    if (posts) return { value: { posts }, partial: true };
    const truncated = /^\{\s*"posts"\s*:\s*\[/.test(value) && !/\}\s*$/.test(value);
    throw new Error(truncated ? '动态内容被截断，没有完整帖子可保存，请重新刷新。已有帖子已保留。' : '模型没有返回有效动态，请重新刷新。已有帖子已保留。');
  }
  throw new Error('模型没有返回有效内容，互动已保存，可重试回应。');
}
