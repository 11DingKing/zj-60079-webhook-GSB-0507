import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { EventValidationStatus, ForwardingStatus } from '@prisma/client';
import { ForwardingService } from '../services/forwardingService';

/**
 * @swagger
 * tags:
 *   - name: Events
 *     description: 事件查询与管理
 */

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: 查询事件列表
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: endpointId
 *         schema:
 *           type: string
 *         description: 端点 ID 过滤
 *       - in: query
 *         name: validationStatus
 *         schema:
 *           type: string
 *           enum: [VALID, INVALID, SKIPPED]
 *         description: 验证状态过滤
 *       - in: query
 *         name: forwardingStatus
 *         schema:
 *           type: string
 *           enum: [SUCCESS, FAILED, TIMEOUT, PENDING]
 *         description: 转发状态过滤
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始时间
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束时间
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 每页数量
 *     responses:
 *       200:
 *         description: 成功获取事件列表
 */
export const listEvents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      endpointId,
      validationStatus,
      startTime,
      endTime,
      page = '1',
      pageSize = '20',
    } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const pageSizeNum = parseInt(pageSize as string, 10) || 20;
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = {};

    if (endpointId) {
      where.endpointId = endpointId;
    }

    if (validationStatus) {
      where.validationStatus = validationStatus as EventValidationStatus;
    }

    if (startTime || endTime) {
      where.receivedAt = {};
      if (startTime) {
        where.receivedAt.gte = new Date(startTime as string);
      }
      if (endTime) {
        where.receivedAt.lte = new Date(endTime as string);
      }
    }

    const [events, total] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        include: {
          endpoint: {
            select: {
              id: true,
              name: true,
              endpointPath: true,
            },
          },
          forwardingLogs: {
            orderBy: { executedAt: 'desc' },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      prisma.webhookEvent.count({ where }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        events,
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total,
          totalPages: Math.ceil(total / pageSizeNum),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: 获取事件详情
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 事件 ID
 *     responses:
 *       200:
 *         description: 成功获取事件详情
 */
export const getEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        endpoint: true,
        forwardingLogs: {
          include: {
            rule: true,
          },
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!event) {
      return res.status(404).json({
        status: 'fail',
        message: 'Event not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { event },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/events/{id}/replay:
 *   post:
 *     summary: 重放事件
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 事件 ID
 *     responses:
 *       202:
 *         description: 事件已接受重放
 */
export const replayEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const event = await prisma.webhookEvent.findUnique({
      where: { id },
      include: {
        endpoint: {
          include: {
            forwardingRules: true,
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({
        status: 'fail',
        message: 'Event not found',
      });
    }

    await ForwardingService.replayEvent(id);

    res.status(202).json({
      status: 'success',
      message: 'Event replay initiated',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listEvents,
  getEvent,
  replayEvent,
};
