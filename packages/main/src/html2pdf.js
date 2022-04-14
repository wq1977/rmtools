import { screen, BrowserWindow } from "electron";
const PDFDocument = require("pdfkit");

const PAGE_WIDTH = 596;
const PAGE_HEIGHT = 795;
const onecm = 72 / 2.54;
const MARGIN_X = onecm;
const MARGIN_TOP = onecm * 1.5;
const MARGIN_BOTTOM = onecm;

/**
 * 函数接收chrome返回的没有分页的dom，然后按照 MARGIN 设定将其合理分页
 *
 * 分页的原则是，保证不超出 MARGIN 的范围，图片合理化分页
 * dom 包含 rect 属性，格式化以后应该包含 page 和 pageTop 属性
 *
 * 具体的方法是:
 *
 * 1、格式化出单独的每个页面的高度来容纳所有内容，比如第一页，高度v1， 第二页，高度v2
 *   1.1、 第一页高度为0，尝试放置dom0，dom1，直至无法放置
 *   1.2、 增加一页，将其起始高度设置为上一页不能放置的dom的高度，开始在第二页放置dom
 * 2、按照格式化好的页面放置dom
 *
 * @param {*} doms 没有分页的位置
 * @returns
 */
function layoutPage(doms) {
  const result = [];
  const pages = [0];
  const pageHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  for (let idx in doms) {
    const e = doms[idx];
    if (
      idx > 0 &&
      e.rect.top + e.rect.height - pages[pages.length - 1] >= pageHeight
    ) {
      pages.push(e.rect.top);
    }
  }

  for (let e of doms) {
    let pageIdx = 0;
    for (let i = 0; i < pages.length; i++) {
      if (
        pages[i] <= e.rect.top &&
        (i === pages.length - 1 || pages[i + 1] > e.rect.top)
      ) {
        pageIdx = i;
        break;
      }
    }
    e.pageIdx = pageIdx;
    e.pageTop = e.rect.top - pages[pageIdx] + MARGIN_TOP;
    result.push(e);
  }

  return result;
}

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
      runJS(
        win,
        (pageW, marginX) => {
          document.body.style.width = `${pageW}px`;
          document.body.style.padding = `0 ${marginX}px`;
          document.body.style.margin = "0";
          document.body.style.boxSizing = "border-box";
          document.body.style.border = "solid 1px black";
          //remove empty block
          [...document.querySelectorAll("p")].forEach((p) => {
            if (!p.innerText.trim() && !p.querySelector("img"))
              p.style.display = "none";
          });
          [...document.querySelectorAll("img")].forEach((img) => {
            img.style.maxWidth = `${pageW - 2 * marginX}px`;
            img.style.height = "auto";
          });
        },
        PAGE_WIDTH,
        MARGIN_X
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await saveToPdf(win, output);
      if (!payload.debug) win.close();
      resolve(null);
    });
  });
};

/**
 * 合并文本以进一步减小生成的PDF的体积，
 * 如果连续N行文本在同一页且left和width都相同则合并
 *
 * @param {*} doms
 */
function mergeDOM(doms) {
  let result = [];
  let lastLine;
  for (let elem of doms) {
    if (elem.type !== "#text") {
      result.push(elem);
      continue;
    }
    if (!lastLine) {
      lastLine = { ...elem };
      continue;
    }
    if (
      elem.rect.left !== lastLine.rect.left ||
      elem.rect.width !== lastLine.rect.width ||
      elem.fontSize !== lastLine.fontSize ||
      elem.fontFamily !== lastLine.fontFamily ||
      elem.fontWeight !== lastLine.fontWeight ||
      Math.floor(elem.rect.top / PAGE_HEIGHT) !=
        Math.floor(lastLine.rect.top / PAGE_HEIGHT)
    ) {
      result.push(lastLine);
      lastLine = { ...elem };
      continue;
    }

    lastLine.content += elem.content;
    lastLine.lines = (lastLine.lines || 1) + 1;
    lastLine.rect.height = elem.rect.top + elem.rect.height - lastLine.rect.top;
  }
  if (lastLine) {
    result.push(lastLine);
  }
  return result;
}

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
      if (node.nodeName === "#text") {
        const str = node.textContent;
        if (str.trim().length <= 0) return; //忽略没有内容的文本
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
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: 0,
  });
  const out = require("fs").createWriteStream(output);
  doc.pipe(out);

  const fonts = {
    kai: "/Users/wesleywang/Library/Fonts/方正楷体_GBK.ttf",
    hei: "/Users/wesleywang/Library/Fonts/fzlth_gbk.ttf",
    song: "/Users/wesleywang/code/self/crackRM2/FZSSJW.ttf",
  };
  for (let f in fonts) {
    doc.registerFont(f, fonts[f]);
  }

  const newdom = layoutPage(doms);

  for (let elem of newdom) {
    if (elem.type === "#text") {
      const font =
        elem.fontFamily.toLowerCase().indexOf("hei") >= 0
          ? "hei"
          : elem.fontFamily.toLowerCase().indexOf("kai") >= 0
          ? "kai"
          : "song";
      let pageIdx = elem.pageIdx;
      while (doc.bufferedPageRange().count < pageIdx + 1) {
        doc.addPage();
      }
      doc.switchToPage(pageIdx);
      const width = doc
        .font(font)
        .fontSize(parseInt(elem.fontSize))
        .widthOfString(elem.content);
      const height = doc
        .font(font)
        .fontSize(parseInt(elem.fontSize))
        .heightOfString("中");
      doc.x = elem.rect.left;
      doc.y = elem.pageTop + (elem.rect.height - height) / 2;
      doc
        .font(font)
        .fontSize(parseInt(elem.fontSize))
        .text(elem.content, {
          height: elem.rect.height,
          characterSpacing:
            (elem.rect.width - width) / (elem.content.length - 1),
        });
      // doc
      //   .rect(elem.rect.left, elem.pageTop, elem.rect.width, elem.rect.height)
      //   .stroke();
    } else if (elem.type === "IMG") {
      let pageIdx = elem.pageIdx;
      while (doc.bufferedPageRange().count < pageIdx + 1) {
        doc.addPage();
      }
      doc.switchToPage(pageIdx);
      doc.image(elem.data, elem.rect.left, elem.pageTop, {
        width: Math.min(elem.rect.width, PAGE_WIDTH - 2 * MARGIN_X),
      });
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
