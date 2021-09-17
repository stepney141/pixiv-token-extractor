/* Original: https://gist.github.com/upbit/6edda27cb1644e94183291109b8a5fde */

import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';
import { generators } from 'openid-client';

const { userid, password } = JSON.parse(fs.readFileSync('./env.json'));

/* Latest app version can be found using GET /v1/application-info/android */
const USER_AGENT = "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)";
const REDIRECT_URI = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback";
const LOGIN_URL = "https://app-api.pixiv.net/web/v1/login";
const AUTH_TOKEN_URL = "https://oauth.secure.pixiv.net/auth/token";
const CLIENT_ID = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";

// xpath strings for the automatic login
const userid_input_xpath = '//*[@id="LoginComponent"]/form/div[1]/div[1]/input';
const password_input_xpath = '//*[@id="LoginComponent"]/form/div[1]/div[2]/input';
const login_button_xpath = '//*[@id="LoginComponent"]/form/button';

const oauth_pkce = () => {
    /* Proof Key for Code Exchange by OAuth Public Clients (RFC7636). */
    const code_verifier = generators.codeVerifier(32);
    const code_challenge = generators.codeChallenge(code_verifier);
    return { code_verifier, code_challenge };
};

const login_web = async (code_challenge, cli_flag = true) => {
    let code;
    const pptr_browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        // headless: true,
        headless: (cli_flag) ? true : false,
        // devtools: true,
    });
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
            Object.defineProperty(navigator, 'webdriver', ()=>{});
            delete navigator.__proto__.webdriver;
        });
        await page.setDefaultTimeout(0);

        await client.send('Network.enable');
        await page.goto(`${LOGIN_URL}?${login_query}`); // go to the login page

        const userid_input_elementHandle = page.$x(userid_input_xpath);
        const password_input_elementHandle = page.$x(password_input_xpath);
        const login_button_elementHandle = page.$x(login_button_xpath);
        await (await userid_input_elementHandle)[0].type(userid); // input userid
        await (await password_input_elementHandle)[0].type(password); //input password
        await Promise.all([
            (await login_button_elementHandle)[0].click(), // click the login button
            page.waitForRequest((request) => { // wait a redirect
                return request.url().includes('https://accounts.pixiv.net/post-redirect') === true;
            })
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
};

const get_token = async (cli_flag = true) => {
    try {
        const { code_verifier, code_challenge } = oauth_pkce();
        console.log("[INFO] Gen code_verifier:", code_verifier);
        console.log("[INFO] Gen code_challenge:", code_challenge);

        const code = await login_web(code_challenge, cli_flag);
        if (typeof code != 'string') {
            throw new Error("Failed to obtain a login token. Please try again.");
        }
        
        const body = {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "include_policy": "true",
            "redirect_uri": REDIRECT_URI,
        };
        const query = new URLSearchParams(body);
        const response = await fetch(AUTH_TOKEN_URL,
            {
                method: "POST",
                body: query,
                headers: {
                    "user-agent": USER_AGENT,
                    "app-os-version": "14.6",
                    "app-os": "ios",
                },
            }
        );
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
        }
        print_auth_token_response(response);
    } catch (error) {
        console.log('[!]: ' + error);
    }
};

const print_auth_token_response = async (response) => {
    const data = await response.json();

    const access_token = data.access_token;
    const refresh_token = data.refresh_token;

    console.log("access_token:", access_token);
    console.log("refresh_token:", refresh_token);
    console.log("expires_in:", ("expires_in" in data) ? data.expires_in : 0);
};

const refresh = async (refresh_token) => {
    const body = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token",
        "include_policy": "true",
        "refresh_token": refresh_token,
    };
    const query = new URLSearchParams(body);
    const response = await fetch(AUTH_TOKEN_URL,
        {
            method: "POST",
            body: query,
            headers: {
                "User-Agent": USER_AGENT
            }
        }
    );
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
    }
    print_auth_token_response(response);
};

(async () => {
    try {
        if (process.argv[2] == "login") {
            if (process.argv[3] == "--cli") {
                await get_token(true);
            } else if (process.argv[3] == "--gui") {
                await get_token(false);
            } else {
                throw new Error("Too few arguments: specify whether 'login --cli' or 'login --gui' option")
            }
        } else if (process.argv[2] == "refresh") {
            if (!process.argv[3]) {
                throw new Error("Too few arguments: input your refresh token after the 'refresh'");
            } else {
                const old_refresh_token = process.argv[3];
                await refresh(old_refresh_token);
            }
        } else {
            throw new Error("Too few arguments: specify whether 'login --cli', 'login --gui', or 'refresh YOUR_REFRESH_TOKEN' option");
        }
    } catch (e) {
        console.log('[!]: ' + e);
    }
})();