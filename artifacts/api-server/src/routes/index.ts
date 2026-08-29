import { Router, type IRouter } from "express";
import healthRouter from "./health";
import zenthraRouter from "./zenthra";
import authRouter from "./auth";
import productRouter from "./product";
import whatsappRouter from "./whatsapp";
import whatsappConnectRouter from "./whatsapp-connect";
import billingRouter from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(zenthraRouter);
router.use(authRouter);
router.use(productRouter);
router.use(whatsappRouter);
router.use(whatsappConnectRouter);
router.use(billingRouter);

export default router;
