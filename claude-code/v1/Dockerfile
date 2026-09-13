# Use a lightweight Node.js base image
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /istio-v1

# Copy your static files into the container
COPY index.html script.js styles.css ./

# Install a lightweight static file server
RUN npm install -g serve

# Expose the port your server will listen on
EXPOSE 8000

# Serve the static files directly
CMD ["serve", "-s", ".", "-l", "8000"]
