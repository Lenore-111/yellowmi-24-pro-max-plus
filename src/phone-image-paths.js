// Only our account-owned image files can be attached to a phone save.
export function phoneImagePath(value) {
  return typeof value === 'string' && /^\/?user\/files\/world-phone-image-[a-zA-Z0-9-]+\.(?:png|jpg|webp)$/.test(value)
    ? '/' + value.replace(/^\//, '') : '';
}
