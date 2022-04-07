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
        <iframe ref="iframe" class="w-full h-full" />
      </div>
    </div>
  </div>
</template>
<script>
import { useElectron } from "../use/electron";
export default {
  setup() {
    const { selectePub, convertePub, itemPdfPath, download } = useElectron();
    return { selectePub, convertePub, itemPdfPath, download };
  },
  data() {
    return {
      book: false,
      dprogress: 0,
      dtotal: 0,
      downing: false,
    };
  },
  methods: {
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
      }
    },
    async openBook(item) {
      console.log(item);
      this.$refs.iframe.src = await this.itemPdfPath({ ...item, debug: true });
    },
  },
};
</script>
