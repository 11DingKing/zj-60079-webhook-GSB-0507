"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('开始 seed 数据...');
    const endpoint1 = await prisma.webhookEndpoint.upsert({
        where: { endpointPath: '/hooks/github-events' },
        update: {},
        create: {
            endpointPath: '/hooks/github-events',
            name: 'GitHub Webhook',
            description: 'GitHub 事件接收端点',
            httpMethods: 'POST',
            signatureKey: 'github-secret-123456',
            signatureAlgorithm: client_1.SignatureAlgorithm.HMAC_SHA256,
            signatureHeader: 'X-Hub-Signature-256',
            isEnabled: true,
            rateLimitPerMinute: 100,
        },
    });
    const endpoint2 = await prisma.webhookEndpoint.upsert({
        where: { endpointPath: '/hooks/gitlab-events' },
        update: {},
        create: {
            endpointPath: '/hooks/gitlab-events',
            name: 'GitLab Webhook',
            description: 'GitLab 事件接收端点',
            httpMethods: 'POST,PUT',
            signatureKey: 'gitlab-secret-789012',
            signatureAlgorithm: client_1.SignatureAlgorithm.HMAC_SHA1,
            signatureHeader: 'X-Gitlab-Token',
            isEnabled: true,
            rateLimitPerMinute: 60,
        },
    });
    const endpoint3 = await prisma.webhookEndpoint.upsert({
        where: { endpointPath: '/hooks/generic-events' },
        update: {},
        create: {
            endpointPath: '/hooks/generic-events',
            name: '通用 Webhook 端点',
            description: '不需要签名验证的通用端点',
            httpMethods: 'POST,GET,PUT',
            signatureKey: null,
            signatureAlgorithm: null,
            signatureHeader: 'X-Webhook-Signature',
            isEnabled: true,
            rateLimitPerMinute: 200,
        },
    });
    await prisma.forwardingRule.upsert({
        where: { id: 'rule-github-slack' },
        update: {},
        create: {
            id: 'rule-github-slack',
            endpointId: endpoint1.id,
            name: '推送事件到 Slack',
            description: '将 GitHub push 事件转发到 Slack',
            targetUrl: 'https://hooks.slack.com/services/TEST/TEST/test',
            condition: 'body.event === "push"',
            headers: {
                'Content-Type': 'application/json',
            },
            bodyTemplate: JSON.stringify({
                text: 'New push event from ${body.pusher.name}',
                attachments: [
                    {
                        title: '${body.repository.name}',
                        title_link: '${body.repository.url}',
                        fields: [
                            { title: 'Branch', value: '${body.ref}', short: true },
                            { title: 'Commits', value: '${body.commits.length}', short: true },
                        ],
                    },
                ],
            }),
            timeout: 10000,
            maxRetries: 3,
            isEnabled: true,
        },
    });
    await prisma.forwardingRule.upsert({
        where: { id: 'rule-github-jira' },
        update: {},
        create: {
            id: 'rule-github-jira',
            endpointId: endpoint1.id,
            name: 'Issue 事件到 Jira',
            description: '将 GitHub issue 事件转发到 Jira',
            targetUrl: 'https://your-jira.atlassian.net/rest/api/2/issue',
            condition: 'body.event === "issues"',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic your-jira-token',
            },
            timeout: 15000,
            maxRetries: 5,
            isEnabled: true,
        },
    });
    await prisma.forwardingRule.upsert({
        where: { id: 'rule-gitlab-discord' },
        update: {},
        create: {
            id: 'rule-gitlab-discord',
            endpointId: endpoint2.id,
            name: 'GitLab 到 Discord',
            description: '将 GitLab 事件转发到 Discord',
            targetUrl: 'https://discord.com/api/webhooks/TEST/TEST',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 10000,
            maxRetries: 3,
            isEnabled: true,
        },
    });
    await prisma.forwardingRule.upsert({
        where: { id: 'rule-generic-all' },
        update: {},
        create: {
            id: 'rule-generic-all',
            endpointId: endpoint3.id,
            name: '所有事件转发',
            description: '将所有事件转发到内部服务',
            targetUrl: 'http://internal-service.example.com/webhook-handler',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Service': 'webhook-processor',
            },
            timeout: 5000,
            maxRetries: 2,
            isEnabled: true,
        },
    });
    console.log('Seed 数据创建成功！');
    console.log('');
    console.log('创建的端点：');
    console.log(`  1. ${endpoint1.name} - ${endpoint1.endpointPath}`);
    console.log(`  2. ${endpoint2.name} - ${endpoint2.endpointPath}`);
    console.log(`  3. ${endpoint3.name} - ${endpoint3.endpointPath}`);
    console.log('');
    console.log('运行命令：');
    console.log('  1. 启动数据库: docker-compose up -d');
    console.log('  2. 生成 Prisma Client: npm run prisma:generate');
    console.log('  3. 执行迁移: npm run prisma:migrate');
    console.log('  4. 填充数据: npm run prisma:seed');
    console.log('  5. 启动服务: npm run dev');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map