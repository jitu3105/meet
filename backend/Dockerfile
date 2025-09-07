FROM node:22
WORKDIR /usr/app/src
COPY package.json yarn.lock ./
RUN yarn install
COPY . .