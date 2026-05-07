import { Request, Response, NextFunction } from 'express';

export const rawBodyParser = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return next();
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize > 10 * 1024 * 1024) {
        req.destroy(new Error('Request entity too large'));
      }
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      (req as any).rawBody = rawBody;
      
      let body: any = {};
      const contentType = req.headers['content-type'] || '';
      
      try {
        if (contentType.includes('application/json')) {
          body = rawBody.length > 0 ? JSON.parse(rawBody.toString()) : {};
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const querystring = require('querystring');
          body = querystring.parse(rawBody.toString());
        }
      } catch (err) {
        body = {};
      }
      
      req.body = body;
      next();
    });

    req.on('error', (err) => {
      next(err);
    });
  };
};
