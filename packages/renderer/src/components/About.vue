<template>
  <div>
    <span v-if="syncing"> Syncing ... </span>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import { useElectron } from "/@/use/electron";
export default defineComponent({
  name: "App",
  data() {
    return {
      syncing: false,
    };
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
