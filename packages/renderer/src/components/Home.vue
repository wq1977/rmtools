<template>
  <p>Welcome</p>
</template>

<script>
import { defineComponent, ref } from "vue";

export default defineComponent({
  name: "HelloWorld",
  setup() {
    const count = ref(0);

    return { count };
  },
});
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
a {
  color: #42b983;
}
</style>
