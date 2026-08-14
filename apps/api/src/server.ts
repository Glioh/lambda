import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { serverConfig } from "./config.js";

const app = buildApp();

closeWithGrace(
  {
    delay: 10_000,
    logger: false,
  },
  async ({ signal, err }) => {
    if (err) {
      app.log.error({ err }, "API server closing due to error");
    } else {
      app.log.info({ signal }, "API server shutting down");
    }

    await app.close();
  },
);

try {
  await app.listen(serverConfig);
} catch (error) {
  app.log.error({ err: error }, "API server failed to start");
  process.exit(1);
}
