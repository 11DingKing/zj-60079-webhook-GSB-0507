import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { EventValidationStatus } from '@prisma/client';
import { SignatureService } from '../services/signatureService';
import { ForwardingService } from '../services/forwardingService';
import { RateLimitService } from '../services/rateLimitService';

/**
 * @swagger
 * tags:
 *   - name: Webhook Receiver
 *     description: Webhook 接收端点（外部系统调用）
 */

/**
 * @swagger
 * /hooks/{endpointPath}:
 *   post:
 *     summary: 接收 Webhook 回调
 *     tags: [Webhook Receiver]
 *     description: |
 *       这是动态的 Webhook 接收端点，路径格式为 `/hooks/:endpointId`。
 *       实际的端点路径需要先通过管理 API 创建，每个端点有唯一的 URL path。
 *       外部系统向此端点发送请求时，系统会记录完整的请求信息并按规则转发。
 *     parameters:
 *       - in: path
 *         name: endpointPath
 *         required: true
 *         schema:
 *           type: string
 *         description: 端点路径（由管理 API 创建时指定）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Webhook 请求体（格式由发送方决定）
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             description: 表单格式的 Webhook 请求体
 *     responses:
 *       200:
 *         description: Webhook 接收成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Webhook received
 *                 data:
 *                   type: object
 *                   properties:
 *                     eventId:
 *                       type: string
 *                       description: 事件 ID
 *                     validationStatus:
 *                       type: string
 *                       enum: [VALID, INVALID, SKIPPED]
 *                       description: 签名验证状态
 *       404:
 *         description: 端点不存在或已禁用
 *       405:
 *         description: HTTP 方法不允许
 *       429:
 *         description: 速率限制超出
 */
export const receiveHook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { endpointPath } = req.params;
    const fullPath = `/hooks/${endpointPath}`;

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { endpointPath: fullPath },
      include: {
        forwardingRules: {
          where: { isEnabled: true },
        },
      },
    });

    if (!endpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    if (!endpoint.isEnabled) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint is disabled',
      });
    }

    const allowedMethods = endpoint.httpMethods.split(',').map(m => m.trim().toUpperCase());
    if (!allowedMethods.includes(req.method.toUpperCase())) {
      return res.status(405).json({
        status: 'fail',
        message: `Method ${req.method} not allowed`,
      });
    }

    const rateLimitResult = await RateLimitService.checkRateLimit(
      endpoint.id,
      endpoint.rateLimitPerMinute
    );

    const rawBody = (req as any).rawBody || Buffer.from('');
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    let validationStatus = EventValidationStatus.SKIPPED;
    let validationError: string | null = null;

    if (endpoint.signatureKey && endpoint.signatureAlgorithm) {
      const signatureHeader = req.headers[endpoint.signatureHeader.toLowerCase()] as string;
      
      if (signatureHeader) {
        const result = SignatureService.verifySignature(
          rawBody,
          signatureHeader,
          endpoint.signatureKey,
          endpoint.signatureAlgorithm
        );
        
        validationStatus = result.isValid ? EventValidationStatus.VALID : EventValidationStatus.INVALID;
        validationError = result.error || null;
      }
    }

    const event = await prisma.webhookEvent.create({
      data: {
        endpointId: endpoint.id,
        requestMethod: req.method,
        requestPath: fullPath,
        requestHeaders: req.headers,
        requestQuery: req.query,
        requestBody: req.body,
        requestRawBody: rawBody.length > 0 ? rawBody.toString('base64') : null,
        requestIp: clientIp,
        userAgent,
        validationStatus,
        validationError,
        isRateLimited: rateLimitResult.isRateLimited,
      },
      include: {
        forwardingLogs: true,
      },
    });

    if (rateLimitResult.isRateLimited) {
      return res.status(429).json({
        status: 'fail',
        message: 'Rate limit exceeded',
        rateLimit: {
          limit: rateLimitResult.limit,
          current: rateLimitResult.current,
          remaining: rateLimitResult.remaining,
          reset: new Date(rateLimitResult.reset).toISOString(),
        },
      });
    }

    if (validationStatus !== EventValidationStatus.INVALID) {
      for (const rule of endpoint.forwardingRules) {
        await ForwardingService.executeForwarding(event, rule);
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Webhook received',
      data: {
        eventId: event.id,
        validationStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'] as string;
  if (realIp) {
    return realIp;
  }
  
  return req.ip || req.socket.remoteAddress || '';
}

export default {
  receiveHook,
};
