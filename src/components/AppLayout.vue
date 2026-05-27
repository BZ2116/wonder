<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">NF</div>
        <div>
          <h1>Note Forge</h1>
          <p>Research Desk</p>
        </div>
      </div>
      <nav>
        <RouterLink to="/">单篇分析</RouterLink>
        <RouterLink to="/history">历史记录</RouterLink>
        <RouterLink to="/settings">设置</RouterLink>
      </nav>
    </aside>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

.sidebar {
  background: #1a1a2e;
  color: #fff;
  padding: 24px 18px;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 32px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid #f0c040;
  color: #f0c040;
  font-weight: 700;
}

.brand h1 {
  margin: 0;
  font-size: 19px;
}

.brand p {
  margin: 4px 0 0;
  color: #c8c8d8;
  font-size: 12px;
}

nav {
  display: grid;
  gap: 8px;
}

nav a {
  color: #d8d8e8;
  text-decoration: none;
  padding: 10px 12px;
  border-radius: 6px;
}

nav a.router-link-active {
  background: #f0c040;
  color: #1a1a2e;
  font-weight: 700;
}

.content {
  min-width: 0;
  padding: 28px;
  background: #faf8f5;
}
</style>
