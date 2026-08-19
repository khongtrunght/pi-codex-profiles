#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const authPath = process.env.CODEX_AUTH_JSON || join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function accessTokenExpiresAt(token) {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : 0;
}

function accountIdFromAccessToken(token) {
  const payload = decodeJwtPayload(token);
  const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
  return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
}

async function readAuth() {
  try {
    return JSON.parse(await fs.readFile(authPath, "utf8"));
  } catch (error) {
    fail(`Cannot read ${authPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeAuth(auth) {
  await fs.mkdir(dirname(authPath), { recursive: true });
  const tmp = `${authPath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, authPath);
  await fs.chmod(authPath, 0o600).catch(() => {});
}

async function refreshAuth(auth) {
  const refreshToken = auth?.tokens?.refresh_token;
  if (!refreshToken || typeof refreshToken !== "string") {
    fail(`${authPath} has no tokens.refresh_token; cannot refresh without OAuth login.`);
  }

  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });
  } catch (error) {
    fail(`OpenAI token refresh request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  let token;
  try {
    token = JSON.parse(text);
  } catch {
    fail(`OpenAI token refresh returned non-JSON HTTP ${response.status}: ${text}`);
  }
  if (!response.ok) {
    fail(`OpenAI token refresh failed HTTP ${response.status}: ${text}`);
  }
  if (!token.access_token || !token.refresh_token) {
    fail(`OpenAI token refresh response missing tokens: ${text}`);
  }

  const next = {
    ...auth,
    auth_mode: auth.auth_mode || "chatgpt",
    tokens: {
      ...(auth.tokens || {}),
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      id_token: token.id_token || auth.tokens?.id_token,
      account_id: accountIdFromAccessToken(token.access_token) || auth.tokens?.account_id,
    },
    last_refresh: new Date().toISOString(),
  };
  await writeAuth(next);
  return next;
}

let auth = await readAuth();
let accessToken = auth?.tokens?.access_token;
if (!accessToken || Date.now() + REFRESH_SKEW_MS >= accessTokenExpiresAt(accessToken)) {
  auth = await refreshAuth(auth);
  accessToken = auth?.tokens?.access_token;
}

if (!accessToken || typeof accessToken !== "string") {
  fail(`${authPath} has no tokens.access_token`);
}
process.stdout.write(accessToken);
