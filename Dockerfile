# As a workaround we have to build on nodejs 18
# nodejs 20 hangs on build with armv6/armv7
FROM docker.io/library/node:18-alpine AS build_node_modules

# Update npm to a version compatible with Node 18 (npm 10.x); npm@latest (11.x) requires Node >=20
RUN npm install -g npm@10

# Copy Web UI
COPY src /app
WORKDIR /app

# Install all dependencies (including dev) for building
RUN npm ci

# Build TypeScript to dist
RUN npm run build

# Optionally prune dev dependencies to reduce size for runtime copy
RUN npm prune --omit=dev

# Copy build result to a new image.
# This saves a lot of disk space.
FROM amneziavpn/amnezia-wg:latest
HEALTHCHECK CMD /usr/bin/timeout 5s /bin/sh -c "/usr/bin/wg show | /bin/grep -q interface || exit 1" --interval=1m --timeout=5s --retries=3
COPY --from=build_node_modules /app /app


# Copy the needed wg-password scripts
COPY --from=build_node_modules /app/wgpw.sh /bin/wgpw
RUN chmod +x /bin/wgpw

# Install Linux packages
RUN apk add --no-cache \
    dpkg \
    dumb-init \
    iptables \
    nodejs \
    npm

# Use iptables-legacy
RUN update-alternatives --install /sbin/iptables iptables /sbin/iptables-legacy 10 --slave /sbin/iptables-restore iptables-restore /sbin/iptables-legacy-restore --slave /sbin/iptables-save iptables-save /sbin/iptables-legacy-save

# Set Environment
ENV DEBUG=Server,WireGuard


RUN mkdir -p /etc/wireguard && chmod 775 /etc/wireguard
# Run Web UI
WORKDIR /app

CMD ["/usr/bin/dumb-init", "node", "dist/server.js"]
