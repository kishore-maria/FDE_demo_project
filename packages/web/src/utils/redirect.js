/** Only allow in-app redirects ("/orders"), never absolute URLs, to avoid open redirects. */
export function safeRedirect(value, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
