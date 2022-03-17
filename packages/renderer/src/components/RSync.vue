<template>
  <div>
    <span v-if="syncing"> Syncing ... </span>
    <div v-else>
      <span v-if="error"> {{ error }} </span>
      <button @click="dosync">Do Sync</button>
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
