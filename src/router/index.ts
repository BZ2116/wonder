import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import History from '@/views/History.vue'
import HistoryDetail from '@/views/HistoryDetail.vue'
import Settings from '@/views/Settings.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/history', name: 'history', component: History },
    { path: '/history/:id', name: 'history-detail', component: HistoryDetail, props: true },
    { path: '/settings', name: 'settings', component: Settings },
  ],
})

export default router
