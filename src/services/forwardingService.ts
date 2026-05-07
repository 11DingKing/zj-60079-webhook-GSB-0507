import axios, { AxiosError, AxiosResponse } from 'axios';
import { ForwardingRule, ForwardingLog, ForwardingStatus, WebhookEvent } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../config';

export interface ForwardingResult {
  status: ForwardingStatus;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  errorMessage?: string;
  durationMs: number;
}

export class ForwardingService {
  static async executeForwarding(
    event: WebhookEvent & { forwardingLogs: ForwardingLog[] },
    rule: ForwardingRule
  ): Promise<void> {
    const forwardingLog = await prisma.forwardingLog.create({
      data: {
        eventId: event.id,
        ruleId: rule.id,
        status: ForwardingStatus.PENDING,
        attemptNumber: 1,
      },
    });

    setImmediate(async () => {
      let result: ForwardingResult | null = null;
      let attempt = 1;
      const maxAttempts = rule.maxRetries + 1;

      while (attempt <= maxAttempts && (!result || result.status === ForwardingStatus.FAILED || result.status === ForwardingStatus.TIMEOUT)) {
        result = await this.attemptForward(event, rule);
        
        await prisma.forwardingLog.update({
          where: { id: forwardingLog.id },
          data: {
            status: result.status,
            responseStatus: result.responseStatus,
            responseHeaders: result.responseHeaders as any,
            responseBody: result.responseBody,
            errorMessage: result.errorMessage,
            attemptNumber: attempt,
            durationMs: result.durationMs,
            executedAt: new Date(),
          },
        });

        if (result.status === ForwardingStatus.SUCCESS || attempt >= maxAttempts) {
          break;
        }

        const delay = config.forwarding.retryDelays[attempt - 1] || 1000 * Math.pow(2, attempt - 1);
        await this.delay(delay);
        attempt++;
      }
    });
  }

  private static async attemptForward(
    event: WebhookEvent,
    rule: ForwardingRule
  ): Promise<ForwardingResult> {
    const startTime = Date.now();

    try {
      if (rule.condition && !this.evaluateCondition(event, rule.condition)) {
        return {
          status: ForwardingStatus.SUCCESS,
          durationMs: Date.now() - startTime,
          responseBody: 'Condition not matched, forwarding skipped',
        };
      }

      const headers = this.buildHeaders(event, rule);
      const body = this.buildBody(event, rule);

      const response: AxiosResponse = await axios({
        method: 'POST',
        url: rule.targetUrl,
        headers,
        data: body,
        timeout: rule.timeout,
        validateStatus: () => true,
      });

      const isSuccess = response.status >= 200 && response.status < 300;

      return {
        status: isSuccess ? ForwardingStatus.SUCCESS : ForwardingStatus.FAILED,
        responseStatus: response.status,
        responseHeaders: response.headers as Record<string, string>,
        responseBody: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const isTimeout = axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout');

      return {
        status: isTimeout ? ForwardingStatus.TIMEOUT : ForwardingStatus.FAILED,
        errorMessage: axiosError.message,
        responseStatus: axiosError.response?.status,
        durationMs: Date.now() - startTime,
      };
    }
  }

  static evaluateCondition(event: WebhookEvent, condition: string): boolean {
    try {
      const context = {
        body: event.requestBody,
        query: event.requestQuery,
        headers: event.requestHeaders,
        method: event.requestMethod,
        path: event.requestPath,
      };
      
      const fn = new Function('context', `
        with (context) {
          return ${condition};
        }
      `);
      
      const result = fn(context);
      return Boolean(result);
    } catch (error) {
      console.error('Condition evaluation error:', error);
      return false;
    }
  }

  static buildHeaders(event: WebhookEvent, rule: ForwardingRule): Record<string, string> {
    const customHeaders: Record<string, string> = {};
    
    try {
      const headersConfig = rule.headers as Record<string, string>;
      for (const [key, value] of Object.entries(headersConfig)) {
        customHeaders[key] = this.interpolateTemplate(value, event);
      }
    } catch (error) {
      console.error('Header building error:', error);
    }

    return {
      'Content-Type': 'application/json',
      ...customHeaders,
    };
  }

  static buildBody(event: WebhookEvent, rule: ForwardingRule): any {
    if (!rule.bodyTemplate) {
      return event.requestBody;
    }

    try {
      return this.interpolateBodyTemplate(rule.bodyTemplate, event);
    } catch (error) {
      console.error('Body template error:', error);
      return event.requestBody;
    }
  }

  private static interpolateTemplate(template: string, event: WebhookEvent): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const value = this.getValueByPath(event, path);
      return value !== undefined ? String(value) : '';
    });
  }

  private static interpolateBodyTemplate(template: string, event: WebhookEvent): any {
    try {
      const interpolated = this.interpolateTemplate(template, event);
      return JSON.parse(interpolated);
    } catch {
      return template;
    }
  }

  private static getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async replayEvent(eventId: string): Promise<void> {
    const event = await prisma.webhookEvent.findUnique({
      where: { id: eventId },
      include: {
        endpoint: {
          include: {
            forwardingRules: {
              where: { isEnabled: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    for (const rule of event.endpoint.forwardingRules) {
      await this.executeForwarding(
        {
          ...event,
          forwardingLogs: [],
        },
        rule
      );
    }
  }
}
