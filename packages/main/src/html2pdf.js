import { screen, BrowserWindow } from "electron";
const PDFDocument = require("pdfkit");

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
  await new Promise(async (resolve) => {
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
      runJS(win, () => {
        document.body.style.width = "596px";
        document.body.style.padding = "0 1cm";
        document.body.style.margin = "0";
        document.body.style.boxSizing = "border-box";
        document.body.style.border = "solid 1px black";
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      await saveToPdf(win, output);
      if (!payload.debug) win.close();
      resolve(null);
    });
  });
};

/**
 * 将HTML浏览器窗口里的内容保存到PDF里,具体的方法就是，
 * 遍历HTML里面的每一个dom元素，将其放置在HTML对应的位置
 *
 * 我们只关注 文本和图片，暂时不关注那些下划线之类的内容
 *
 * @param {*} win
 * @param {*} output
 */
async function saveToPdf(win, output) {
  const doms = await runJS(win, () => {
    const result = [];
    function getDataUrl(img) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/jpeg");
    }
    function loopNode(node, result) {
      console.log(node.nodeName);
      if (node.nodeName === "#text") {
        const str = node.textContent;
        const style = window.getComputedStyle(node.parentNode);
        let height, lastidx;
        var range = document.createRange();
        for (let i = 0; i < str.length; i++) {
          if (!lastidx && lastidx !== 0) {
            lastidx = i;
          }
          range.setStart(node, lastidx);
          range.setEnd(node, i + 1);
          let bound = range.getBoundingClientRect();
          if (!height || i === str.length - 1) {
            if (i === str.length - 1) {
              result.push({
                type: node.nodeName,
                rect: {
                  left: bound.left,
                  top: bound.top,
                  width: bound.width,
                  height: bound.height,
                },
                content: str.slice(lastidx).trim(),
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                fontFamily: style.fontFamily,
              });
            } else {
              height = bound.height;
            }
            continue;
          }
          if (bound.height !== height) {
            range.setEnd(node, i);
            bound = range.getBoundingClientRect();
            result.push({
              type: node.nodeName,
              rect: {
                left: bound.left,
                top: bound.top,
                width: bound.width,
                height: bound.height,
              },
              content: str.slice(lastidx, i).trim(),
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              fontFamily: style.fontFamily,
            });
            lastidx = i;
            height = null;
          }
        }
      } else if (node.nodeName.toUpperCase() === "IMG") {
        console.log("add img node", node.src);
        const bound = node.getBoundingClientRect();
        result.push({
          type: node.nodeName.toUpperCase(),
          rect: {
            left: bound.left,
            top: bound.top,
            width: bound.width,
            height: bound.height,
          },
          data: getDataUrl(node),
          src: node.src,
        });
      }
      if (node.childNodes) {
        for (let n of node.childNodes) {
          loopNode(n, result);
        }
      }
    }
    loopNode(document.body, result);
    return result;
  });

  const doc = new PDFDocument({
    bufferPages: true,
    autoFirstPage: false,
    size: [596, 795],
    margin: 0,
  });
  const out = require("fs").createWriteStream(output);
  doc.pipe(out);

  // console.log("DPI:", screen.getPrimaryDisplay().scaleFactor);
  const onecm = 72 / 2.54;
  const PAGE_HEIGHT = Math.round(795 - 2 * onecm);
  const fonts = {
    kai: "/Users/wesleywang/Library/Fonts/方正楷体_GBK.ttf",
    hei: "/Users/wesleywang/Library/Fonts/fzlth_gbk.ttf",
    song: "/Users/wesleywang/code/self/crackRM2/FZSSJW.ttf",
  };
  for (let f in fonts) {
    doc.registerFont(f, fonts[f]);
  }
  for (let elem of doms) {
    if (elem.type === "#text") {
      const font =
        elem.fontFamily.indexOf("Hei") >= 0
          ? "hei"
          : elem.fontFamily.indexOf("Kai") >= 0
          ? "kai"
          : "song";
      let pageIdx = Math.floor(elem.rect.top / PAGE_HEIGHT);
      while (doc.bufferedPageRange().count < pageIdx + 1) {
        doc.addPage();
      }
      doc.switchToPage(pageIdx);
      doc.x = elem.rect.left;
      doc.y = (elem.rect.top % PAGE_HEIGHT) + onecm;
      const width = doc
        .font(font)
        .fontSize(parseInt(elem.fontSize))
        .widthOfString(elem.content);
      doc
        .font(font)
        .fontSize(parseInt(elem.fontSize))
        .text(elem.content, {
          height: elem.rect.height,
          characterSpacing:
            (elem.rect.width - width) / (elem.content.length - 1),
        });
    } else if (elem.type === "IMG") {
      let pageIdx = Math.floor(elem.rect.top / PAGE_HEIGHT);
      while (doc.bufferedPageRange().count < pageIdx + 1) {
        doc.addPage();
      }
      doc.switchToPage(pageIdx);
      console.log(elem.data, elem.rect.left, elem.rect.width);
      doc.image(
        elem.data,
        elem.rect.left,
        (elem.rect.top % PAGE_HEIGHT) + onecm,
        {
          width: elem.rect.width,
          height: elem.rect.height,
        }
      );
      if ((elem.rect.top % PAGE_HEIGHT) + onecm + elem.rect.height > 795) {
        pageIdx += 1;
        if (doc.bufferedPageRange().count < pageIdx + 1) {
          doc.addPage();
        }
        doc.switchToPage(pageIdx);
        doc.image(
          elem.data,
          elem.rect.left,
          795 - ((elem.rect.top % PAGE_HEIGHT) + onecm + elem.rect.height),
          {
            width: elem.rect.width,
            height: elem.rect.height,
          }
        );
      }
    }
  }
  doc.end();
  await new Promise((resolve) => {
    out.on("close", resolve);
  });
  console.log("write end");
}

async function runJS(win, func) {
  const code =
    "(" +
    func +
    `)(${[...arguments]
      .slice(2)
      .map((s) => JSON.stringify(s))
      .join(",")})`;
  return await win.webContents.executeJavaScript(code);
}
