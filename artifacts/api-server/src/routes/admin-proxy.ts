import { Router, type Request, type Response } from "express";
import axios, { type AxiosError } from "axios";

const router = Router();

const BUKKAPAY_API = "https://api.bukkapay.com";

async function proxyRequest(req: Request, res: Response, targetPath: string) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const auth = req.headers["authorization"];
    if (auth) headers["Authorization"] = auth as string;

    const response = await axios({
      method: req.method,
      url: `${BUKKAPAY_API}${targetPath}`,
      headers,
      data: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
      validateStatus: () => true,
    });

    res.status(response.status).json(response.data);
  } catch (err) {
    const error = err as AxiosError;
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      res.status(502).json({ message: "Cannot reach api.bukkapay.com — check the API server is running." });
    } else {
      res.status(500).json({ message: "Proxy error: " + (error.message ?? "Unknown error") });
    }
  }
}

router.post("/admin/login",            (req, res) => proxyRequest(req, res, "/admin/login"));
router.get("/admin/users",             (req, res) => proxyRequest(req, res, "/admin/users"));
router.post("/admin/freeze/:id",       (req, res) => proxyRequest(req, res, `/admin/freeze/${req.params.id}`));
router.post("/admin/activate/:id",     (req, res) => proxyRequest(req, res, `/admin/activate/${req.params.id}`));
router.delete("/admin/delete/:id",     (req, res) => proxyRequest(req, res, `/admin/delete/${req.params.id}`));
router.get("/admin/transactions",      (req, res) => proxyRequest(req, res, "/admin/transactions"));
router.post("/admin/transactions/flag/:id", (req, res) => proxyRequest(req, res, `/admin/transactions/flag/${req.params.id}`));

export default router;
