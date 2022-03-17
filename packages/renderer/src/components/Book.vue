<template>
  <div>
    <h2>{{ entry.visibleName }}</h2>
    <div>page count: {{ extra.content ? extra.content.pageCount : "" }}</div>
    <div>
      markPages: {{ extra.markPages ? extra.markPages.length : "" }} :
      <div class="page_root" v-for="page in markPages" :key="page.id">
        <div class="page_container">
          <canvas :ref="`page_${page.no}`" width="200" height="300"></canvas>
          <img
            class="svglayer"
            :src="`http://127.0.0.1:8877/svg?pdf=${this.entry.id}&page=${page.id}`"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import { useElectron } from "/@/use/electron";
export default defineComponent({
  name: "App",
  setup() {
    const { bookinfo } = useElectron();
    return { bookinfo };
  },
  data() {
    return { entry: {}, extra: {} };
  },
  async created() {
    this.entry = JSON.parse(this.$route.params.entry);
    this.extra = await this.bookinfo({ ...this.entry });
  },
  mounted() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";
  },
  watch: {
    markPages(newv) {
      if (!newv) return;
      this.$nextTick(async () => {
        await Promise.all(
          newv.map((p) =>
            this.loadPDF(`http://127.0.0.1:8877/${this.entry.id}.pdf`, p.no)
          )
        );
      });
    },
  },
  computed: {
    markPages() {
      const pages = (this.extra.markPages || []).map((p) => {
        return {
          id: p,
          no: this.extra.content.pages.indexOf(p),
        };
      });
      pages.sort((a, b) => a.no - b.no);
      return pages;
    },
  },
  methods: {
    async loadPDF(url, pageno) {
      var loadingTask = pdfjsLib.getDocument(url);
      const pdf = await loadingTask.promise;
      // Fetch the first page
      var pageNumber = pageno + 1;
      const page = await pdf.getPage(pageNumber);
      var scale = 1.3;
      var viewport = page.getViewport({ scale: scale });

      // Prepare canvas using PDF page dimensions
      var canvas = this.$refs[`page_${pageno}`];
      var context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render PDF page into canvas context
      var renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      var renderTask = page.render(renderContext);
      await renderTask.promise;
    },
    pageno(id) {
      return this.extra.content.pages.indexOf(id);
    },
  },
});
</script>

<style scoped>
.page_container {
  position: relative;
}
.svglayer {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  width: 581px;
  height: 774px;
}
.page_root {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
