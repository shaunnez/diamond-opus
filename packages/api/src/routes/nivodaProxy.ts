import { Router } from "express";
import type { Request, Response } from "express";
import { nivodaProxyAuth } from "../middleware/nivodaProxyAuth.js";
import { requireEnv } from "@diamond/shared";

const router = Router();

router.post(
  "/graphql",
  nivodaProxyAuth,
  async (req: Request, res: Response) => {
    const { query, variables, operationName } = req.body ?? {};

    if (!query) {
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "GraphQL query is required" },
      });
      return;
    }

    const url = requireEnv('nivoda_endpoint');

    if (!url) {
      res.status(500).json({
        error: { code: "MISCONFIGURED", message: "Nivoda env vars missing" },
      });
      return;
    }

    const traceId = req.header("x-trace-id") ?? crypto.randomUUID();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const upstream = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-trace-id": traceId,
        },
        body: JSON.stringify({
          query,
          variables,
          operationName,
        }),
      }).finally(() => clearTimeout(timeout));

      const body = await upstream.text();

      res.status(upstream.status);
      res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
      res.setHeader("x-trace-id", traceId);
      res.send(body);
    } catch (err) {
      res.status(502).json({
        error: { code: "BAD_GATEWAY", message: "Failed to reach Nivoda" },
      });
    }
  }
);

export default router;
