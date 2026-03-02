const test = require("node:test");
const assert = require("node:assert/strict");
const { refreshAccessToken } = require("../lib/lightroom-client");

test("refreshAccessToken uses refresh token flow", async () => {
  const originalFetch = global.fetch;
  process.env.ADOBE_CLIENT_ID = "test-client";
  process.env.ADOBE_CLIENT_SECRET = "test-secret";

  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        access_token: "access-123",
        refresh_token: "refresh-456",
        expires_in: 3600,
      }),
    });

    const result = await refreshAccessToken("refresh-abc");
    assert.equal(result.access_token, "access-123");
    assert.equal(result.refresh_token, "refresh-456");
    assert.equal(result.expires_in, 3600);
  } finally {
    global.fetch = originalFetch;
  }
});
