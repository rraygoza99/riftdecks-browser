import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/riftdecks': {
        target: 'https://riftdecks.com',
        changeOrigin: true,
        secure: true,
        // Rewrite cookie domain so the browser stores riftdecks.com cookies
        // under localhost and sends them back on subsequent proxy requests.
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path.replace(/^\/riftdecks/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            )
            proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8')
            proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9')
            proxyReq.setHeader('Referer', 'https://riftdecks.com/')
            proxyReq.setHeader('Upgrade-Insecure-Requests', '1')
            proxyReq.setHeader('Sec-Fetch-Dest', 'document')
            proxyReq.setHeader('Sec-Fetch-Mode', 'navigate')
            proxyReq.setHeader('Sec-Fetch-Site', 'same-origin')
            proxyReq.setHeader('Sec-Fetch-User', '?1')
            proxyReq.setHeader('Cache-Control', 'max-age=0')
          })
        },
      },
    },
  },
})
