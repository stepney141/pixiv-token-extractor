# puppeteer-pixiv-token

- A small script to get a pixiv login token with Node.js & puppeteer
- Based on [a script with Python3 & Selenium by upbit](https://gist.github.com/upbit/6edda27cb1644e94183291109b8a5fde)

## Setup

```
npm install
cp env.example.json env.json
```

Edit `env.json` and set your pixiv userid and password in it.

## Getting a new token

### CLI Mode (will launch Headless Chrome)

Note: this mode is very unstable so far. I recommend you to use the GUI mode below.

```
node index.js login --cli
```

### GUI Mode (will launch Headfull Chrome)

```
node index.js login --gui
```

example outputs:

```
$ node index.js login --gui
[INFO]: Generated code_verifier: jj5A...............Vhbsw
[INFO]: Launched Chromium browser
[INFO]: Succeed in logging in pixiv
[+]: Success!
[INFO] Get code: XGq...............cTA
access_token: PhR...............inIM
refresh_token: BMM...............k0r4
expires_in: 3600
```

## Refreshing an old token

```
node index.js refresh YOUR_REFRESH_TOKEN
```
