import { contextBridge } from "electron";

const apiKey = "electron";
const dst = require("path").join(require("os").homedir(), ".rmroot");
const docbase = require("path").join(dst, "xochitl");
const struct = require("python-struct");

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

function penInfo(pdf, page) {
  const lines = [];
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
      const points = [];
      for (let segment = 0; segment < nsegments; segment++) {
        fmt = "<ffffff";
        const [xpos, ypos, pressure, tilt, i_unk2, j_unk2] = struct.unpackFrom(
          fmt,
          bin,
          false,
          offset
        );
        offset += struct.sizeOf(fmt);
        points.push({ xpos, ypos });
      }
      lines.push({ pen, points });
    }
  }
  console.log(page, lines);
  return lines;
}

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
      .filter((e) => {
        if (!e) return;
        const lines = penInfo(entry.id, e);
        for (let line of lines) {
          if (line.pen !== 6) return true;
        }
      });
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
