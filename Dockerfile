FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY test ./test
COPY .service-info.json ./.service-info.json

ENV NODE_ENV=production
ENV PORT=3202
ENV ACCESS_PASSWORD=ideabank2026

EXPOSE 3202

CMD ["npm", "start"]
