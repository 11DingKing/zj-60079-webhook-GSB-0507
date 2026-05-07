import { Router } from 'express';
import endpointController from '../controllers/endpointController';
import forwardingRuleController from '../controllers/forwardingRuleController';
import eventController from '../controllers/eventController';
import statisticsController from '../controllers/statisticsController';

const router = Router();

// 端点管理
router.get('/endpoints', endpointController.listEndpoints);
router.get('/endpoints/:id', endpointController.getEndpoint);
router.post('/endpoints', endpointController.createEndpoint);
router.put('/endpoints/:id', endpointController.updateEndpoint);
router.delete('/endpoints/:id', endpointController.deleteEndpoint);

// 转发规则
router.get('/endpoints/:endpointId/rules', forwardingRuleController.listRules);
router.post('/endpoints/:endpointId/rules', forwardingRuleController.createRule);
router.get('/rules/:id', forwardingRuleController.getRule);
router.put('/rules/:id', forwardingRuleController.updateRule);
router.delete('/rules/:id', forwardingRuleController.deleteRule);

// 事件
router.get('/events', eventController.listEvents);
router.get('/events/:id', eventController.getEvent);
router.post('/events/:id/replay', eventController.replayEvent);

// 统计
router.get('/statistics/overview', statisticsController.getOverview);
router.get('/statistics/endpoints/:endpointId', statisticsController.getEndpointStatistics);

export const apiRoutes = router;
