import { Router } from 'express';
import hookController from '../controllers/hookController';

const router = Router();

router.all('/:endpointPath(*)', hookController.receiveHook);

export const hookReceiver = router;
