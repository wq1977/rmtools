import { contextBridge, ipcRenderer } from "electron";

const apiKey = "electron";
const dst = require("path").join(require("os").homedir(), ".rmroot");
const docbase = require("path").join(dst, "xochitl");
const struct = require("python-struct");
var epubParser = require("epub-parser");
const AdmZip = require("adm-zip");
const md5 = require("md5");
import { PDFDocument } from "pdf-lib";

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
  return lines;
}

/**
 * @see https://github.com/electron/electron/issues/21437#issuecomment-573522360
 */
const api = {
  versions: process.versions,

  async selectePub() {
    return await ipcRenderer.invoke("select-epub");
  },
  async unzip(path, out) {
    const zip = new AdmZip(path);
    zip.extractAllTo(out, true);
  },

  async convertPartPdf(src, output, debug = false) {
    const dir = require("path").dirname(output);
    if (!require("fs").existsSync(dir)) {
      require("fs").mkdirSync(dir);
    }
    await ipcRenderer.invoke("convert-pdf", { src, output, debug });
  },
  async download(book, progress) {
    const pdfDoc = await PDFDocument.create();
    const cover = book.cover.toLowerCase();
    let coverImg;
    if (cover.endsWith(".jpg") || cover.endsWith(".jpeg")) {
      coverImg = await pdfDoc.embedJpg(require("fs").readFileSync(book.cover));
    } else {
      coverImg = await pdfDoc.embedPng(require("fs").readFileSync(book.cover));
    }
    console.log("cover", coverImg.width, coverImg.height);
    const scale = Math.min(447 / coverImg.width, 596 / coverImg.height);
    const coverDims = coverImg.scale(scale);
    const page = pdfDoc.addPage();
    page.setSize(447, 596);
    page.drawImage(coverImg, {
      x: page.getWidth() / 2 - coverDims.width / 2,
      y: page.getHeight() / 2 - coverDims.height / 2,
      width: coverDims.width,
      height: coverDims.height,
    });
    for (let idx in book.content) {
      const item = book.content[idx];
      progress(idx, book.content.length);
      if (item.id.indexOf("titlepage") >= 0) continue;
      console.log("progress:", item.label);
      const path = await api.itemPdfPath(item);
      const pdfA = await PDFDocument.load(
        require("fs").readFileSync(path.substr(7))
      );
      const copiedPagesA = await pdfDoc.copyPages(pdfA, pdfA.getPageIndices());
      copiedPagesA.forEach((page) => pdfDoc.addPage(page));
    }
    require("fs").writeFileSync(book.output, await pdfDoc.save());
  },
  async itemPdfPath(item) {
    const { id, base, src, tempbase } = item;
    const tempPDF = require("path").join(tempbase, "pdf");
    const pdfPath = require("path").join(tempPDF, `${id}.pdf`);
    if (!require("fs").existsSync(pdfPath)) {
      const tempEpub = require("path").join(tempbase, "epub");
      await api.convertPartPdf(
        `http://127.0.0.1:8877${tempEpub}/${base}${src}`,
        pdfPath,
        item.debug
      );
    }
    return `file://${pdfPath}`;
  },

  async convertePub(path) {
    const epub = await new Promise((resolve, reject) => {
      epubParser.open(path, function (err, epubData) {
        if (err) return reject(err);
        resolve(epubData);
      });
    });
    console.log(epub);
    const tempbase = require("fs").mkdtempSync(
      require("path").join(require("os").tmpdir(), md5(path))
    );
    const tempEpub = require("path").join(tempbase, "epub");
    api.unzip(path, tempEpub);
    const ncxmap = epub.raw.json.ncx.navMap[0].navPoint.reduce(
      (r, navPoint) => {
        const id = navPoint.$.id;
        const label = navPoint.navLabel[0].text[0];
        r[id] = label;
        return r;
      },
      {}
    );
    return {
      src: path,
      cover: require("path").join(tempEpub, epub.easy.epub2CoverUrl),
      output: require("path").join(
        require("path").dirname(path),
        require("path").basename(path).replace(".epub", ".pdf")
      ),
      content: epub.raw.json.opf.spine[0].itemref.map((item) => {
        const id = item.$.item.$.id;
        const src = item.$.item.$.href;
        return {
          id,
          src,
          base: epub.paths.opsRoot,
          label: ncxmap[id] || `__${id}`,
          tempbase,
        };
      }),
    };
  },

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
