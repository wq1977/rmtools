<template>
  <nav>
    <router-link to="/"> Home </router-link>
    <span> | </span>
    <router-link to="/rsync"> RSync </router-link>
    <span> | </span>
    <router-link to="/epub2pdf"> EPub2PDF </router-link>
  </nav>
</template>

<script>
import { defineComponent } from "vue";

export default defineComponent({
  name: "AppNavigation",
});
</script>

<style scoped>
nav {
  display: flex;
  gap: 1em;
  justify-content: center;
}
</style>
