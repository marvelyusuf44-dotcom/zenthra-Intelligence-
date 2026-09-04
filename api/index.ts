export default async function handler(req: any, res: any) {
  const { default: app } = await import("../artifacts/api-server/dist/app.mjs");
  return app(req, res);
}
