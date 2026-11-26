const LOOPBACK_HOSTS = new Set(['localhost', '[::1]'])
const SECURE_PROTOCOLS = new Set(['https:', 'wss:'])
const PLAIN_PROTOCOLS = new Set(['http:', 'ws:'])
const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

export function isTrustworthyOrigin(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (SECURE_PROTOCOLS.has(url.protocol)) return true
  if (!PLAIN_PROTOCOLS.has(url.protocol)) return false
  const host = url.hostname
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost') || IPV4_LOOPBACK.test(host)
}
