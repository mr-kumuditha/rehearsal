FROM node:24-bookworm-slim
WORKDIR /app
COPY backend ./backend
COPY sandbox ./sandbox
COPY src/lib ./src/lib
COPY package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=4320 REHEARSAL_DATA_DIR=/data
EXPOSE 4320
CMD ["node", "--experimental-strip-types", "backend/server.ts"]
