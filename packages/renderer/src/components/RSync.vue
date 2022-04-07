<template>
  <div>
    <span v-if="syncing"> Syncing ... </span>
    <div v-else>
      <span v-if="error"> {{ error }} </span>
      <button
        class="mt-5 bg-sky-500 hover:bg-sky-700 px-5 py-2 text-sm leading-5 rounded-full font-semibold text-white"
        @click="dosync"
      >
        Do Sync
      </button>
    </div>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import { useElectron } from "/@/use/electron";
export default defineComponent({
  name: "App",
  setup() {
    const { sync } = useElectron();
    return { sync };
  },
  data() {
    return {
      syncing: false,
      error: "",
    };
  },
  methods: {
    async dosync() {
      this.syncing = true;
      this.error = await this.sync();
      if (!this.error) {
        this.error = "succ";
      }
      this.syncing = false;
    },
  },
});
</script>

<style scoped>
div {
  text-align: left;
  display: grid;
  justify-content: center;
}
</style>
