import * as crypto from 'crypto';
import { SignatureAlgorithm } from '@prisma/client';

export interface SignatureVerificationResult {
  isValid: boolean;
  error?: string;
}

export class SignatureService {
  static verifySignature(
    rawBody: Buffer,
    signatureHeader: string,
    secret: string,
    algorithm: SignatureAlgorithm
  ): SignatureVerificationResult {
    if (!signatureHeader) {
      return {
        isValid: false,
        error: 'Missing signature header',
      };
    }

    const expectedSignature = this.computeSignature(rawBody, secret, algorithm);
    
    const signatureParts = signatureHeader.split('=');
    const receivedSignature = signatureParts.length > 1 
      ? signatureParts[1] 
      : signatureHeader;

    if (!this.secureCompare(expectedSignature, receivedSignature)) {
      return {
        isValid: false,
        error: `Signature mismatch. Expected: ${expectedSignature}, Received: ${receivedSignature}`,
      };
    }

    return { isValid: true };
  }

  static computeSignature(
    rawBody: Buffer,
    secret: string,
    algorithm: SignatureAlgorithm
  ): string {
    const hmacAlgorithm = algorithm === SignatureAlgorithm.HMAC_SHA256 ? 'sha256' : 'sha1';
    const hmac = crypto.createHmac(hmacAlgorithm, secret);
    hmac.update(rawBody);
    return hmac.digest('hex');
  }

  private static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}
