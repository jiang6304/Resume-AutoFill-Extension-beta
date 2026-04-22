import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'

// 自动更新版本号
function incrementVersion(version) {
  const parts = version.split('.').map(Number)
  parts[2] = (parts[2] || 0) + 1  // 增加补丁版本号
  return parts.join('.')
}

// 浏览器插件构建配置
// 只构建扩展需要的文件，不生成多余的 Vite 默认产物
export default defineConfig({
  plugins: [
    vue(),
    // 自定义插件：复制静态文件并清理多余产物
    {
      name: 'copy-plugin-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist')

        // 确保目录存在
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true })
        }

        // 复制manifest.json 并更新版本号
        const manifestSrc = resolve(__dirname, 'public/manifest.json')
        const manifestDest = resolve(distDir, 'manifest.json')
        if (fs.existsSync(manifestSrc)) {
          const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'))
          const newVersion = incrementVersion(manifest.version)
          manifest.version = newVersion
          fs.writeFileSync(manifestDest, JSON.stringify(manifest, null, 2))
          // 同时更新源文件，保持同步
          fs.writeFileSync(manifestSrc, JSON.stringify(manifest, null, 2))
          console.log(`📦 Version updated: ${manifest.version}`)
        }

        // 复制popup目录
        const popupSrc = resolve(__dirname, 'public/popup')
        const popupDest = resolve(distDir, 'popup')
        if (fs.existsSync(popupSrc)) {
          if (!fs.existsSync(popupDest)) {
            fs.mkdirSync(popupDest, { recursive: true })
          }
          fs.readdirSync(popupSrc).forEach(file => {
            fs.copyFileSync(
              resolve(popupSrc, file),
              resolve(popupDest, file)
            )
          })
        }

        // 复制content目录
        const contentSrc = resolve(__dirname, 'public/content')
        const contentDest = resolve(distDir, 'content')
        if (fs.existsSync(contentSrc)) {
          if (!fs.existsSync(contentDest)) {
            fs.mkdirSync(contentDest, { recursive: true })
          }
          fs.readdirSync(contentSrc).forEach(file => {
            fs.copyFileSync(
              resolve(contentSrc, file),
              resolve(contentDest, file)
            )
          })
        }

        // 复制background目录
        const bgSrc = resolve(__dirname, 'public/background')
        const bgDest = resolve(distDir, 'background')
        if (fs.existsSync(bgSrc)) {
          if (!fs.existsSync(bgDest)) {
            fs.mkdirSync(bgDest, { recursive: true })
          }
          fs.readdirSync(bgSrc).forEach(file => {
            fs.copyFileSync(
              resolve(bgSrc, file),
              resolve(bgDest, file)
            )
          })
        }

        // 复制web目录
        const webSrc = resolve(__dirname, 'public/web')
        const webDest = resolve(distDir, 'web')
        if (fs.existsSync(webSrc)) {
          if (!fs.existsSync(webDest)) {
            fs.mkdirSync(webDest, { recursive: true })
          }
          fs.readdirSync(webSrc).forEach(file => {
            fs.copyFileSync(
              resolve(webSrc, file),
              resolve(webDest, file)
            )
          })
        }

        // 复制icons目录
        const iconsSrc = resolve(__dirname, 'public/icons')
        const iconsDest = resolve(distDir, 'icons')
        if (fs.existsSync(iconsSrc)) {
          if (!fs.existsSync(iconsDest)) {
            fs.mkdirSync(iconsDest, { recursive: true })
          }
          fs.readdirSync(iconsSrc).forEach(file => {
            fs.copyFileSync(
              resolve(iconsSrc, file),
              resolve(iconsDest, file)
            )
          })
        }

        // 复制favicon.svg
        const faviconSrc = resolve(__dirname, 'public/favicon.svg')
        const faviconDest = resolve(distDir, 'favicon.svg')
        if (fs.existsSync(faviconSrc)) {
          fs.copyFileSync(faviconSrc, faviconDest)
        }

        // 清理 Vite 默认生成的多余文件
        const filesToClean = [
          'index.html',
          'index.js',
          'dummy.js'
        ]
        const dirsToClean = [
          'assets',
          'chunks'
        ]

        filesToClean.forEach(file => {
          const filePath = resolve(distDir, file)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            console.log(`Cleaned: ${file}`)
          }
        })

        dirsToClean.forEach(dir => {
          const dirPath = resolve(distDir, dir)
          if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true })
            console.log(`Cleaned: ${dir}/`)
          }
        })

        console.log('✅ Browser extension built successfully!')
        console.log('📂 Output: frontend/dist/')
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    // 禁用 Vite 默认的 HTML 入口
    rollupOptions: {
      input: {
        // 使用一个空的入口点，避免生成 index.html
        dummy: resolve(__dirname, 'src/dummy.js')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  publicDir: false, // 禁用 publicDir 自动复制，由上面的插件手动处理
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
