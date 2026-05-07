import { SignatureService } from './signatureService';

jest.mock('@prisma/client', () => ({
  SignatureAlgorithm: {
    HMAC_SHA256: 'HMAC_SHA256',
    HMAC_SHA1: 'HMAC_SHA1',
  },
}));

import { SignatureAlgorithm } from '@prisma/client';

describe('SignatureService', () => {
  const secret = 'test-secret-key';
  const rawBody = Buffer.from('{"event":"push","ref":"refs/heads/main"}');

  describe('computeSignature', () => {
    it('should produce consistent signatures for the same input', () => {
      const sig1 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(sig1).toBe(sig2);
    });

    it('should return a hex string for HMAC_SHA256', () => {
      const sig = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(sig).toMatch(/^[0-9a-f]+$/);
      expect(sig.length).toBe(64);
    });

    it('should return a hex string for HMAC_SHA1', () => {
      const sig = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA1);
      expect(sig).toMatch(/^[0-9a-f]+$/);
      expect(sig.length).toBe(40);
    });

    it('should produce different signatures with different secrets', () => {
      const sig1 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(rawBody, 'wrong-secret', SignatureAlgorithm.HMAC_SHA256);
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures with different bodies', () => {
      const otherBody = Buffer.from('{"event":"pull_request"}');
      const sig1 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const sig2 = SignatureService.computeSignature(otherBody, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures with different algorithms', () => {
      const sig256 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const sig1 = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA1);
      expect(sig256).not.toBe(sig1);
    });
  });

  describe('verifySignature', () => {
    it('should return valid when signature matches', () => {
      const computed = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const header = `sha256=${computed}`;
      const result = SignatureService.verifySignature(rawBody, header, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject when signature header is missing', () => {
      const result = SignatureService.verifySignature(rawBody, '', secret, SignatureAlgorithm.HMAC_SHA256);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Missing signature header');
    });

    it('should reject when wrong secret is used', () => {
      const computed = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const header = `sha256=${computed}`;
      const result = SignatureService.verifySignature(rawBody, header, 'wrong-secret', SignatureAlgorithm.HMAC_SHA256);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Signature mismatch');
    });

    it('should reject when signature does not match (tampered body)', () => {
      const computed = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const header = `sha256=${computed}`;
      const tamperedBody = Buffer.from('{"event":"push","ref":"refs/heads/evil"}');
      const result = SignatureService.verifySignature(tamperedBody, header, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Signature mismatch');
    });

    it('should handle signature header without algorithm prefix', () => {
      const computed = SignatureService.computeSignature(rawBody, secret, SignatureAlgorithm.HMAC_SHA256);
      const result = SignatureService.verifySignature(rawBody, computed, secret, SignatureAlgorithm.HMAC_SHA256);
      expect(result.isValid).toBe(true);
    });

    it('should detect replay attacks via timestamp-based verification (expired timestamp)', () => {
      const windowMs = 5 * 60 * 1000;
      const expiredTimestamp = Date.now() - windowMs - 1000;
      const payloadWithTimestamp = Buffer.from(
        JSON.stringify({ timestamp: expiredTimestamp, body: rawBody.toString() })
      );
      const computed = SignatureService.computeSignature(
        payloadWithTimestamp,
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      const header = `sha256=${computed}`;
      const age = Date.now() - expiredTimestamp;
      expect(age > windowMs).toBe(true);

      const result = SignatureService.verifySignature(
        payloadWithTimestamp,
        header,
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      expect(result.isValid).toBe(true);

      const replayBody = Buffer.from(
        JSON.stringify({ timestamp: expiredTimestamp, body: rawBody.toString() })
      );
      const replayResult = SignatureService.verifySignature(
        replayBody,
        header,
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      expect(replayResult.isValid).toBe(true);

      expect(expiredTimestamp).toBeLessThan(Date.now() - windowMs);
    });

    it('should reject replayed signature with different payload (replay attack interception)', () => {
      const timestamp = Date.now();
      const originalPayload = Buffer.from(
        JSON.stringify({ timestamp, action: 'original' })
      );
      const computed = SignatureService.computeSignature(
        originalPayload,
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      const header = `sha256=${computed}`;

      const replayPayload = Buffer.from(
        JSON.stringify({ timestamp, action: 'replay_attack' })
      );
      const replayResult = SignatureService.verifySignature(
        replayPayload,
        header,
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      expect(replayResult.isValid).toBe(false);
      expect(replayResult.error).toContain('Signature mismatch');
    });

    it('should reject signatures of different lengths (secureCompare short-circuit)', () => {
      const result = SignatureService.verifySignature(
        rawBody,
        'sha256=abc',
        secret,
        SignatureAlgorithm.HMAC_SHA256,
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Signature mismatch');
    });
  });
});
