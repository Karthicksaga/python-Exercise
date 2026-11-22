/** Binary assets imported with `?inline` become base64 data URLs inside the bundle (see TD-3). */
declare module "*.glb?inline" {
  const url: string;
  export default url;
}
declare module "*.woff2?inline" {
  const url: string;
  export default url;
}
/** Vite's `import.meta.glob`, in the two forms the game uses (`peopleFiles.ts`). */
interface ImportMeta {
  glob<T>(pattern: string | readonly string[], options: { readonly eager: true; readonly import: "default" }): Record<string, T>;
  glob<T>(pattern: string | readonly string[], options: { readonly query: string; readonly import: "default" }): Record<string, () => Promise<T>>;
}
