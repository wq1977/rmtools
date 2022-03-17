<template>
  <div>
    <h2>{{ entry.visibleName }}</h2>
    <div>page count: {{ extra.content ? extra.content.pageCount : "" }}</div>
    <div>markPages: {{ extra.markPages ? extra.markPages.length : "" }}</div>
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
  methods: {},
});
</script>

<style scoped>
div {
  text-align: left;
  display: grid;
  justify-content: center;
}
</style>
