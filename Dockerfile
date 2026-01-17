# Use Node 22 based on Alpine Linux for a small footprint
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# SECURITY: Change ownership of the directory to the non-root user 'node'
# This must be done BEFORE switching users.
RUN chown -R node:node /app

# Switch to the non-root user 'node' provided by the image
USER node

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies (production only, skipping devDependencies)
# The user 'node' needs write access to node_modules/
RUN npm install --omit=dev

# Copy the rest of the application code with correct ownership
COPY --chown=node:node . .

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]