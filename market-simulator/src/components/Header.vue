<template>
  <nav
    class="
      relative
      mx-auto
      flex
      items-center
      justify-between
      px-12
      bg-blue-gray-700
      h-16
    "
    aria-label="Global"
  >
    <div class="flex items-center flex-1">
      <div class="flex items-center justify-between w-full md:w-auto">
        <a href="#">
          <span class="text-white font-mono">Mantic Markets</span>
        </a>
      </div>
      <div class="space-x-8 md:flex md:ml-10">
        <a
          v-for="item in [
            {
              name: 'About',
              href: 'https://mantic.notion.site/About-Mantic-Markets-09bdde9044614e62a27477b4b1bf77ea',
            },
            { name: 'Simulator', href: 'https://simulator.mantic.markets' },
          ]"
          :key="item.name"
          :href="item.href"
          class="text-base font-medium text-white hover:text-gray-300"
        >
          {{ item.name }}
        </a>
      </div>
    </div>
  </nav>
</template>
