function copySnapshot(snapshot) {
  return { ...snapshot, news: structuredClone(snapshot.news || []), forums: structuredClone(snapshot.forums || []) };
}

function keepProjection(item, latest) {
  const raw = item.raw || {};
  if (!raw.phoneFeed) return false;
  if (raw.sourceKind === 'sandbox' && raw.nonCanon) return true;
  if (raw.sourceKind !== 'moment') return false;
  const prefix = `phonefeed_${raw.phonePlatform}_moment_`;
  const id = raw.sourceMomentId || (raw.id?.startsWith(prefix) ? raw.id.slice(prefix.length) : '');
  return Boolean(id && (latest.moments || []).some(moment => moment.id === id));
}

function versions(items) {
  return new Map(items.map(item => [item.id, JSON.stringify([
    item.author, item.title, item.body, item.scope, item.heat,
    item.replies, item.imageUrl, item.imageUrls,
  ])]));
}

// Hold the currently read public cards until the reader accepts incoming changes.
// Removed/revoked cards are always removed immediately, even while buffering.
export function createSocialFeedReader(buildItems) {
  const views = new Map();
  return {
    clear() { views.clear(); },
    select(platform, latest, { newView = false, accept = false } = {}) {
      let view = views.get(platform);
      if (!view || newView || accept || !latest.connected || !buildItems(platform, view.snapshot).length) {
        view = { snapshot: copySnapshot(latest), added: 0, updated: 0, displayChanged: true };
        views.set(platform, view); return view;
      }
      const liveNews = new Set((latest.news || []).map(item => item.id));
      const liveForums = new Set((latest.forums || []).map(item => item.id));
      const keepForum = item => liveForums.has(item.id) || keepProjection(item, latest);
      const keepNews = item => liveNews.has(item.id) || keepProjection(item, latest);
      view.displayChanged = view.snapshot.news.some(item => !keepNews(item))
        || view.snapshot.forums.some(item => !keepForum(item));
      view.snapshot = { ...view.snapshot,
        news: view.snapshot.news.filter(keepNews),
        forums: view.snapshot.forums.filter(keepForum),
      };
      const before = versions(buildItems(platform, view.snapshot));
      const after = versions(buildItems(platform, latest));
      view.added = 0; view.updated = 0;
      for (const [id, version] of after) {
        if (!before.has(id)) view.added++;
        else if (before.get(id) !== version) view.updated++;
      }
      return view;
    },
  };
}
