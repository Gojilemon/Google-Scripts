import { useMemo, useRef, useState } from 'react'
import { createClient, type FileStat, type WebDAVClient } from 'webdav'
import './App.css'

type ConnectionForm = {
  remoteURL: string
  username: string
  password: string
  basePath: string
}

const initialForm: ConnectionForm = {
  remoteURL: 'http://127.0.0.1:5005/',
  username: 'a1',
  password: '',
  basePath: '/',
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '-'
  }
  if (bytes === 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / 1024 ** index
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

const normalizePath = (value: string): string => {
  const clean = value.trim().replace(/\/{2,}/g, '/')
  if (!clean || clean === '.') {
    return '/'
  }
  const withLeadingSlash = clean.startsWith('/') ? clean : `/${clean}`
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash
}

const joinPath = (base: string, name: string): string => {
  const normalizedBase = normalizePath(base)
  const cleanName = name.replace(/^\/+/, '')
  if (!cleanName) {
    return normalizedBase
  }
  return normalizedBase === '/' ? `/${cleanName}` : `${normalizedBase}/${cleanName}`
}

const getBaseName = (fullPath: string): string => {
  const normalized = normalizePath(fullPath)
  if (normalized === '/') {
    return '/'
  }
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

const inferDisplayName = (entry: Partial<FileStat>): string => {
  if (entry.basename && entry.basename.trim()) {
    return entry.basename
  }
  if (entry.filename) {
    const name = getBaseName(entry.filename)
    if (name && name !== '/') {
      try {
        return decodeURIComponent(name)
      } catch {
        return name
      }
    }
  }
  return '未命名'
}

function App() {
  const clientRef = useRef<WebDAVClient | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState<ConnectionForm>(initialForm)
  const [isConnected, setIsConnected] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [isDraggingUpload, setIsDraggingUpload] = useState(false)
  const [isDraggingDownload, setIsDraggingDownload] = useState(false)
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<FileStat[]>([])
  const [message, setMessage] = useState('请输入 NAS WebDAV 地址并连接。')
  const [draggingEntry, setDraggingEntry] = useState<FileStat | null>(null)

  const rootPath = useMemo(() => normalizePath(form.basePath || '/'), [form.basePath])
  const breadcrumbs = useMemo(() => {
    const full = normalizePath(currentPath)
    const root = normalizePath(rootPath)
    if (full === root) {
      return [{ label: root === '/' ? '根目录' : root, path: root }]
    }
    const relative = full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full.slice(1)
    const parts = relative.split('/').filter(Boolean)
    const result = [{ label: root === '/' ? '根目录' : root, path: root }]
    let acc = root
    for (const segment of parts) {
      acc = joinPath(acc, segment)
      result.push({ label: segment, path: acc })
    }
    return result
  }, [currentPath, rootPath])

  const safeAction = async (runner: () => Promise<void>) => {
    setIsBusy(true)
    try {
      await runner()
    } catch (error) {
      const raw = error instanceof Error ? error.message : '未知错误'
      if (/failed to fetch|networkerror|cors|certificate|ssl/i.test(raw)) {
        setMessage(
          `请求失败：${raw}。请确认 NAS 开启 CORS 且允许来源 http://localhost:5173，并检查证书是否受浏览器信任。`,
        )
      } else if (/401|403|unauthorized|forbidden/i.test(raw)) {
        setMessage(`鉴权失败：${raw}。请确认用户名/密码和 WebDAV 权限。`)
      } else {
        setMessage(raw)
      }
    } finally {
      setIsBusy(false)
    }
  }

  const loadDirectory = async (targetPath: string) => {
    const client = clientRef.current
    if (!client) {
      return
    }
    const normalized = normalizePath(targetPath)
    const list = await client.getDirectoryContents(normalized)
    const items = Array.isArray(list) ? list : [list]
    const cleaned = items
      .filter((entry) => Boolean(entry.filename))
      .map((entry) => ({
        ...entry,
        basename: inferDisplayName(entry),
      }))
      .filter((entry) => normalizePath(entry.filename) !== normalized)
    const sorted = [...cleaned].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }
      return inferDisplayName(left).localeCompare(inferDisplayName(right), 'zh-CN')
    })
    setEntries(sorted)
    setCurrentPath(normalized)
    setMessage(`当前目录：${normalized}，共 ${sorted.length} 项。`)
  }

  const connect = async () => {
    if (!form.remoteURL.trim()) {
      setMessage('请先输入 WebDAV 地址。')
      return
    }
    await safeAction(async () => {
      const client = createClient(form.remoteURL.trim(), {
        username: form.username || undefined,
        password: form.password || undefined,
      })
      clientRef.current = client
      await loadDirectory(rootPath)
      setIsConnected(true)
      setMessage('连接成功。')
    })
  }

  const goParent = () => {
    if (currentPath === rootPath) {
      return
    }
    const parent = normalizePath(currentPath.split('/').slice(0, -1).join('/') || '/')
    const clamped = parent.length < rootPath.length ? rootPath : parent
    void safeAction(async () => {
      await loadDirectory(clamped)
    })
  }

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!clientRef.current || fileList.length === 0) {
      return
    }
    await safeAction(async () => {
      for (const file of Array.from(fileList)) {
        const remotePath = joinPath(currentPath, file.name)
        const buffer = await file.arrayBuffer()
        await clientRef.current?.putFileContents(remotePath, buffer, { overwrite: true })
      }
      await loadDirectory(currentPath)
      setMessage(`上传完成，共 ${fileList.length} 个文件。`)
    })
  }

  const downloadFile = async (entry: FileStat) => {
    if (!clientRef.current || entry.type !== 'file') {
      return
    }
    await safeAction(async () => {
      const binary = await clientRef.current?.getFileContents(entry.filename, { format: 'binary' })
      const blob =
        binary instanceof Blob
          ? binary
          : new Blob([binary as ArrayBuffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = entry.basename
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage(`已开始下载：${entry.basename}`)
    })
  }

  const deleteEntry = async (entry: FileStat) => {
    if (!clientRef.current) {
      return
    }
    if (!window.confirm(`确定删除 ${entry.basename} 吗？`)) {
      return
    }
    await safeAction(async () => {
      if (entry.type === 'directory') {
        await clientRef.current?.deleteFile(entry.filename)
      } else {
        await clientRef.current?.deleteFile(entry.filename)
      }
      await loadDirectory(currentPath)
      setMessage(`已删除：${entry.basename}`)
    })
  }

  const renameEntry = async (entry: FileStat) => {
    if (!clientRef.current) {
      return
    }
    const nextName = window.prompt('输入新名称：', entry.basename)?.trim()
    if (!nextName || nextName === entry.basename) {
      return
    }
    await safeAction(async () => {
      const nextPath = joinPath(currentPath, nextName)
      await clientRef.current?.moveFile(entry.filename, nextPath)
      await loadDirectory(currentPath)
      setMessage(`已重命名为：${nextName}`)
    })
  }

  const copyEntry = async (entry: FileStat) => {
    if (!clientRef.current) {
      return
    }
    const defaultName =
      entry.type === 'directory' ? `${entry.basename}-副本` : `${entry.basename}.copy`
    const nextName = window.prompt('输入副本名称：', defaultName)?.trim()
    if (!nextName) {
      return
    }
    await safeAction(async () => {
      const nextPath = joinPath(currentPath, nextName)
      await clientRef.current?.copyFile(entry.filename, nextPath)
      await loadDirectory(currentPath)
      setMessage(`已复制：${nextName}`)
    })
  }

  const createFolder = async () => {
    if (!clientRef.current) {
      return
    }
    const name = window.prompt('新建目录名称：')?.trim()
    if (!name) {
      return
    }
    await safeAction(async () => {
      await clientRef.current?.createDirectory(joinPath(currentPath, name))
      await loadDirectory(currentPath)
      setMessage(`已新建目录：${name}`)
    })
  }

  return (
    <main className="app-shell">
      <header className="title-bar">
        <div>
          <h1>NAS WebDAV 文件台</h1>
          <p>连接 NAS 后即可进行上传、下载、重命名、复制和删除等常见文件操作。</p>
        </div>
        <span className={`status-chip ${isConnected ? 'ok' : 'idle'}`}>
          {isConnected ? '已连接' : '未连接'}
        </span>
      </header>

      <section className="panel connection-panel">
        <div className="fields">
          <label>
            WebDAV 地址
            <input
              value={form.remoteURL}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, remoteURL: event.target.value }))
              }}
              placeholder="http://127.0.0.1:5005/ 或 https://nas.example.com:5006"
            />
          </label>
          <label>
            用户名
            <input
              value={form.username}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, username: event.target.value }))
              }}
              placeholder="可选"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={form.password}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, password: event.target.value }))
              }}
              placeholder="可选"
            />
          </label>
          <label>
            根路径
            <input
              value={form.basePath}
              onChange={(event) => {
                setForm((previous) => ({ ...previous, basePath: event.target.value }))
              }}
              placeholder="/"
            />
          </label>
        </div>
        <button className="primary-btn" onClick={() => void connect()} disabled={isBusy}>
          {isBusy ? '处理中...' : '连接 NAS'}
        </button>
      </section>

      <section className="panel workspace">
        <div className="toolbar">
          <div className="breadcrumbs">
            {breadcrumbs.map((crumb) => (
              <button key={crumb.path} onClick={() => void safeAction(async () => loadDirectory(crumb.path))}>
                {crumb.label}
              </button>
            ))}
          </div>
          <div className="toolbar-actions">
            <button onClick={goParent} disabled={isBusy || currentPath === rootPath}>
              返回上级
            </button>
            <button onClick={() => void createFolder()} disabled={isBusy || !isConnected}>
              新建目录
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy || !isConnected}
            >
              上传文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) {
                  void uploadFiles(event.target.files)
                  event.target.value = ''
                }
              }}
            />
          </div>
        </div>

        <div
          className={`drop-upload ${isDraggingUpload ? 'active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDraggingUpload(true)
          }}
          onDragLeave={() => setIsDraggingUpload(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDraggingUpload(false)
            if (event.dataTransfer.files.length > 0) {
              void uploadFiles(event.dataTransfer.files)
            }
          }}
        >
          把本地文件拖到这里即可上传
        </div>

        <div className="list-wrap">
          {entries.length === 0 ? (
            <div className="empty-tip">当前目录为空</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>类型</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.filename}
                    draggable={entry.type === 'file'}
                    onDragStart={() => setDraggingEntry(entry)}
                    onDragEnd={() => setDraggingEntry(null)}
                  >
                    <td>
                      {entry.type === 'directory' ? (
                        <button
                          className="link-btn"
                          onClick={() => void safeAction(async () => loadDirectory(entry.filename))}
                        >
                          📁 {entry.basename}
                        </button>
                      ) : (
                        <span>📄 {getBaseName(entry.filename)}</span>
                      )}
                    </td>
                    <td>{entry.type === 'directory' ? '目录' : '文件'}</td>
                    <td>{entry.type === 'directory' ? '-' : formatBytes(entry.size)}</td>
                    <td>{entry.lastmod || '-'}</td>
                    <td>
                      <div className="row-actions">
                        {entry.type === 'file' && (
                          <button onClick={() => void downloadFile(entry)}>下载</button>
                        )}
                        <button onClick={() => void renameEntry(entry)}>重命名</button>
                        <button onClick={() => void copyEntry(entry)}>复制</button>
                        <button className="danger" onClick={() => void deleteEntry(entry)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          className={`drop-download ${isDraggingDownload ? 'active' : ''}`}
          onDragOver={(event) => {
            if (draggingEntry?.type === 'file') {
              event.preventDefault()
              setIsDraggingDownload(true)
            }
          }}
          onDragLeave={() => setIsDraggingDownload(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDraggingDownload(false)
            if (draggingEntry && draggingEntry.type === 'file') {
              void downloadFile(draggingEntry)
            }
          }}
        >
          把文件行拖到这里可触发下载
        </div>
      </section>

      <section className="panel status-bar">
        <span>{message}</span>
      </section>
    </main>
  )
}

export default App
