import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
/** Native WebViews cannot reliably download Blob URLs. Save privately, then use the OS share sheet. */
export async function downloadBase64(data: string, name: string, type: string) {
  const filename = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
    });
    await Share.share({ title: filename, files: [file.uri] });
    return;
  }
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadJSON(data: unknown, name: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  await downloadBase64(btoa(binary), name, "application/json");
}
