FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install express nodemailer
EXPOSE 10000
# One-time launch reset: clears old test/registration data on first deployment, then preserves the new database.
ENV B5_FRESH_START=1
CMD ["node","server.js"]
