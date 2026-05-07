import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { SignatureAlgorithm } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * @swagger
 * tags:
 *   - name: Endpoints
 *     description: Webhook 端点管理
 */

/**
 * @swagger
 * /api/endpoints:
 *   get:
 *     summary: 获取所有端点列表
 *     tags: [Endpoints]
 *     responses:
 *       200:
 *         description: 成功获取端点列表
 */
export const listEndpoints = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      include: {
        _count: {
          select: {
            events: true,
            forwardingRules: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      status: 'success',
      data: {
        endpoints,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/endpoints/{id}:
 *   get:
 *     summary: 获取单个端点详情
 *     tags: [Endpoints]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 端点 ID
 *     responses:
 *       200:
 *         description: 成功获取端点详情
 */
export const getEndpoint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
      include: {
        forwardingRules: true,
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    if (!endpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        endpoint,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/endpoints:
 *   post:
 *     summary: 创建新端点
 *     tags: [Endpoints]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               endpointPath:
 *                 type: string
 *               httpMethods:
 *                 type: string
 *               signatureKey:
 *                 type: string
 *               signatureAlgorithm:
 *                 type: string
 *                 enum: [HMAC_SHA256, HMAC_SHA1]
 *               signatureHeader:
 *                 type: string
 *               isEnabled:
 *                 type: boolean
 *               rateLimitPerMinute:
 *                 type: integer
 *     responses:
 *       201:
 *         description: 端点创建成功
 */
export const createEndpoint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      name,
      endpointPath,
      httpMethods = 'POST',
      signatureKey,
      signatureAlgorithm,
      signatureHeader = 'X-Hub-Signature-256',
      isEnabled = true,
      rateLimitPerMinute = 60,
      description,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        status: 'fail',
        message: 'Name is required',
      });
    }

    let finalEndpointPath = endpointPath;
    if (!finalEndpointPath) {
      const uniqueId = uuidv4().replace(/-/g, '').substring(0, 12);
      finalEndpointPath = `/hooks/${uniqueId}`;
    } else if (!finalEndpointPath.startsWith('/hooks/')) {
      finalEndpointPath = `/hooks/${finalEndpointPath.replace(/^\/+|\/+$/g, '')}`;
    }

    const existingEndpoint = await prisma.webhookEndpoint.findUnique({
      where: { endpointPath: finalEndpointPath },
    });

    if (existingEndpoint) {
      return res.status(400).json({
        status: 'fail',
        message: 'Endpoint path already exists',
      });
    }

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        name,
        endpointPath: finalEndpointPath,
        description,
        httpMethods,
        signatureKey,
        signatureAlgorithm: signatureAlgorithm as SignatureAlgorithm | undefined,
        signatureHeader,
        isEnabled,
        rateLimitPerMinute,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Endpoint created successfully',
      data: {
        endpoint,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/endpoints/{id}:
 *   put:
 *     summary: 更新端点
 *     tags: [Endpoints]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               httpMethods:
 *                 type: string
 *               signatureKey:
 *                 type: string
 *               signatureAlgorithm:
 *                 type: string
 *                 enum: [HMAC_SHA256, HMAC_SHA1]
 *               signatureHeader:
 *                 type: string
 *               isEnabled:
 *                 type: boolean
 *               rateLimitPerMinute:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 端点更新成功
 */
export const updateEndpoint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      name,
      httpMethods,
      signatureKey,
      signatureAlgorithm,
      signatureHeader,
      isEnabled,
      rateLimitPerMinute,
      description,
    } = req.body;

    const existingEndpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!existingEndpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (httpMethods !== undefined) updateData.httpMethods = httpMethods;
    if (signatureKey !== undefined) updateData.signatureKey = signatureKey;
    if (signatureAlgorithm !== undefined) updateData.signatureAlgorithm = signatureAlgorithm as SignatureAlgorithm;
    if (signatureHeader !== undefined) updateData.signatureHeader = signatureHeader;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = rateLimitPerMinute;

    const endpoint = await prisma.webhookEndpoint.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      status: 'success',
      message: 'Endpoint updated successfully',
      data: {
        endpoint,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/endpoints/{id}:
 *   delete:
 *     summary: 删除端点
 *     tags: [Endpoints]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 端点删除成功
 */
export const deleteEndpoint = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const existingEndpoint = await prisma.webhookEndpoint.findUnique({
      where: { id },
    });

    if (!existingEndpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    await prisma.webhookEndpoint.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export default {
  listEndpoints,
  getEndpoint,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
};
