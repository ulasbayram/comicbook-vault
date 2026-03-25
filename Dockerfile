FROM node:22-alpine

# Install OS dependencies required for pdf-poppler, canvas/sharp, and native CBR extraction
RUN apk add --no-cache poppler-utils ghostscript cairo pango jpeg giflib 7zip

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (devDependencies are needed for vite build)
RUN npm ci

# Copy the rest of the app
COPY . .

# Build Vite frontend
RUN npm run build

# Remove devDependencies to keep the image small
RUN npm prune --omit=dev

# Expose the express API port
EXPOSE 3001

# Run the express server
CMD ["npm", "run", "server"]
