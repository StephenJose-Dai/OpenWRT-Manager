import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// 显示加载指示器（在 React 挂载前就能看到）
const root = document.getElementById('root')
root.innerHTML = `
  <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1117;gap:16px">
    <div style="width:48px;height:48px;border:3px solid #21262d;border-top-color:#4f8ef7;border-radius:50%;animation:spin 0.8s linear infinite"></div>
    <div style="color:#484f58;font-size:13px;font-family:-apple-system,sans-serif">正在启动...</div>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
`

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
