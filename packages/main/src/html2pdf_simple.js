import { BrowserWindow } from "electron";
import { PDFDocument } from "pdf-lib";

/**
 *
 * 直接Print2PDF生成的PDF体积过大，这是因为为了达到最佳匹配，
 * Chrome采用一个文字一个文字的方式生成PDF，所以必须避免这个
 * 现象，采用一段一段文字生成的方式，这样才能减小生成的PDF的体积，
 * 对于只有几个G容量的Kindle类设备来说，这个非常重要
 *
 * @param {*} src
 * @param {*} output
 */
export default async (payload) => {
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
};
