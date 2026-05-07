import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { EventValidationStatus, ForwardingStatus } from '@prisma/client';

/**
 * @swagger
 * tags:
 *   - name: Statistics
 *     description: 统计面板
 */

type TimeGranularity = 'hour' | 'day';

function aggregateTrendData(events: any[], granularity: TimeGranularity) {
  const groups: Record<string, any> = {};

  for (const event of events) {
    const key = getTimeBucket(event.receivedAt, granularity);
    
    if (!groups[key]) {
      groups[key] = {
        timestamp: key,
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
        skippedEvents: 0,
        successfulForwards: 0,
        failedForwards: 0,
        totalResponseTime: 0,
        responseTimeCount: 0,
      };
    }

    const group = groups[key];
    group.totalEvents++;

    switch (event.validationStatus) {
      case EventValidationStatus.VALID:
        group.validEvents++;
        break;
      case EventValidationStatus.INVALID:
        group.invalidEvents++;
        break;
      default:
        group.skippedEvents++;
    }

    for (const log of event.forwardingLogs) {
      if (log.status === ForwardingStatus.SUCCESS) {
        group.successfulForwards++;
      } else if (log.status === ForwardingStatus.FAILED || log.status === ForwardingStatus.TIMEOUT) {
        group.failedForwards++;
      }
      
      if (log.durationMs !== null) {
        group.totalResponseTime += log.durationMs;
        group.responseTimeCount++;
      }
    }
  }

  return Object.values(groups).map(group => ({
    ...group,
    avgResponseTime: group.responseTimeCount > 0 
      ? Math.round((group.totalResponseTime / group.responseTimeCount) * 100) / 100 
      : 0,
  }));
}

function getTimeBucket(date: Date, granularity: TimeGranularity): string {
  const d = new Date(date);
  if (granularity === 'hour') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @swagger
 * /api/statistics/overview:
 *   get:
 *     summary: 获取总览统计
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: 成功获取总览统计
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalEndpoints:
 *                           type: integer
 *                           example: 3
 *                         totalEvents:
 *                           type: integer
 *                           example: 100
 *                         totalForwardings:
 *                           type: integer
 *                           example: 150
 *                         validEvents:
 *                           type: integer
 *                           example: 90
 *                         successForwardings:
 *                           type: integer
 *                           example: 140
 *                         validationRate:
 *                           type: number
 *                           example: 90.0
 *                         forwardingSuccessRate:
 *                           type: number
 *                           example: 93.33
 *                     recentEvents:
 *                       type: array
 *                       items:
 *                         type: object
 *       500:
 *         description: 服务器错误
 */
export const getOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [totalEndpoints, totalEvents, totalForwardings] = await Promise.all([
      prisma.webhookEndpoint.count(),
      prisma.webhookEvent.count(),
      prisma.forwardingLog.count(),
    ]);

    const validEvents = await prisma.webhookEvent.count({
      where: { validationStatus: EventValidationStatus.VALID },
    });

    const successForwardings = await prisma.forwardingLog.count({
      where: { status: ForwardingStatus.SUCCESS },
    });

    const recentEvents = await prisma.webhookEvent.findMany({
      take: 10,
      orderBy: { receivedAt: 'desc' },
      include: {
        endpoint: {
          select: { name: true, endpointPath: true },
        },
        forwardingLogs: true,
      },
    });

    const validationRate = totalEvents > 0 ? (validEvents / totalEvents) * 100 : 0;
    const forwardingSuccessRate = totalForwardings > 0 ? (successForwardings / totalForwardings) * 100 : 0;

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalEndpoints,
          totalEvents,
          totalForwardings,
          validEvents,
          successForwardings,
          validationRate: Math.round(validationRate * 100) / 100,
          forwardingSuccessRate: Math.round(forwardingSuccessRate * 100) / 100,
        },
        recentEvents,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/statistics/endpoints/{endpointId}:
 *   get:
 *     summary: 获取单个端点统计
 *     tags: [Statistics]
 *     parameters:
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema:
 *           type: string
 *         description: 端点 ID
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day]
 *           default: day
 *         description: 时间粒度，用于趋势数据聚合
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *         description: 统计天数，用于计算趋势数据的时间范围
 *     responses:
 *       200:
 *         description: 成功获取端点统计
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     endpoint:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         endpointPath:
 *                           type: string
 *                     statistics:
 *                       type: object
 *                       properties:
 *                         totalEvents:
 *                           type: integer
 *                         validEvents:
 *                           type: integer
 *                         totalForwardings:
 *                           type: integer
 *                         successForwardings:
 *                           type: integer
 *                         validationRate:
 *                           type: number
 *                         forwardingSuccessRate:
 *                           type: number
 *                         avgResponseTime:
 *                           type: number
 *                     trend:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                           totalEvents:
 *                             type: integer
 *                           validEvents:
 *                             type: integer
 *                           invalidEvents:
 *                             type: integer
 *                           skippedEvents:
 *                             type: integer
 *                           successfulForwards:
 *                             type: integer
 *                           failedForwards:
 *                             type: integer
 *                           avgResponseTime:
 *                             type: number
 *       404:
 *         description: 端点不存在
 *       500:
 *         description: 服务器错误
 */
export const getEndpointStatistics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { endpointId } = req.params;
    const { granularity = 'day', days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;
    const timeGranularity = granularity as TimeGranularity;

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      include: {
        _count: {
          select: { events: true, forwardingRules: true },
        },
      },
    });

    if (!endpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    const now = new Date();
    const startDate = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);

    const events = await prisma.webhookEvent.findMany({
      where: {
        endpointId,
        receivedAt: { gte: startDate },
      },
      include: {
        forwardingLogs: true,
      },
      orderBy: { receivedAt: 'asc' },
    });

    const trendData = aggregateTrendData(events, timeGranularity);

    const totalEvents = endpoint._count.events;
    const validEvents = events.filter(e => e.validationStatus === EventValidationStatus.VALID).length;
    const totalForwardings = events.reduce((sum, e) => sum + e.forwardingLogs.length, 0);
    const successForwardings = events.reduce(
      (sum, e) => sum + e.forwardingLogs.filter(f => f.status === ForwardingStatus.SUCCESS).length,
      0
    );

    const allForwardingDurations = events.flatMap(e => 
      e.forwardingLogs.filter(f => f.durationMs !== null).map(f => f.durationMs!)
    );
    const avgResponseTime = allForwardingDurations.length > 0
      ? allForwardingDurations.reduce((a, b) => a + b, 0) / allForwardingDurations.length
      : 0;

    const validationRate = totalEvents > 0 ? (validEvents / totalEvents) * 100 : 0;
    const forwardingSuccessRate = totalForwardings > 0 ? (successForwardings / totalForwardings) * 100 : 0;

    res.status(200).json({
      status: 'success',
      data: {
        endpoint: {
          id: endpoint.id,
          name: endpoint.name,
          endpointPath: endpoint.endpointPath,
        },
        statistics: {
          totalEvents,
          validEvents,
          totalForwardings,
          successForwardings,
          validationRate: Math.round(validationRate * 100) / 100,
          forwardingSuccessRate: Math.round(forwardingSuccessRate * 100) / 100,
          avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        },
        trend: trendData,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getOverview,
  getEndpointStatistics,
};
