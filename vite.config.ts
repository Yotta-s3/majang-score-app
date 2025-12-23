import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/majang-score-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Mahjong Score',
        short_name: 'MahjongScore',
        start_url: '/majang-score-app/',
        scope: '/majang-score-app/',
        display: 'standalone',
        background_color: '#f4f2e9',
        theme_color: '#0f5132',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
})
