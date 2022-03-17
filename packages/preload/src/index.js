import { contextBridge } from "electron";

const apiKey = "electron";
const dst = require("path").join(require("os").homedir(), ".rmroot");
const docbase = require("path").join(dst, "xochitl");
const allEntry = require("fs")
  .readdirSync(docbase)
  .map((entry) => {
    if (entry.endsWith(".metadata")) {
      return {
        ...JSON.parse(
          require("fs")
            .readFileSync(require("path").join(docbase, entry))
            .toString()
        ),
        id: entry.split(".metadata")[0],
      };
    }
  })
  .filter((e) => e);
/**
 * @see https://github.com/electron/electron/issues/21437#issuecomment-573522360
 */
const api = {
  versions: process.versions,
  dst,
  allEntry,
  /**
   * 将设备内容完整同步到本地
   */
  async sync() {
    const { exec } = require("child_process");
    return await new Promise((resolve) => {
      exec(
        `rsync -ave ssh root@10.11.99.1:.local/share/remarkable/xochitl ${dst}`,
        (error) => {
          resolve(error ? error.toString() : "");
        }
      );
    });
  },
  async bookinfo(entry) {
    const content = JSON.parse(
      require("fs")
        .readFileSync(require("path").join(docbase, `${entry.id}.content`))
        .toString()
    );
    const markPages = require("fs")
      .readdirSync(require("path").join(docbase, entry.id))
      .map((e) => {
        if (e.endsWith(".rm")) return e.split(".rm")[0];
      })
      .filter((e) => e);
    return { content, markPages };
  },
};

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */
contextBridge.exposeInMainWorld(apiKey, api);
