export function resolveRendererDevUrl(packaged: boolean, inherited: string | undefined) {
  if (packaged) return
  return inherited
}
