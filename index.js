/* Original: https://gist.github.com/upbit/6edda27cb1644e94183291109b8a5fde */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fetch from 'node-fetch';
import fs from 'fs';
import { generators } from 'openid-client';

const { userid, password } = JSON.parse(fs.readFileSync('./env.json'));

export class pixivTokenExtractor {

    constructor() {
        /* Latest app version can be found using GET /v1/application-info/android */
        this.USER_AGENT = "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)";
        this.REDIRECT_URI = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback";
        this.LOGIN_URL = "https://app-api.pixiv.net/web/v1/login";
        this.AUTH_TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token";
        this.CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
        this.CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";

        // xpath strings for the automatic login
        this.userid_input_xpath = '//input[@autocomplete="username"]';
        this.password_input_xpath = '//input[@type="password"]';
        this.login_button_xpath = '//button[@type="submit"]';
        this.recaptcha_prompt_xpath = '//li[contains(text(), "Complete the reCAPTCHA verification")]';
    }

    oauth_pkce() {
        /* Proof Key for Code Exchange by OAuth Public Clients (RFC7636). */
        const code_verifier = generators.codeVerifier(32);
        const code_challenge = generators.codeChallenge(code_verifier);
        return { code_verifier, code_challenge };
    }

    async login_web(code_challenge, cli_flag = true) {
        let code = null;
        const pptr_browser = await puppeteer.use(StealthPlugin()).launch({
            defaultViewport: { width: 1000, height: 1000 },
            headless: (cli_flag) ? true : false,
            // devtools: true,
        });

        console.log('[INFO]: Launched Chromium browser');

        try {
            const login_params = {
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "client": "pixiv-android"
            };
            const login_query = new URLSearchParams(login_params).toString();

            const page = await pptr_browser.newPage();
            const client = await page.target().createCDPSession();

            await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
                Object.defineProperty(navigator, 'webdriver', () => { });
                delete navigator.__proto__.webdriver;
            });
            await page.setDefaultTimeout(180000); //timeout: 3mins

            await client.send('Network.enable');
            await page.goto(`${this.LOGIN_URL}?${login_query}`); // go to the login page
            console.log(`${this.LOGIN_URL}?${login_query}`)

            const userid_input_elementHandle = page.$x(this.userid_input_xpath);
            const password_input_elementHandle = page.$x(this.password_input_xpath);
            const login_button_elementHandle = page.$x(this.login_button_xpath);

            await (await userid_input_elementHandle)[0].type(userid); // input userid
            await (await password_input_elementHandle)[0].type(password); //input password

            await Promise.all([
                page.waitForRequest((request) => { // wait a redirect
                    // console.log(request.url());
                    if (request.url().includes('https://accounts.pixiv.net/post-redirect')) {
                        console.log('[INFO]: Succeed in logging in pixiv');
                    }
                    return request.url().includes('https://accounts.pixiv.net/post-redirect') === true;
                }),
                (await login_button_elementHandle)[0].click(), // click the login button
                this.catch_recaptcha(page, cli_flag) // check recaptcha when cli processing
            ]);
        
            await client.on('Network.requestWillBeSent', (params) => {
                if (params.documentURL.includes("pixiv://")) {
                    console.log("[+]: Success!");
                    code = params.documentURL.match(/code=([^&]*)/)[1];
                    console.log(`[INFO] Get code: ${code}`);
                }
            });

            await page.waitForTimeout(1000);

        } catch (error) {
            console.log('[!]: ' + error);
        } finally {
            await pptr_browser.close();
        }
        return code;
    }

    async catch_recaptcha(page, cli_flag = true) {
        if (cli_flag) {
            await page.waitForTimeout(3000);
            const reCaptchaMsg_Handler = await page.$x(this.recaptcha_prompt_xpath);
            if (reCaptchaMsg_Handler.length > 0) {
                throw new Error("A reCAPTCHA verification is required. Try again with --gui option.");
            }
        }
    }

    async get_token(cli_flag = true) {
        try {
            const { code_verifier, code_challenge } = this.oauth_pkce();
            console.log("[INFO]: Generated code_verifier:", code_verifier);

            const code = await this.login_web(code_challenge, cli_flag);
            if (typeof code != 'string') {
                throw new Error("Failed to obtain a login token. Please try again in the GUI mode.");
            }
        
            const body = {
                "client_id": this.CLIENT_ID,
                "client_secret": this.CLIENT_SECRET,
                "code": code,
                "code_verifier": code_verifier,
                "grant_type": "authorization_code",
                "include_policy": "true",
                "redirect_uri": this.REDIRECT_URI,
            };
            const query = new URLSearchParams(body);
            const response = await fetch(this.AUTH_TOKEN_URL,
                {
                    method: "POST",
                    body: query,
                    headers: {
                        "user-agent": this.USER_AGENT,
                        "app-os-version": "14.6",
                        "app-os": "ios",
                    },
                }
            );
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
            }
            this.print_auth_token_response(response);
        } catch (error) {
            console.log('[!]: ' + error);
        }
    }

    async refresh(refresh_token) {
        try {
            const body = {
                "client_id": this.CLIENT_ID,
                "client_secret": this.CLIENT_SECRET,
                "grant_type": "refresh_token",
                "include_policy": "true",
                "refresh_token": refresh_token,
            };
            const query = new URLSearchParams(body);
            const response = await fetch(this.AUTH_TOKEN_URL,
                {
                    method: "POST",
                    body: query,
                    headers: {
                        "User-Agent": this.USER_AGENT
                    }
                }
            );
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
            }
            this.print_auth_token_response(response);
        } catch (error) {
            console.log('[!]: ' + error);
        }
    }

    async print_auth_token_response(response) {
        const data = await response.json();

        const access_token = data.access_token;
        const refresh_token = data.refresh_token;

        console.log("access_token:", access_token);
        console.log("refresh_token:", refresh_token);
        console.log("expires_in:", ("expires_in" in data) ? data.expires_in : 0);
    }
}

(async () => {
    try {
        const pixivToken = new pixivTokenExtractor();

        if (process.argv[2] == "login") {
            if (process.argv[3] == "--cli") {
                await pixivToken.get_token(true);
            } else if (process.argv[3] == "--gui") {
                await pixivToken.get_token(false);
            } else {
                throw new Error("Too few arguments: specify whether 'login --cli' or 'login --gui' option");
            }
        } else if (process.argv[2] == "refresh") {
            if (!process.argv[3]) {
                throw new Error("Too few arguments: input your refresh token after the 'refresh'");
            } else {
                const old_refresh_token = process.argv[3];
                await pixivToken.refresh(old_refresh_token);
            }
        } else {
            throw new Error("Too few arguments: specify whether 'login --cli', 'login --gui', or 'refresh YOUR_REFRESH_TOKEN' option");
        }

    } catch (e) {
        console.log('[!]: ' + e);
    }
})();
