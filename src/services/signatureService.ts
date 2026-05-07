import * as crypto from "crypto";
import { SignatureAlgorithm } from "@prisma/client";

export interface SignatureVerificationResult {
  isValid: boolean;
  error?: string;
}

export class SignatureService {
  static readonly TIMESTAMP_TOLERANCE_SECONDS = 300;

  static verifySignature(
    rawBody: Buffer,
    signatureHeader: string,
    secret: string,
    algorithm: SignatureAlgorithm,
    timestamp?: number,
    nonce?: string,
    nonceStore?: Set<string>,
  ): SignatureVerificationResult {
    if (!signatureHeader) {
      return {
        isValid: false,
        error: "Missing signature header",
      };
    }

    if (timestamp !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > this.TIMESTAMP_TOLERANCE_SECONDS) {
        return {
          isValid: false,
          error: "Timestamp expired or too far in the future",
        };
      }
    }

    if (nonce && nonceStore) {
      if (nonceStore.has(nonce)) {
        return {
          isValid: false,
          error: "Replay attack detected: nonce already used",
        };
      }
      nonceStore.add(nonce);
    }

    let signedPayload = rawBody;
    if (timestamp !== undefined) {
      const prefix = nonce ? `${timestamp}.${nonce}.` : `${timestamp}.`;
      signedPayload = Buffer.concat([Buffer.from(prefix), rawBody]);
    }

    const expectedSignature = this.computeSignature(
      signedPayload,
      secret,
      algorithm,
    );

    const signatureParts = signatureHeader.split("=");
    const receivedSignature =
      signatureParts.length > 1 ? signatureParts[1] : signatureHeader;

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
    algorithm: SignatureAlgorithm,
  ): string {
    const hmacAlgorithm =
      algorithm === SignatureAlgorithm.HMAC_SHA256 ? "sha256" : "sha1";
    const hmac = crypto.createHmac(hmacAlgorithm, secret);
    hmac.update(rawBody);
    return hmac.digest("hex");
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
