import { contextBridge } from "electron";

const apiKey = "electron";
/**
 * @see https://github.com/electron/electron/issues/21437#issuecomment-573522360
 */
const api = {
  versions: process.versions,
  /**
   * 将设备内容完整同步到本地
   */
  async sync() {
    const { exec } = require("child_process");
    const dst = require("path").join(require("os").homedir(), ".rmroot");
    return await new Promise((resolve) => {
      exec(
        `rsync -ave ssh root@10.11.99.1:.local/share/remarkable/xochitl ${dst}`,
        (error) => {
          resolve(error ? error.toString() : "");
        }
      );
    });
  },
};

/**
 * The "Main World" is the JavaScript context that your main renderer code runs in.
 * By default, the page you load in your renderer executes code in this world.
 *
 * @see https://www.electronjs.org/docs/api/context-bridge
 */
contextBridge.exposeInMainWorld(apiKey, api);
