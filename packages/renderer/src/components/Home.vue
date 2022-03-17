<template>
  <div>
    <p>Welcome</p>
    <div class="entry_container">
      <div @click="path.splice(-1)" v-if="path.length > 0">..</div>
      <div
        v-for="entry in allEntry.filter(
          (e) => e.parent === (path.length > 0 ? path[path.length - 1] : '')
        )"
        @click="entryclick(entry)"
        :key="entry.id"
        class="entry"
      >
        <i v-if="entry.type === 'CollectionType'" class="fa fa-folder-open"></i>
        <i v-else class="fa fa-book"></i>
        {{ entry.visibleName }}
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref } from "vue";
import { useElectron } from "/@/use/electron";

export default defineComponent({
  name: "HelloWorld",
  setup() {
    const { allEntry } = useElectron();
    return { allEntry };
  },
  data() {
    return {
      path: [],
    };
  },
  methods: {
    entryclick(entry) {
      if (entry.type === "CollectionType") {
        this.path.push(entry.id);
      } else {
        this.$router.push({
          name: "Book",
          params: { entry: JSON.stringify(entry) },
        });
      }
    },
  },
});
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
a {
  color: #42b983;
}
.entry_container {
  display: flex;
  flex-wrap: wrap;
}
.entry {
  padding: 1em;
}
</style>
