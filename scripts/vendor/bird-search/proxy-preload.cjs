const { ProxyAgent, setGlobalDispatcher } = require("undici");

const proxyUrl = process.env.SOCIAL_PROXY_URL || process.env.INSTAGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}
