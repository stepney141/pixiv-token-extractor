# puppeteer-pixiv-token

- A small script to get a pixiv login token with Node.js & puppeteer
- Based on [a script with Python3 & Selenium by upbit](https://gist.github.com/upbit/6edda27cb1644e94183291109b8a5fde)

## Run (CLI)

### Setup

```
yarn
cp env.example.json env.json
```

Edit `env.json` and set your pixiv userid and password.

### Get a new token

```
yarn run login
```

### Refresh an old token

```
yarn run refresh <your_refresh_token>
```
