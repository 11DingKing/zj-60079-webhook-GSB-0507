import { SignatureService } from './signatureService';
import { SignatureAlgorithm } from '@prisma/client';

describe('SignatureService', () => {
  const testSecret = 'test-secret-key-12345';
  const testBody = Buffer.from(JSON.stringify({ event: 'test', data: 'payload' }));

  describe('computeSignature', () => {
    it('should generate consistent HMAC-SHA256 signature', () => {
      const sig1 = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate consistent HMAC-SHA1 signature', () => {
      const sig1 = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA1);
      const sig2 = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA1);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should produce different signatures with different secrets', () => {
      const sig1 = SignatureService.computeSignature(testBody, 'secret-1', SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(testBody, 'secret-2', SignatureAlgorithm.HMAC_SHA256);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures with different bodies', () => {
      const body1 = Buffer.from('payload1');
      const body2 = Buffer.from('payload2');
      
      const sig1 = SignatureService.computeSignature(body1, testSecret, SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(body2, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature (basic)', () => {
    it('should pass verification with correct signature (HMAC-SHA256)', () => {
      const signature = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA256);
      const result = SignatureService.verifySignature(testBody, `sha256=${signature}`, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should pass verification with correct signature (HMAC-SHA1)', () => {
      const signature = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA1);
      const result = SignatureService.verifySignature(testBody, `sha1=${signature}`, testSecret, SignatureAlgorithm.HMAC_SHA1);
      
      expect(result.isValid).toBe(true);
    });

    it('should pass verification with raw signature (no prefix)', () => {
      const signature = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA256);
      const result = SignatureService.verifySignature(testBody, signature, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(true);
    });

    it('should fail verification with wrong secret', () => {
      const signature = SignatureService.computeSignature(testBody, 'wrong-secret', SignatureAlgorithm.HMAC_SHA256);
      const result = SignatureService.verifySignature(testBody, `sha256=${signature}`, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Signature mismatch');
    });

    it('should fail verification with missing signature header', () => {
      const result = SignatureService.verifySignature(testBody, '', testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Missing signature header');
    });

    it('should fail verification with tampered signature', () => {
      const signature = SignatureService.computeSignature(testBody, testSecret, SignatureAlgorithm.HMAC_SHA256);
      const tampered = signature.replace(/./g, '0');
      const result = SignatureService.verifySignature(testBody, `sha256=${tampered}`, testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(false);
    });

    it('should fail verification with different length signature', () => {
      const result = SignatureService.verifySignature(testBody, 'short', testSecret, SignatureAlgorithm.HMAC_SHA256);
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('verifySignature with timestamp validation', () => {
    it('should pass with valid timestamp (within 5 minutes)', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = SignatureService.computeSignature(
        Buffer.from(`${timestamp}.${testBody.toString()}`),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${signature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp
      );
      
      expect(result.isValid).toBe(true);
    });

    it('should fail with expired timestamp (older than 5 minutes)', () => {
      const timestamp = Math.floor(Date.now() / 1000) - 600;
      const signature = SignatureService.computeSignature(
        Buffer.from(`${timestamp}.${testBody.toString()}`),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${signature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Timestamp expired or too far in the future');
    });

    it('should fail with future timestamp (too far ahead)', () => {
      const timestamp = Math.floor(Date.now() / 1000) + 600;
      const signature = SignatureService.computeSignature(
        Buffer.from(`${timestamp}.${testBody.toString()}`),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${signature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Timestamp expired or too far in the future');
    });

    it('should fail with tampered timestamp signature', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const wrongSignature = SignatureService.computeSignature(
        Buffer.from('wrong.timestamp'),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${wrongSignature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp
      );
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('replay attack protection', () => {
    const nonceStore = new Set<string>();

    it('should pass with unique nonce', () => {
      const nonce = 'unique-nonce-123';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = SignatureService.computeSignature(
        Buffer.from(`${timestamp}.${nonce}.${testBody.toString()}`),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${signature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp,
        nonce,
        nonceStore
      );
      
      expect(result.isValid).toBe(true);
      expect(nonceStore.has(nonce)).toBe(true);
    });

    it('should reject replayed nonce', () => {
      const nonce = 'replay-nonce-456';
      const timestamp = Math.floor(Date.now() / 1000);
      nonceStore.add(nonce);
      
      const signature = SignatureService.computeSignature(
        Buffer.from(`${timestamp}.${nonce}.${testBody.toString()}`),
        testSecret,
        SignatureAlgorithm.HMAC_SHA256
      );
      
      const result = SignatureService.verifySignature(
        testBody,
        `sha256=${signature}`,
        testSecret,
        SignatureAlgorithm.HMAC_SHA256,
        timestamp,
        nonce,
        nonceStore
      );
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Replay attack detected: nonce already used');
    });
  });
});
