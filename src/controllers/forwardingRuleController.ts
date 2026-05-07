import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/**
 * @swagger
 * tags:
 *   - name: Forwarding Rules
 *     description: 转发规则管理
 */

/**
 * @swagger
 * /api/endpoints/{endpointId}/rules:
 *   get:
 *     summary: 获取端点的所有转发规则
 *     tags: [Forwarding Rules]
 *     parameters:
 *       - in: path
 *         name: endpointId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取转发规则列表
 */
export const listRules = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { endpointId } = req.params;

    const rules = await prisma.forwardingRule.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 'success',
      data: { rules },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/endpoints/{endpointId}/rules:
 *   post:
 *     summary: 创建转发规则
 *     tags: [Forwarding Rules]
 *     parameters:
 *       - in: path
 *         name: endpointId
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
 *               targetUrl:
 *                 type: string
 *               condition:
 *                 type: string
 *               headers:
 *                 type: object
 *               bodyTemplate:
 *                 type: string
 *               timeout:
 *                 type: integer
 *               maxRetries:
 *                 type: integer
 *               isEnabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: 转发规则创建成功
 */
export const createRule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { endpointId } = req.params;
    const {
      name,
      targetUrl,
      condition,
      headers = {},
      bodyTemplate,
      timeout = 10000,
      maxRetries = 3,
      isEnabled = true,
      description,
    } = req.body;

    if (!name || !targetUrl) {
      return res.status(400).json({
        status: 'fail',
        message: 'Name and targetUrl are required',
      });
    }

    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!endpoint) {
      return res.status(404).json({
        status: 'fail',
        message: 'Endpoint not found',
      });
    }

    const rule = await prisma.forwardingRule.create({
      data: {
        endpointId,
        name,
        description,
        targetUrl,
        condition,
        headers,
        bodyTemplate,
        timeout,
        maxRetries,
        isEnabled,
      },
    });

    res.status(201).json({
      status: 'success',
      message: 'Forwarding rule created successfully',
      data: { rule },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rules/{id}:
 *   get:
 *     summary: 获取单个转发规则详情
 *     tags: [Forwarding Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取转发规则详情
 */
export const getRule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const rule = await prisma.forwardingRule.findUnique({
      where: { id },
      include: {
        endpoint: true,
      },
    });

    if (!rule) {
      return res.status(404).json({
        status: 'fail',
        message: 'Forwarding rule not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { rule },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rules/{id}:
 *   put:
 *     summary: 更新转发规则
 *     tags: [Forwarding Rules]
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
 *               targetUrl:
 *                 type: string
 *               condition:
 *                 type: string
 *               headers:
 *                 type: object
 *               bodyTemplate:
 *                 type: string
 *               timeout:
 *                 type: integer
 *               maxRetries:
 *                 type: integer
 *               isEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 转发规则更新成功
 */
export const updateRule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      name,
      targetUrl,
      condition,
      headers,
      bodyTemplate,
      timeout,
      maxRetries,
      isEnabled,
      description,
    } = req.body;

    const existingRule = await prisma.forwardingRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return res.status(404).json({
        status: 'fail',
        message: 'Forwarding rule not found',
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (targetUrl !== undefined) updateData.targetUrl = targetUrl;
    if (condition !== undefined) updateData.condition = condition;
    if (headers !== undefined) updateData.headers = headers;
    if (bodyTemplate !== undefined) updateData.bodyTemplate = bodyTemplate;
    if (timeout !== undefined) updateData.timeout = timeout;
    if (maxRetries !== undefined) updateData.maxRetries = maxRetries;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;

    const rule = await prisma.forwardingRule.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      status: 'success',
      message: 'Forwarding rule updated successfully',
      data: { rule },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /api/rules/{id}:
 *   delete:
 *     summary: 删除转发规则
 *     tags: [Forwarding Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: 转发规则删除成功
 */
export const deleteRule = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const existingRule = await prisma.forwardingRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return res.status(404).json({
        status: 'fail',
        message: 'Forwarding rule not found',
      });
    }

    await prisma.forwardingRule.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export default {
  listRules,
  createRule,
  getRule,
  updateRule,
  deleteRule,
};
