import http from "node:http";
import { Scheduler } from "../scheduler/scheduler.js";

export function createHttpServer(opts: {
  port: number;
  scheduler: Scheduler;
  adminToken: string | null;
  onReload: () => Promise<void>;
}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/status") {
      sendJson(res, 200, opts.scheduler.getStatus());
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/reload") {
      if (!isAuthorized(req, opts.adminToken)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      await drainBody(req);
      await opts.onReload();
      sendJson(res, 200, { status: "reloaded" });
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });

  return {
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.listen(opts.port, (err?: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err?: unknown) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isAuthorized(req: http.IncomingMessage, adminToken: string | null): boolean {
  if (!adminToken) return false;
  const header = req.headers["x-admin-token"];
  if (typeof header !== "string") return false;
  return header === adminToken;
}

async function drainBody(req: http.IncomingMessage): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.on("error", reject);
    req.on("data", () => undefined);
    req.on("end", () => resolve());
  });
}
