# Stdio MCP server. Zero npm dependencies, so no install step is needed.
FROM node:22-alpine

WORKDIR /app
COPY package.json LICENSE README.md ./
COPY bin/ ./bin/
COPY src/ ./src/
COPY data/ ./data/

ENV NODE_ENV=production \
    YISHU_INSIGHT_URL=https://insightapp.life

USER node
ENTRYPOINT ["node", "bin/yishu-insight-mcp.mjs"]
