# WebDAV NAS 文件管理台

基于 React + TypeScript + Vite 的前端文件管理工具，用于通过 WebDAV 协议访问 NAS 文件。

## 功能特性

- WebDAV 连接：支持地址、用户名、密码、根路径配置
- 文件浏览：目录列表、面包屑导航、返回上级
- 文件操作：上传、下载、重命名、复制、删除、新建目录
- 拖拽交互：拖拽上传、本地触发下载
- 后端链接复制：一键复制 `/files/` 访问链接

## 环境要求

- Node.js 18+
- npm 9+

## 安装与启动

```bash
npm install
npm run dev
```

默认开发地址：

- `http://localhost:5173/`
- 若 5173 端口占用，Vite 会自动切换到其他端口

## 生产构建

```bash
npm run build
```

## 代码检查

```bash
npm run lint
```

## 默认连接配置

当前默认值位于 `src/App.tsx`：

- WebDAV 地址：`自定义`
- 用户名：`自定义`
- 根路径：`/` 或 `/其它/`

## “后端连接”复制规则

点击“后端连接”按钮后，系统会复制链接到剪贴板，规则如下：

- 原路径：`https://hhhhh.geesdev.com:4006/test1/weixintupian.jpg`
- 复制结果：`https://hhhhh.geesdev.com:4006/files/test1/weixintupian.jpg`

即：在域名后自动插入 `/files/`。

## Nginx 注意事项

- `proxy_pass` 不要使用反引号
- 需要正确处理 CORS 预检 `OPTIONS`
- 建议对 `PROPFIND/MKCOL/COPY/MOVE/LOCK/UNLOCK` 等方法放行
- 若使用 HTTPS，请确保证书对浏览器可信
