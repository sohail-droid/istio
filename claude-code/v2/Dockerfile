# Use official Nginx image
FROM nginx:alpine

# Set working directory inside container
WORKDIR /usr/share/nginx/html

# Copy your static files into Nginx's default web root
COPY index.html script.js styles.css ./

# Expose port 80 (default for Nginx)
EXPOSE 80

# Nginx runs automatically with the base image
