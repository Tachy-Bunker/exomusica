FROM node:20-alpine AS build
# argon2 has no prebuilt binary for every alpine/node combo and falls back
# to compiling from source via node-gyp, which needs Python + a C++
# toolchain — none of which plain node:20-alpine ships.
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
# Drop devDependencies now that build/generate are done, rather than doing
# a second npm ci --omit=dev from scratch in the final stage below — that
# would recompile argon2 a second time and require the same build tools
# again in the image we're trying to keep lean.
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg draws the player's spectrogram strips (one per track, cached on disk). Without it the player just keeps its plain seek bar.
RUN apk add --no-cache ffmpeg su-exec
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY prisma ./prisma
COPY seed-assets ./seed-assets
# The named volume mounted here inherits this owner on first use. A volume made before that line existed stays root-owned, so the
# entrypoint fixes the owner at start (one stat call once it is right) and then drops to the node user with su-exec.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
