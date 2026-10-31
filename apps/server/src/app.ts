import { Hono } from "hono";
import { yoga } from "./graphql/yoga.ts";

/** Every API route lives under /api, so a proxy (or Vite in dev) can send /api/* here. */
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/graphql", (c) => yoga.fetch(c.req.raw));
