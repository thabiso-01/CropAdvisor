# Builds the web version of the Expo app and serves it with nginx.
# Phones use Expo Go / a native build instead (see README).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL CI=1
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
