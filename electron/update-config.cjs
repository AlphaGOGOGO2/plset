// Public publisher key is pinned in the app. Never fetch a replacement key from the feed.
module.exports = Object.freeze({
  baseUrl: 'https://starjoa.vercel.app',
  // Origins the feed may hand out as download URLs. Lets the site move to starjoa.kr without stranding installed apps.
  origins: ['https://starjoa.vercel.app', 'https://starjoa.kr'],
  appId: 'plset',
  channel: 'stable',
  publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAXGtjnfbtdYIz/cq2IuP9puzE/UtuMYXThrfUu8aHe4A=\n-----END PUBLIC KEY-----\n',
  downloadHosts: [
    'starjoa-releases.422fdb0727aba63712f71787a17f54ee.r2.cloudflarestorage.com',
    '422fdb0727aba63712f71787a17f54ee.r2.cloudflarestorage.com',
  ],
});
