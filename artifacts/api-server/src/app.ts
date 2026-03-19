import express, { type Express } from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api/admin",
  createProxyMiddleware({
    target: "https://api.bukkapay.com",
    changeOrigin: true,
    pathRewrite: { "^/api/admin": "/admin" },
    on: {
      error: (err, _req, res) => {
        (res as express.Response)
          .status(502)
          .json({ message: "Cannot reach api.bukkapay.com — " + (err as Error).message });
      },
    },
  }),
);

app.use("/api", router);

export default app;
