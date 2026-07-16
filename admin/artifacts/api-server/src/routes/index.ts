import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminProxyRouter from "./admin-proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminProxyRouter);

export default router;
