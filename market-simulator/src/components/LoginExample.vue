<script setup lang="ts">
import { ref } from 'vue'
import {
  firebaseLogin,
  firebaseLogout,
  listenForLogin,
  User,
} from '../network/users'

const user = ref({} as User)
listenForLogin((u) => {
  user.value = u
})

function objectEmpty(obj: any) {
  // Functional equivalent:
  return Object.keys(obj).length === 0
}
</script>

<template>
  <div v-if="objectEmpty(user)">
    <p>Not logged in!</p>
    <button class="btn btn-primary" @click="firebaseLogin">Login</button>
  </div>
  <div v-else>
    <p>Logged in as {{ user.name }}</p>
    <button class="btn btn-secondary" @click="firebaseLogout">Logout</button>
  </div>
</template>
