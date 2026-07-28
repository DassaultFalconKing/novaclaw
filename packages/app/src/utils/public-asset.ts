export function publicAssetUrl(path: string, base = import.meta.env.BASE_URL, documentUrl = document.baseURI) {
  return new URL(path.replace(/^\/+/, ""), new URL(base, documentUrl)).href
}
