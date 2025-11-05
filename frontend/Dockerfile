FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Pasar la variable en build (desde Pulumi)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Construir el proyecto
RUN npm run build

# producción: servir contenido estático en nginx o usando 'serve'
FROM node:20-alpine AS production
WORKDIR /app

# install serve
RUN npm install -g serve

# Copiar los archivos construidos desde la etapa anterior
COPY --from=build /app/dist ./dist

EXPOSE 80
CMD ["serve", "-s", "dist", "-l", "80"]

