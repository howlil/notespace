/* Deterministic network-boundary fault injection for browser proof.
 *
 * The browser talks to a local proxy that forwards to the real Go/SQLite server.
 * A spec can then simulate the transport failures the UI must survive (503,
 * expired snapshot, aborted PATCH, in-flight mutation) without touching the
 * application, the database, or the Chrome session through CDP.
 */
import { createServer, request as httpRequest } from "node:http";

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection"]);

function readBody(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function createFaultProxy(target) {
  const upstreamUrl = new URL(target);
  const rules = [];
  const requests = [];
  let counter = 0;

  const server = createServer(async (req, res) => {
    const body = await readBody(req).catch(() => Buffer.alloc(0));
    const path = req.url ?? "/";
    const record = { method: req.method ?? "GET", path, body: body.toString("utf8") };
    requests.push(record);

    const rule = rules.slice().reverse().find((candidate) =>
      candidate.remaining > 0 && candidate.matches(record));
    if (rule) {
      rule.remaining -= 1;
      let action = null;
      try {
        action = await rule.respond(record);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `fault rule failed: ${error.message}` }));
        return;
      }
      if (action?.abort) {
        req.socket.destroy();
        return;
      }
      if (action?.status) {
        res.writeHead(action.status, {
          "Content-Type": action.contentType ?? "application/json",
          ...(action.headers ?? {}),
        });
        res.end(action.body ?? "");
        return;
      }
      if (action?.replaceBody !== undefined) {
        // Forward a substitute request body (a per-request transparent rewrite).
        record.body = action.replaceBody;
      }
    }

    await forward(req, res, record, body);
  });

  function forward(req, res, record, body) {
    return new Promise((resolve) => {
      const headers = { ...req.headers, host: upstreamUrl.host };
      // Stay transparent for the server's same-origin mutation guard: the
      // browser addresses the proxy, but every forwarded request must look like
      // it came from the real server origin.
      for (const header of ["origin", "referer"]) {
        if (headers[header]) headers[header] = String(headers[header]).replace(/^https?:\/\/[^/]+/, upstreamUrl.origin);
      }
      for (const header of HOP_BY_HOP) delete headers[header];
      const outgoing = httpRequest({
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port,
        method: req.method,
        path: record.path,
        headers: {
          ...headers,
          ...(body.length ? { "content-length": String(Buffer.byteLength(record.body)) } : {}),
        },
        agent: false,
      }, (upstream) => {
        const responseHeaders = { ...upstream.headers };
        for (const header of HOP_BY_HOP) delete responseHeaders[header];
        res.writeHead(upstream.statusCode ?? 502, responseHeaders);
        upstream.pipe(res);
        upstream.on("end", resolve);
      });
      outgoing.on("error", (error) => {
        if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `proxy upstream failure: ${error.message}` }));
        resolve();
      });
      const payload = record.body !== undefined ? Buffer.from(record.body) : body;
      outgoing.end(payload.length ? payload : undefined);
    });
  }

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    requests,
    inject({ method = null, path = null, times = Infinity, respond }) {
      counter += 1;
      const matcher = (record) => {
        if (method && record.method !== method) return false;
        if (path instanceof RegExp) return path.test(record.path);
        if (typeof path === "string") return record.path.startsWith(path);
        return true;
      };
      const rule = { id: counter, matches: matcher, respond, remaining: times };
      rules.push(rule);
      return rule.id;
    },
    clear(id) {
      const position = rules.findIndex((rule) => rule.id === id);
      if (position >= 0) rules.splice(position, 1);
    },
    reset() {
      rules.length = 0;
    },
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}
