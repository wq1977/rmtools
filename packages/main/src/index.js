import { app, BrowserWindow, shell, ipcMain } from "electron";
import { join } from "path";
import { URL } from "url";
import { PDFDocument } from "pdf-lib";
const Config = require("electron-store");
Config.initRenderer();
const config = new Config();

import Koa from "koa";
import serve from "koa-static";
const koa = new Koa();
const cors = require("@koa/cors");
const struct = require("python-struct");
const mime = require("mime-types");
const fontkit = require("fontkit");

koa.use(cors());
koa.use(
  serve(require("path").join(require("os").homedir(), ".rmroot", "xochitl"))
);

koa.use(async (ctx, next) => {
  if (ctx.URL.pathname === "/svg") {
    const { pdf, page } = ctx.query;
    const bin = require("fs").readFileSync(
      require("path").join(
        require("os").homedir(),
        ".rmroot",
        "xochitl",
        pdf,
        `${page}.rm`
      )
    );
    const expected_header = "reMarkable .lines file, version=5          ";
    let fmt = `<${expected_header.length}sI`;
    const [_, nlayers] = struct.unpack(fmt, bin);
    let offset = struct.sizeOf(fmt);
    const _stroke_fmt = "<IIIfII";
    const width = 1404;
    const height = 1872;
    let body = `<svg xmlns="http://www.w3.org/2000/svg" height="${height}" width="${width}">`;
    body = `${body}\n<g id="p1" style="display:inline">`;
    for (let layer = 0; layer < nlayers; layer++) {
      fmt = "<I";
      const [nstrokes] = struct.unpackFrom(fmt, bin, false, offset);
      offset += struct.sizeOf(fmt);
      for (let stroke = 0; stroke < nstrokes; stroke++) {
        fmt = _stroke_fmt;
        const stroke_data = struct.unpackFrom(fmt, bin, false, offset);
        offset += struct.sizeOf(fmt);
        const pen = stroke_data[0];
        const nsegments = stroke_data.slice(-1)[0];
        if (pen !== 6) {
          body = `${body}\n<polyline style="fill:none;stroke:black;stroke-width:3;opacity:1" points="`;
        }
        for (let segment = 0; segment < nsegments; segment++) {
          fmt = "<ffffff";
          const [xpos, ypos, pressure, tilt, i_unk2, j_unk2] =
            struct.unpackFrom(fmt, bin, false, offset);
          offset += struct.sizeOf(fmt);
          if (pen !== 6) {
            body = `${body}${xpos},${ypos} `;
          }
        }
        if (pen !== 6) {
          body = `${body}" />\n`;
        }
      }
    }
    body = `${body}</g>\n`;
    body = `${body}</svg>\n`;

    ctx.set("Content-Type", "image/svg+xml");
    ctx.body = body;
    return;
  }
  await next();
});

function fixCss(html) {
  if (html.indexOf("<body") > 0) {
    const defaultStyle = `
    <style>
    ${config
      .get("fonts")
      .map((font) => {
        return `@font-face { 
          font-family: '${font.familyName}';
          src: url('${font.path}');
        }`;
      })
      .join("\n")}  
      ${config.get("extraCss") || ""}
      html {
        font-family: ${
          config.get("defaultFont") ||
          "PingFang SC, Lantinghei SC, Microsoft Yahei, Hiragino Sans GB, Microsoft Sans Serif, WenQuanYi Micro Hei, sans-serif"
        }
      }  
    </style>
    `;
    html = html.replace(/<body/i, `${defaultStyle}<body`);
  }
  html = html.replace(/line-height:.*;/g, "line-height:200%;");
  for (let rep of config.get("fontReplace") || []) {
    html = html.replace(
      new RegExp(`font-family:.*${rep.from}.*;`),
      `font-family:${rep.to};`
    );
  }
  html = html.replace(/<html/i, `<html style="font-size: 12pt"`);
  return html;
}

koa.use(async (ctx, next) => {
  if (require("fs").existsSync(ctx.path)) {
    var mimeType = mime.lookup(ctx.path);
    console.log(ctx.path, mimeType);
    ctx.response.set("content-type", mimeType);
    if (ctx.path.endsWith("html") || ctx.path.endsWith("css")) {
      ctx.body = fixCss(require("fs").readFileSync(ctx.path).toString());
    } else {
      ctx.body = require("fs").readFileSync(ctx.path);
    }
  } else {
    await next();
  }
});

koa.listen(8877);

const isSingleInstance = app.requestSingleInstanceLock();
const isDevelopment = import.meta.env.MODE === "development";

if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}

app.disableHardwareAcceleration();

// Install "Vue.js devtools"
if (isDevelopment) {
  app
    .whenReady()
    .then(() => import("electron-devtools-installer"))
    .then(({ default: installExtension, VUEJS3_DEVTOOLS }) =>
      installExtension(VUEJS3_DEVTOOLS, {
        loadExtensionOptions: {
          allowFileAccess: true,
        },
      })
    )
    .catch((e) => console.error("Failed install extension:", e));
}

let mainWindow = null;

const createWindow = async () => {
  let opts = {
    show: false,
    webPreferences: {
      webSecurity: false,
      nativeWindowOpen: true,
      preload: join(__dirname, "../../preload/dist/index.cjs"),
    },
  };

  Object.assign(opts, config.get("winBounds") || {});
  if (opts.x && opts.x < 0) opts.x = 0;
  if (opts.y && opts.y < 0) opts.y = 0;
  if (opts.width && opts.width < 320) opts.width = 320;
  if (opts.height && opts.height < 240) opts.height = 240;
  mainWindow = new BrowserWindow(opts);

  /**
   * If you install `show: true` then it can cause issues when trying to close the window.
   * Use `show: false` and listener events `ready-to-show` to fix these issues.
   *
   * @see https://github.com/electron/electron/issues/25012
   */
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();

    // if (isDevelopment) {
    //   mainWindow?.webContents.openDevTools();
    // }
  });

  mainWindow.on("close", () => {
    config.set("winBounds", mainWindow.getBounds());
    if (mainWindow.isFullScreen()) {
      config.set("mainWinState", "fullscreen");
    } else if (mainWindow.isMaximized()) {
      config.set("mainWinState", "maxed");
    } else {
      config.set("mainWinState", "normal");
    }
  });

  /**
   * URL for main window.
   * Vite dev server for development.
   * `file://../renderer/index.html` for production and test
   */
  const pageUrl =
    isDevelopment && import.meta.env.VITE_DEV_SERVER_URL !== undefined
      ? import.meta.env.VITE_DEV_SERVER_URL
      : new URL(
          "../renderer/dist/index.html",
          "file://" + __dirname
        ).toString();

  await mainWindow.loadURL(pageUrl);
};

app.on("web-contents-created", (_event, contents) => {
  /**
   * Block navigation to origins not on the allowlist.
   *
   * Navigation is a common attack vector. If an attacker can convince the app to navigate away
   * from its current page, they can possibly force the app to open web sites on the Internet.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-navigation
   */
  contents.on("will-navigate", (event, url) => {
    const allowedOrigins = new Set(); // Do not use insecure protocols like HTTP. https://www.electronjs.org/docs/latest/tutorial/security#1-only-load-secure-content
    const { origin, hostname } = new URL(url);
    const isDevLocalhost = isDevelopment && hostname === "localhost"; // permit live reload of index.html
    if (!allowedOrigins.has(origin) && !isDevLocalhost) {
      console.warn("Blocked navigating to an unallowed origin:", origin);
      event.preventDefault();
    }
  });

  /**
   * Hyperlinks to allowed sites open in the default browser.
   *
   * The creation of new `webContents` is a common attack vector. Attackers attempt to convince the app to create new windows,
   * frames, or other renderer processes with more privileges than they had before; or with pages opened that they couldn't open before.
   * You should deny any unexpected window creation.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
   * @see https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-openexternal-with-untrusted-content
   */
  contents.setWindowOpenHandler(({ url }) => {
    const allowedOrigins = new Set([
      // Do not use insecure protocols like HTTP. https://www.electronjs.org/docs/latest/tutorial/security#1-only-load-secure-content
      "https://vitejs.dev",
      "https://github.com",
      "https://v3.vuejs.org",
    ]);
    const { origin } = new URL(url);
    if (allowedOrigins.has(origin)) {
      shell.openExternal(url);
    } else {
      console.warn("Blocked the opening of an unallowed origin:", origin);
    }
    return { action: "deny" };
  });
});

app.on("second-instance", () => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app
  .whenReady()
  .then(createWindow)
  .catch((e) => console.error("Failed create window:", e));

// Auto-updates
if (import.meta.env.PROD) {
  app
    .whenReady()
    .then(() => import("electron-updater"))
    .then(({ autoUpdater }) => autoUpdater.checkForUpdatesAndNotify())
    .catch((e) => console.error("Failed check updates:", e));
}

ipcMain.handle("select-epub", async () => {
  const { dialog } = require("electron");
  return await dialog.showOpenDialog({
    filters: [{ name: "epub File", extensions: ["epub"] }],
    properties: ["openFile"],
  });
});

ipcMain.handle("select-ttf", async () => {
  const { dialog } = require("electron");
  const path = await dialog.showOpenDialog({
    filters: [{ name: "ttf File", extensions: ["ttf"] }],
    properties: ["openFile"],
  });
  if (!path.canceled && path.filePaths.length > 0) {
    const fonts = Array.from(
      new Set([
        ...path.filePaths,
        ...(config.get("fonts") || []).map((f) => f.path).filter((e) => e),
      ])
    ).map((f) => {
      const font = fontkit.openSync(f);
      return {
        path: f,
        familyName: font.familyName,
      };
    });
    config.set("fonts", fonts);
    if (!config.get("defaultFont")) {
      config.set("defaultFont", fonts[0].familyName);
    }
  }
});

ipcMain.handle("convert-pdf", async function (_, payload) {
  const { src, output } = payload;
  const error = await new Promise(async (resolve) => {
    let win;
    if (payload.debug) {
      win = new BrowserWindow({
        webPreferences: {
          webSecurity: false,
        },
      });
    } else {
      win = new BrowserWindow({
        transparent: true,
        webPreferences: {
          webSecurity: false,
        },
      });
      win.hide();
    }
    win.loadURL(`${src}?seed=${new Date().getTime()}`);
    win.webContents.on("did-finish-load", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const data = await win.webContents.printToPDF({
        marginsType: 1,
        printBackground: true,
        pageSize: {
          width: 157794 - 2 * 10000,
          height: 210392 - 2 * 10000,
        },
      });
      require("fs").writeFile(output, data, (error) => {
        if (error) resolve(error);
        else resolve();
        if (!payload.debug) win.close();
      });
    });
  });
  if (!error) {
    const pdfDoc = await PDFDocument.load(require("fs").readFileSync(output));
    const pages = pdfDoc.getPages();
    for (let page of pages) {
      page.setSize(
        page.getWidth() + Math.round((72 * 2) / 2.54),
        page.getHeight() + Math.round((72 * 2) / 2.54)
      );
      console.log("page size", page.getWidth(), page.getHeight());
      page.translateContent(Math.round(72 / 2.54), Math.round(72 / 2.54));
    }
    require("fs").writeFileSync(output, await pdfDoc.save());
  } else {
    console.log("error:", error);
  }
});
