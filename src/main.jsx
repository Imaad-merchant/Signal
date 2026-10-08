import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// iOS Safari ignores `user-scalable=no` and only partly honours touch-action,
// so cancel its page pinch-zoom gestures directly. These WebKit gesture events
// don't affect pointer events, so the whiteboard's own pinch-zoom still works.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
