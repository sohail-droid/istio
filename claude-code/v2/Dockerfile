# Base image: official lightweight nginx build on Alpine Linux.
# NOTE: this is a floating tag — for full reproducibility later,
# consider pinning to a specific digest (nginx:alpine@sha256:...).
FROM nginx:alpine

# Set the working directory inside the container to nginx's default
# web root — this is where our static files need to live.
WORKDIR /usr/share/nginx/html

# Copy your actual site files (HTML/CSS/JS) into nginx's web root.
COPY index.html script.js styles.css ./

# Copy OUR OWN config file, completely replacing nginx's default one
# at this exact path. This is the fix — no more editing/patching
# someone else's file, we own this file outright.
COPY default.conf /etc/nginx/conf.d/default.conf

# Purely documentation for anyone reading this Dockerfile — does NOT
# actually change what port the container listens on. The real port
# is determined entirely by default.conf above.
EXPOSE 8000

# No CMD needed — nginx's base image already starts nginx automatically.