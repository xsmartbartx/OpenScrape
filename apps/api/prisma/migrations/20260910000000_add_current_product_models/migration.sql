-- Add current product models and fields after the initial baseline migration.
ALTER TABLE "Robot" ADD COLUMN "aiPrompt" TEXT;
ALTER TABLE "Robot" ADD COLUMN "aiSchema" JSONB;

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "payloadHash" TEXT NOT NULL,
    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RecorderSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "startUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecorderSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RobotStep" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "selector" JSONB,
    "value" TEXT,
    "options" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RobotStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "intervalMs" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "pageIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE UNIQUE INDEX "BillingEvent_provider_eventId_key" ON "BillingEvent"("provider", "eventId");
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "RecorderSession_workspaceId_status_idx" ON "RecorderSession"("workspaceId", "status");
CREATE INDEX "RobotStep_robotId_orderIndex_idx" ON "RobotStep"("robotId", "orderIndex");
CREATE UNIQUE INDEX "RobotStep_robotId_orderIndex_key" ON "RobotStep"("robotId", "orderIndex");
CREATE INDEX "Schedule_workspaceId_active_idx" ON "Schedule"("workspaceId", "active");
CREATE INDEX "Result_runId_createdAt_idx" ON "Result"("runId", "createdAt");
CREATE INDEX "RunLog_runId_createdAt_idx" ON "RunLog"("runId", "createdAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecorderSession" ADD CONSTRAINT "RecorderSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecorderSession" ADD CONSTRAINT "RecorderSession_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RobotStep" ADD CONSTRAINT "RobotStep_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Result" ADD CONSTRAINT "Result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunLog" ADD CONSTRAINT "RunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
