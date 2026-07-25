// Canonical domain/property normalization shared by dedupe, project creation and
// binding. Handles the many shapes a GSC property can take:
//   sc-domain:example.com  ·  https://example.com/  ·  https://www.example.com/
//   https://example.com/subfolder/  ·  http://example.com:8080/  ·  пример.рф (IDN)
// Rules: lowercase host, strip a single leading "www.", drop default ports, keep
// significant subdomains and the path (for URL-prefix properties). IDN → punycode.

export interface NormalizedProperty {
  host: string; // canonical host: lowercased, www-stripped, punycode
  path: string; // "" for root / domain properties, else "/sub/path" (no trailing slash)
  isDomainProperty: boolean; // true when the input was an sc-domain: property
  raw: string; // the original input
}

function toPunycodeHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return "";
  try {
    // new URL handles IDN → punycode in its hostname getter.
    return new URL(`http://${h}`).hostname;
  } catch {
    return h;
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/** Full normalization of a GSC property string. */
export function normalizeGscProperty(input: string): NormalizedProperty {
  const raw = String(input ?? "").trim();

  // sc-domain: properties cover the whole domain (all subdomains + protocols).
  if (/^sc-domain:/i.test(raw)) {
    const host = stripWww(toPunycodeHost(raw.replace(/^sc-domain:/i, "")));
    return { host, path: "", isDomainProperty: true, raw };
  }

  // URL-prefix (or bare host) properties.
  let urlStr = raw;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;
  try {
    const u = new URL(urlStr);
    const host = stripWww(u.hostname.toLowerCase());
    let path = u.pathname.replace(/\/+$/, ""); // drop trailing slash(es)
    if (path === "/") path = "";
    return { host, path, isDomainProperty: false, raw };
  } catch {
    const host = stripWww(toPunycodeHost(raw));
    return { host, path: "", isDomainProperty: false, raw };
  }
}

/**
 * A stable key for dedupe / "does a Topvisor project already exist for this domain".
 * Domain properties and URL-prefix properties on the same host collapse to the same
 * host key; callers decide whether to also compare the path.
 */
export function domainKey(input: string): string {
  return normalizeGscProperty(input).host;
}

/** The bare registrable host (for display and Topvisor project `url`). */
export function displayHost(input: string): string {
  return normalizeGscProperty(input).host;
}

/** True when two GSC properties refer to the same registrable host. */
export function sameDomain(a: string, b: string): boolean {
  const ka = domainKey(a);
  const kb = domainKey(b);
  return ka !== "" && ka === kb;
}
