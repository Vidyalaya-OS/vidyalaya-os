import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api, authHeaders } from "./api";
import { absolute, apiUrl } from "./server";

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
}

async function fetchTo(url: string, name: string) {
  const target = new File(Paths.cache, safeName(name));
  const get = () => File.downloadFileAsync(url, target, { headers: authHeaders(), idempotent: true });
  try {
    return await get();
  } catch {
    // The login token may have just expired: refresh it once and retry.
    await api("auth/me", { school: null });
    return get();
  }
}

/** Download a file with the login token (files are never public), then open
 * the share sheet so it can be saved, opened in another app or sent. */
export async function download(pathOrUrl: string, name: string) {
  const url = pathOrUrl.startsWith("/api/") || /^https?:/.test(pathOrUrl) ? absolute(pathOrUrl) : apiUrl(pathOrUrl);
  let file: File;
  try {
    file = await fetchTo(url, name);
  } catch {
    throw new Error("Could not download the file.");
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { dialogTitle: name });
  return file.uri;
}

/** Print (or save as PDF) a page of HTML, like the web's window.print(). */
export async function printHtml(html: string) {
  await Print.printAsync({ html });
}

/** Turn a printable page into a PDF and open the share sheet. */
export async function sharePdf(html: string, name: string) {
  const { uri } = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, safeName(name.endsWith(".pdf") ? name : `${name}.pdf`));
  try {
    if (target.exists) target.delete();
    new File(uri).move(target);
  } catch {
    // Keep the generated name.
  }
  const out = target.exists ? target.uri : uri;
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(out, { mimeType: "application/pdf", dialogTitle: name, UTI: "com.adobe.pdf" });
}

/** Wraps printable content in a page with the app's look. */
export function printPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 28px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 20px 0 8px; }
  .soft { color: #556070; } .brand { color: #2f5bea; } .right { text-align: right; } .bold { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border-bottom: 1px solid #e1e6ef; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #556070; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2f5bea; padding-bottom: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; } .box { border: 1px solid #e1e6ef; border-radius: 10px; padding: 10px; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 99px; background: #e9eefe; color: #2f5bea; font-size: 11px; font-weight: 600; }
</style></head><body>${body}</body></html>`;
}

export function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}
