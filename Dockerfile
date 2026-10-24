FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install express nodemailer
EXPOSE 10000
CMD ["node","server.js"]
