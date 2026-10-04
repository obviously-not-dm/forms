FROM node:22-alpine

WORKDIR /app

# Установка curl для healthcheck
RUN apk add --no-cache curl

# Копирование манифестов зависимостей
COPY package.json package-lock.json ./

# Чистая установка зависимостей
RUN npm ci --prefer-offline || npm install

# Копирование исходного кода
COPY . .

# Первоначальная компиляция статики и инициализация SQLite базы данных
RUN npm run build

# Порт и хост по умолчанию
ENV PORT=8000
ENV HOST=0.0.0.0
EXPOSE 8000

# Проверка работоспособности контейнера
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Запуск производственного сервера с поддержкой статики, API и hot-reload
CMD ["node", "build.mjs", "--serve"]
