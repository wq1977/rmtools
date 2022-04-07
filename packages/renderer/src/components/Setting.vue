<template>
  <div class="flex flex-col m-5">
    <div class="flex flex-row align-center justify-center">
      <button @click="installFont">安装字体</button>
    </div>
  </div>
</template>
<script>
import { useElectron } from "../use/electron";
export default {
  setup() {
    const { installFont } = useElectron();
    return { installFont };
  },

  methods: {},
};
</script>
