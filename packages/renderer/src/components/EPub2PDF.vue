<template>
  <div class="p-5 grid place-items-center">
    <div class="flex items-center justify-center">
      <button class="mr-3" @click="loadepub">选择 EPub 文件</button>
      <span v-if="book" class="mr-3"> {{ book.src }}</span>
      <button v-if="book" class="mr-3" @click="doDownload(book)">
        下载全书
      </button>
      <span v-if="downing">{{ dprogress }} / {{ dtotal }}</span>
    </div>
    <div class="p-5" v-if="showMore">
      <table
        class="table-auto border-collapse border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 shadow-sm"
      >
        <tr>
          <td class="border border-slate-300">默认字体:</td>
          <td class="border border-slate-300">
            <select
              v-model="defaultFont"
              @change="setDefault"
              class="mr-3"
              v-if="book"
            >
              <option
                :value="font.familyName"
                :key="font.familyName"
                v-for="font in fonts"
              >
                {{ font.familyName }}
              </option>
            </select>
          </td>
        </tr>
        <tr>
          <td class="border border-slate-300">额外样式：</td>
          <td class="border border-slate-300">
            <textarea
              @change="setec"
              v-model="extraCss"
              rows="5"
              class="w-96"
            ></textarea>
          </td>
        </tr>
      </table>
    </div>
    <div class="flex w-full mt-5" v-if="book">
      <div class="mr-3 w-96">
        <div
          @click="openBook(item)"
          v-for="(item, idx) in book.content"
          :key="idx"
        >
          {{ item.label }}
        </div>
      </div>
      <div class="flex-1">
        <iframe ref="iframe" style="min-height: 70vh" class="w-full h-full" />
      </div>
    </div>
  </div>
</template>
<script>
import { useElectron } from "../use/electron";
export default {
  setup() {
    const {
      selectePub,
      convertePub,
      itemPdfPath,
      download,
      getFonts,
      getDefaultFont,
      setDefaultFont,
      getExtraCSS,
      setExtraCSS,
    } = useElectron();
    return {
      selectePub,
      convertePub,
      itemPdfPath,
      download,
      getFonts,
      getDefaultFont,
      setDefaultFont,
      getExtraCSS,
      setExtraCSS,
    };
  },
  data() {
    return {
      book: false,
      dprogress: 0,
      dtotal: 0,
      downing: false,
      defaultFont: this.getDefaultFont(),
      showMore: false,
      extraCss: this.getExtraCSS(),
    };
  },
  computed: {
    fonts() {
      return this.getFonts();
    },
  },
  methods: {
    setec() {
      this.setExtraCSS(this.extraCss);
    },
    setDefault() {
      this.setDefaultFont(this.defaultFont);
    },
    async doDownload(book) {
      this.downing = true;
      await this.download(
        {
          ...book,
          content: book.content.map((i) => ({ ...i })),
        },
        (p, t) => {
          this.dprogress = p;
          this.dtotal = t;
        }
      );
      this.$refs.iframe.src = `file://${book.output}`;
      this.downing = false;
    },
    async loadepub() {
      const result = await this.selectePub();
      if (result.filePaths.length > 0) {
        this.book = await this.convertePub(result.filePaths[0]);
        setTimeout(() => {
          this.openBook(
            this.book.content[Math.floor(this.book.content.length / 2)]
          );
        }, 1000);
      }
    },
    async openBook(item) {
      this.$refs.iframe.src = await this.itemPdfPath({ ...item, debug: true });
    },
  },
};
</script>
