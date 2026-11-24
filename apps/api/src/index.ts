export interface Env {
  APP_ENV?: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/health") {
      return json({
        service: "CorpTrace API",
        status: "ok",
        environment: env.APP_ENV ?? "development",
        version: "0.1.0",
      });
    }

    return json({ error: "Not found", availableRoutes: ["/health"] }, 404);
  },
};
