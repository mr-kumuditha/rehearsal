FROM node:24-bookworm-slim
WORKDIR /app
COPY vps-backend ./vps-backend
COPY sandbox ./sandbox
COPY src/lib ./src/lib
COPY package.json ./package.json
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4320 REHEARSAL_DATA_DIR=/data
EXPOSE 4320
CMD ["node", "--experimental-strip-types", "vps-backend/server.ts"]
