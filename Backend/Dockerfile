FROM node:18

WORKDIR /app

COPY server.js ./
COPY package*.json ./

RUN npm install

EXPOSE 3023

CMD ["node", "server.js"]

