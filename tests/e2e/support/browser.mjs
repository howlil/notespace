import { remote } from "webdriverio";

export async function connect(target, timeout) {
  let browser;
  try {
    browser = await remote({
      logLevel: process.env.WDIO_LOG_LEVEL ?? "error",
      waitforTimeout: timeout,
      connectionRetryTimeout: 120_000,
      capabilities: {
        browserName: "chrome",
        // BiDi gives deterministic viewport control (mobile layout proof) while
        // ordinary element commands keep using WebDriver Classic.
        webSocketUrl: true,
        "goog:chromeOptions": {
          args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,960"],
        },
      },
    });
    await browser.setWindowSize(1440, 960);
    // Own native dialogs explicitly: the default auto-dismiss handler can race with
    // page detach during teardown and surface as an unhandled BiDi rejection.
    browser.on("dialog", (dialog) => { dialog.dismiss().catch(() => {}); });
    const page = await browser.url(target);
    return { browser, page };
  } catch (error) {
    await browser?.deleteSession().catch(() => {});
    throw error;
  }
}
