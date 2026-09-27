# platform-web on Back4app Containers (build method: Dockerfile).
# 两阶段：node 构建 SPA → nginx 托管静态文件 + 把 API 路径反代到后端容器
# （BACKEND_ORIGIN 在 Back4app 控制台配成 sass-api 容器的公网 URL）。
# 浏览器视角同源，零 CORS。
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /src/dist /usr/share/nginx/html
# nginx 官方镜像自动对 /etc/nginx/templates/*.template 做 envsubst 渲染到
# conf.d/，只替换已定义的环境变量（$uri 等 nginx 变量不受影响）。
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=8080 \
    BACKEND_ORIGIN=http://127.0.0.1:8090
EXPOSE 8080
