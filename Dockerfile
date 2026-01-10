# Use Node 18 base image
FROM node:18-bullseye-slim

# Install dependencies for Puppeteer (Chrome) and Supervisor
# We install chromium instead of full chrome to save space/complexity, 
# and tell Puppeteer to use it.
RUN apt-get update && apt-get install -y \
    chromium \
    supervisor \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set up environment for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install deps
RUN npm install

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
EXPOSE 3000 3007 3008

# Start supervisor
CMD ["/usr/bin/supervisord"]
