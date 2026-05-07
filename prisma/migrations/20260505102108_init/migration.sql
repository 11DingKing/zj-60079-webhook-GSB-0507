-- CreateEnum
CREATE TYPE "SignatureAlgorithm" AS ENUM ('HMAC_SHA256', 'HMAC_SHA1');

-- CreateEnum
CREATE TYPE "ForwardingStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT', 'PENDING');

-- CreateEnum
CREATE TYPE "EventValidationStatus" AS ENUM ('VALID', 'INVALID', 'SKIPPED');

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "httpMethods" TEXT NOT NULL DEFAULT 'POST',
    "signatureKey" TEXT,
    "signatureAlgorithm" "SignatureAlgorithm",
    "signatureHeader" TEXT NOT NULL DEFAULT 'X-Hub-Signature-256',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingRule" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetUrl" TEXT NOT NULL,
    "condition" TEXT,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "bodyTemplate" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 10000,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "requestHeaders" JSONB NOT NULL DEFAULT '{}',
    "requestQuery" JSONB NOT NULL DEFAULT '{}',
    "requestBody" JSONB NOT NULL DEFAULT '{}',
    "requestRawBody" TEXT,
    "requestIp" TEXT,
    "userAgent" TEXT,
    "validationStatus" "EventValidationStatus" NOT NULL DEFAULT 'SKIPPED',
    "validationError" TEXT,
    "isRateLimited" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "ForwardingStatus" NOT NULL DEFAULT 'PENDING',
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "durationMs" INTEGER,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "ForwardingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_endpointPath_key" ON "WebhookEndpoint"("endpointPath");

-- AddForeignKey
ALTER TABLE "ForwardingRule" ADD CONSTRAINT "ForwardingRule_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingLog" ADD CONSTRAINT "ForwardingLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingLog" ADD CONSTRAINT "ForwardingLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ForwardingRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
