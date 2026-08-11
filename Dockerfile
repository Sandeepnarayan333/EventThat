# Playwright's official image ships Node + all browsers + OS deps
# already installed, matching the exact @playwright/test version below.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY playwright.config.ts ./
COPY tests ./tests

CMD ["npx", "playwright", "test"]
