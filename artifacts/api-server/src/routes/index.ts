import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contentRouter from "./content";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contentRouter);

export default router;
