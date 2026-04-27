import { useEffect, useMemo, useState } from 'react'

const emptyAuthForm = {
  name: '',
  email: '',
  password: ''
}

const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'Medium',
  status: 'Pending',
  dueDate: '',
  tagsInput: '',
  subtasks: []
}

async function parseResponse(res) {
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

function formatDate(date) {
  if (!date) return 'No due date'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'No due date'
  return d.toLocaleDateString()
}

function getInitialTheme() {
  const saved = localStorage.getItem('theme')
  if (saved) return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [mode, setMode] = useState('login')
  const [theme, setTheme] = useState(getInitialTheme)
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  const [authForm, setAuthForm] = useState(emptyAuthForm)
  const [taskForm, setTaskForm] = useState(emptyTaskForm)
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [editingId, setEditingId] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [tagFilter, setTagFilter] = useState('All')
  const [sort, setSort] = useState('newest')

  const [authError, setAuthError] = useState('')
  const [taskError, setTaskError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [taskLoading, setTaskLoading] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }

  const handleAuthChange = (e) => {
    const { name, value } = e.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleTaskChange = (e) => {
    const { name, value } = e.target
    setTaskForm((prev) => ({ ...prev, [name]: value }))
  }

  const saveSession = (data) => {
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setToken(data.token)
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken('')
    setUser(null)
    setTasks([])
    setLogs([])
    setEditingId(null)
    setTaskForm(emptyTaskForm)
    setAuthForm(emptyAuthForm)
    setAuthError('')
    setTaskError('')
  }

  const handleRegister = async (e) => {
    e.preventDefault()

    try {
      setAuthLoading(true)
      setAuthError('')

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Registration failed')

      saveSession(data)
      setAuthForm(emptyAuthForm)
    } catch (error) {
      setAuthError(error.message || 'Registration failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()

    try {
      setAuthLoading(true)
      setAuthError('')

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password
        })
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Login failed')

      saveSession(data)
      setAuthForm(emptyAuthForm)
    } catch (error) {
      setAuthError(error.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const loadTasks = async () => {
    if (!token) return

    try {
      setTaskLoading(true)
      setTaskError('')

      const params = new URLSearchParams()
      if (search.trim()) params.append('search', search.trim())
      if (statusFilter !== 'All') params.append('status', statusFilter)
      if (priorityFilter !== 'All') params.append('priority', priorityFilter)
      if (tagFilter !== 'All') params.append('tag', tagFilter)
      params.append('sort', sort)

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Failed to load tasks')

      setTasks(Array.isArray(data) ? data : [])
    } catch (error) {
      setTaskError(error.message || 'Failed to load tasks')
    } finally {
      setTaskLoading(false)
    }
  }

  const loadLogs = async () => {
    if (!token) return

    try {
      const res = await fetch('/api/tasks/logs/activity', {
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Failed to load logs')

      setLogs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error(error.message)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [token, search, statusFilter, priorityFilter, tagFilter, sort])

  useEffect(() => {
    loadLogs()
  }, [token])

  const handleTaskSubmit = async (e) => {
    e.preventDefault()

    if (!taskForm.title.trim()) {
      setTaskError('Task title is required')
      return
    }

    try {
      setTaskError('')

      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        status: taskForm.status,
        dueDate: taskForm.dueDate || null,
        tags: taskForm.tagsInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        subtasks: taskForm.subtasks
          .map((item) => ({
            title: item.title.trim(),
            completed: Boolean(item.completed)
          }))
          .filter((item) => item.title)
      }

      if (editingId) {
        const res = await fetch(`/api/tasks/${editingId}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload)
        })

        const data = await parseResponse(res)
        if (!res.ok) throw new Error(data.message || 'Failed to update task')

        setTasks((prev) => prev.map((task) => (task._id === editingId ? data : task)))
        setEditingId(null)
      } else {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(payload)
        })

        const data = await parseResponse(res)
        if (!res.ok) throw new Error(data.message || 'Failed to create task')

        setTasks((prev) => [data, ...prev])
      }

      setTaskForm(emptyTaskForm)
      loadLogs()
    } catch (error) {
      setTaskError(error.message || 'Task save failed')
    }
  }

  const handleEdit = (task) => {
    setEditingId(task._id)
    setTaskForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'Medium',
      status: task.status || 'Pending',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      tagsInput: Array.isArray(task.tags) ? task.tags.join(', ') : '',
      subtasks: Array.isArray(task.subtasks) ? task.subtasks : []
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Delete failed')

      setTasks((prev) => prev.filter((task) => task._id !== id))
      loadLogs()
    } catch (error) {
      setTaskError(error.message || 'Delete failed')
    }
  }

  const handleToggleTask = async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Status update failed')

      setTasks((prev) => prev.map((task) => (task._id === id ? data : task)))
      loadLogs()
    } catch (error) {
      setTaskError(error.message || 'Status update failed')
    }
  }

  const addSubtaskField = () => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, { title: '', completed: false }]
    }))
  }

  const updateSubtaskField = (index, value) => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((item, i) =>
        i === index ? { ...item, title: value } : item
      )
    }))
  }

  const removeSubtaskField = (index) => {
    setTaskForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index)
    }))
  }

  const toggleSubtask = async (taskId, subtaskId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Subtask toggle failed')

      setTasks((prev) => prev.map((task) => (task._id === taskId ? data : task)))
      loadLogs()
    } catch (error) {
      setTaskError(error.message || 'Subtask toggle failed')
    }
  }

  const deleteSubtask = async (taskId, subtaskId) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await parseResponse(res)
      if (!res.ok) throw new Error(data.message || 'Subtask delete failed')

      setTasks((prev) => prev.map((task) => (task._id === taskId ? data : task)))

      if (editingId === taskId) {
        setTaskForm((prev) => ({
          ...prev,
          subtasks: data.subtasks || []
        }))
      }

      loadLogs()
    } catch (error) {
      setTaskError(error.message || 'Subtask delete failed')
    }
  }

  const groupedTasks = useMemo(() => {
    return {
      Pending: tasks.filter((task) => task.status === 'Pending'),
      'In Progress': tasks.filter((task) => task.status === 'In Progress'),
      Completed: tasks.filter((task) => task.status === 'Completed')
    }
  }, [tasks])

  const stats = useMemo(() => {
    const total = tasks.length
    const pending = tasks.filter((task) => task.status === 'Pending').length
    const inProgress = tasks.filter((task) => task.status === 'In Progress').length
    const completed = tasks.filter((task) => task.status === 'Completed').length
    return { total, pending, inProgress, completed }
  }, [tasks])

  const allTags = useMemo(() => {
    const tags = tasks.flatMap((task) => task.tags || [])
    return [...new Set(tags)]
  }, [tasks])

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-visual">
          <div className="auth-brand">
            <span className="brand-chip">TaskFlow Pro</span>
            <h1>Manage work with a cleaner premium dashboard.</h1>
            <p>Track tasks, subtasks, priorities, and progress in one focused workspace.</p>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-card">
            <div className="auth-head">
              <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>

            <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="auth-form">
              {mode === 'register' ? (
                <input
                  type="text"
                  name="name"
                  placeholder="Full name"
                  value={authForm.name}
                  onChange={handleAuthChange}
                />
              ) : null}

              <input
                type="email"
                name="email"
                placeholder="Email address"
                value={authForm.email}
                onChange={handleAuthChange}
              />

              <input
                type="password"
                name="password"
                placeholder="Password"
                value={authForm.password}
                onChange={handleAuthChange}
              />

              <button type="submit" className="primary-btn large-btn" disabled={authLoading}>
                {authLoading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {authError ? <p className="error">{authError}</p> : null}

            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setMode((prev) => (prev === 'login' ? 'register' : 'login'))
                setAuthError('')
              }}
            >
              {mode === 'login'
                ? 'Need an account? Register'
                : 'Already have an account? Login'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <div className="logo-box">
            <div className="logo-mark">T</div>
            <div>
              <h2>TaskFlow</h2>
              <p>Premium board</p>
            </div>
          </div>

          <nav className="side-nav">
            <button type="button" className="nav-item active">Dashboard</button>
            <button type="button" className="nav-item">Board</button>
            <button type="button" className="nav-item">Activity</button>
            <button type="button" className="nav-item">Settings</button>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="mini-user-card">
            <span>{user?.name?.[0] || 'U'}</span>
            <div>
              <strong>{user?.name || 'User'}</strong>
              <small>{user?.email || ''}</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace overview</p>
            <h1>Welcome back, {user?.name || 'User'}</h1>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>

            <button type="button" className="secondary-btn" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="stat-card">
            <span>Total tasks</span>
            <strong>{stats.total}</strong>
            <small>All work items in your board</small>
          </div>

          <div className="stat-card">
            <span>Pending</span>
            <strong>{stats.pending}</strong>
            <small>Tasks not started yet</small>
          </div>

          <div className="stat-card">
            <span>In progress</span>
            <strong>{stats.inProgress}</strong>
            <small>Currently active tasks</small>
          </div>

          <div className="stat-card">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
            <small>Finished work items</small>
          </div>
        </section>

        <section className="toolbar">
          <input
            type="text"
            placeholder="Search title, description, or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>

          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="All">All Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="All">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="dueDate">Due Date</option>
            <option value="priority">Priority</option>
          </select>
        </section>

        <section className="content-grid">
          <div className="left-panel">
            <div className="panel-card form-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Task editor</p>
                  <h2>{editingId ? 'Update task' : 'Create a task'}</h2>
                </div>
              </div>

              <form onSubmit={handleTaskSubmit} className="task-form">
                <input
                  type="text"
                  name="title"
                  placeholder="Task title"
                  value={taskForm.title}
                  onChange={handleTaskChange}
                />

                <textarea
                  name="description"
                  rows="4"
                  placeholder="Write a short description"
                  value={taskForm.description}
                  onChange={handleTaskChange}
                />

                <div className="split-grid">
                  <select name="priority" value={taskForm.priority} onChange={handleTaskChange}>
                    <option value="High">High priority</option>
                    <option value="Medium">Medium priority</option>
                    <option value="Low">Low priority</option>
                  </select>

                  <select name="status" value={taskForm.status} onChange={handleTaskChange}>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <input
                  type="date"
                  name="dueDate"
                  value={taskForm.dueDate}
                  onChange={handleTaskChange}
                />

                <input
                  type="text"
                  name="tagsInput"
                  placeholder="Comma separated tags"
                  value={taskForm.tagsInput}
                  onChange={handleTaskChange}
                />

                <div className="subtask-builder">
                  <div className="subtask-head">
                    <h3>Subtasks</h3>
                    <button type="button" className="small-btn" onClick={addSubtaskField}>
                      Add subtask
                    </button>
                  </div>

                  {taskForm.subtasks.length === 0 ? (
                    <p className="muted">No subtasks added yet.</p>
                  ) : (
                    <div className="subtask-fields">
                      {taskForm.subtasks.map((subtask, index) => (
                        <div className="subtask-row" key={subtask._id || index}>
                          <input
                            type="text"
                            placeholder={`Subtask ${index + 1}`}
                            value={subtask.title}
                            onChange={(e) => updateSubtaskField(index, e.target.value)}
                          />
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => removeSubtaskField(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-btn">
                    {editingId ? 'Update task' : 'Create task'}
                  </button>

                  {editingId ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setEditingId(null)
                        setTaskForm(emptyTaskForm)
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>

              {taskError ? <p className="error">{taskError}</p> : null}
            </div>

            <div className="panel-card activity-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Recent changes</p>
                  <h2>Activity log</h2>
                </div>
              </div>

              {logs.length === 0 ? (
                <p className="muted">No activity yet.</p>
              ) : (
                <div className="activity-list">
                  {logs.map((log) => (
                    <div className="activity-item" key={log._id}>
                      <div className="activity-dot" />
                      <div className="activity-copy">
                        <p>{log.message}</p>
                        <small>{new Date(log.createdAt).toLocaleString()}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="right-panel">
            <div className="board-grid">
              {Object.entries(groupedTasks).map(([column, columnTasks]) => (
                <div className="board-column" key={column}>
                  <div className="board-column-head">
                    <div>
                      <h2>{column}</h2>
                      <p>{columnTasks.length} tasks</p>
                    </div>
                    <span className="count-pill">{columnTasks.length}</span>
                  </div>

                  {taskLoading ? (
                    <div className="empty-card">Loading tasks...</div>
                  ) : columnTasks.length === 0 ? (
                    <div className="empty-card">No tasks in this column.</div>
                  ) : (
                    <div className="task-list">
                      {columnTasks.map((task) => (
                        <div className="task-card" key={task._id}>
                          <div className="task-card-head">
                            <div>
                              <h3>{task.title}</h3>
                              <p>{task.description || 'No description added yet.'}</p>
                            </div>

                            <span className={`badge ${(task.priority || 'medium').toLowerCase()}`}>
                              {task.priority}
                            </span>
                          </div>

                          <div className="card-meta">
                            <span>Due: {formatDate(task.dueDate)}</span>
                            <span>Status: {task.status}</span>
                          </div>

                          <div className="tag-list">
                            {(task.tags || []).map((tag) => (
                              <span className="tag" key={tag}>
                                #{tag}
                              </span>
                            ))}
                          </div>

                          <div className="subtasks-box">
                            <div className="subtasks-title-row">
                              <h4>Subtasks</h4>
                              <span>{task.subtasks?.length || 0}</span>
                            </div>

                            {!task.subtasks || task.subtasks.length === 0 ? (
                              <p className="muted">No subtasks</p>
                            ) : (
                              <div className="subtask-list">
                                {task.subtasks.map((subtask, index) => (
                                  <div className="subtask-item" key={subtask._id || index}>
                                    <label className="checkbox-row">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(subtask.completed)}
                                        onChange={() => toggleSubtask(task._id, subtask._id)}
                                      />
                                      <span className={subtask.completed ? 'subtask-done' : ''}>
                                        {subtask.title}
                                      </span>
                                    </label>

                                    {subtask._id ? (
                                      <button
                                        type="button"
                                        className="text-btn danger-text"
                                        onClick={() => deleteSubtask(task._id, subtask._id)}
                                      >
                                        Delete
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="task-actions">
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={() => handleToggleTask(task._id)}
                            >
                              {task.status === 'Completed' ? 'Mark pending' : 'Toggle status'}
                            </button>

                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleEdit(task)}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => handleDelete(task._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}