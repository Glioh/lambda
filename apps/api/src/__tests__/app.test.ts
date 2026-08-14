import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  getServerConfig,
} from "../config.js";

describe("API application", () => {
  let app: FastifyInstance;

  after(async () => {
    await app?.close();
  });

  it("returns schema-defined health response", async () => {
    app = buildApp({ logger: false });
    assert.equal(app.server.listening, false);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    assert.match(response.headers["content-type"] ?? "", /application\/json/);
  });

});

describe("API server configuration", () => {
  it("defaults to localhost:4000", () => {
    assert.deepEqual(getServerConfig({}), {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
  });

  it("accepts API-specific environment overrides", () => {
    assert.deepEqual(
      getServerConfig({ API_HOST: "127.0.0.1", API_PORT: "4500" }),
      { host: "127.0.0.1", port: 4500 },
    );
  });

  it("rejects invalid ports", () => {
    for (const rawPort of ["0", "-1", "70000", "abc"]) {
      assert.throws(
        () => getServerConfig({ API_PORT: rawPort }),
        new RegExp(`Invalid API port: ${rawPort}`),
      );
    }
  });
});
