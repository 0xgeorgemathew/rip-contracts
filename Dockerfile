# Zero-Knowledge Price Protection Oracle
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY scripts/package*.json ./
RUN npm ci --only=production

# Copy application code
COPY scripts/ ./
COPY circuits/build/ ./circuits/build/
COPY contracts/deployment.json ./contracts/
COPY contracts/merkle-registry-deployment.json ./contracts/

# Create required directories
RUN mkdir -p public circuits/build contracts

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4001/api/debug/status || exit 1

# Start the Oracle
CMD ["npx", "ts-node", "minimalOracle.ts"]