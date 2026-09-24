FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install express

EXPOSE 10000

CMD ["node", "server.js"]
