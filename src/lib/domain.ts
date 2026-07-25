/**
 * Domain normalizasyonu (lisans doğrulama API'si ve domain kayıtları için).
 * - http:// veya https:// (ve diğer şemalar) temizlenir
 * - userinfo, port, path, query, fragment atılır
 * - lowercase yapılır, sondaki nokta(lar) kırpılır
 * Geçersiz girişte null döner.
 */
const DOMAIN_LABEL_RE =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

export function normalizeDomain(input: string): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // şema (http://, https://, ftp:// vb.)
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // path / query / fragment
  value = value.split("/")[0].split("?")[0].split("#")[0];
  // userinfo (user:pass@host)
  const at = value.lastIndexOf("@");
  if (at !== -1) value = value.slice(at + 1);
  // port
  value = value.replace(/:\d+$/, "");
  // sondaki nokta(lar)
  value = value.replace(/\.+$/, "");

  if (!value || value.length > 253) return null;
  if (!DOMAIN_LABEL_RE.test(value)) return null;
  return value;
}
