/** Binary assets imported with `?inline` become base64 data URLs inside the bundle (see TD-3). */
declare module "*.glb?inline" {
  const url: string;
  export default url;
}
