FROM node:22-alpine

# Install OS dependencies required for pdf-poppler and canvas/sharp
RUN apk add --no-cache poppler-utils ghostscript cairo pango jpeg giflib

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring devDependencies)
RUN npm ci --omit=dev && npm install -g vite concurrently

# Copy the rest of the app
COPY . .

# Build Vite frontend
RUN npm run build

# Expose the express API port
EXPOSE 3001

# Run the express server
CMD ["npm", "run", "server"]
