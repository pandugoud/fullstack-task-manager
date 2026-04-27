import express from 'express'
import mongoose from 'mongoose'
import Task from '../models/Task.js'
import ActivityLog from '../models/ActivityLog.js'
import authMiddleware from '../middleware/authMiddleware.js'

const router = express.Router()

const createLog = async ({ user, task, action, message }) => {
  await ActivityLog.create({
    user,
    task: task || null,
    action,
    message
  })
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      status = 'All',
      priority = 'All',
      tag = 'All',
      search = '',
      sort = 'newest'
    } = req.query

    const filter = {
      user: req.user.id
    }

    if (status !== 'All') {
      filter.status = status
    }

    if (priority !== 'All') {
      filter.priority = priority
    }

    if (tag !== 'All') {
      filter.tags = tag
    }

    if (search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { tags: { $regex: search.trim(), $options: 'i' } }
      ]
    }

    let sortOption = { createdAt: -1 }

    if (sort === 'oldest') sortOption = { createdAt: 1 }
    if (sort === 'dueDate') sortOption = { dueDate: 1 }
    if (sort === 'priority') sortOption = { priority: 1 }

    const tasks = await Task.find(filter).sort(sortOption)
    res.json(tasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description = '',
      priority = 'Medium',
      status = 'Pending',
      dueDate = null,
      tags = [],
      subtasks = []
    } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' })
    }

    const cleanedTags = Array.isArray(tags)
      ? tags.map(tag => String(tag).trim()).filter(Boolean)
      : []

    const cleanedSubtasks = Array.isArray(subtasks)
      ? subtasks
          .filter(item => item?.title?.trim())
          .map(item => ({
            title: item.title.trim(),
            completed: Boolean(item.completed)
          }))
      : []

    const task = await Task.create({
      user: req.user.id,
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      dueDate: dueDate || null,
      tags: cleanedTags,
      subtasks: cleanedSubtasks
    })

    await createLog({
      user: req.user.id,
      task: task._id,
      action: 'CREATE_TASK',
      message: `Created task "${task.title}"`
    })

    res.status(201).json(task)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    const {
      title,
      description,
      priority,
      status,
      dueDate,
      tags,
      subtasks
    } = req.body

    if (title !== undefined) task.title = title.trim() || task.title
    if (description !== undefined) task.description = description.trim()
    if (priority) task.priority = priority
    if (status) task.status = status
    if (dueDate !== undefined) task.dueDate = dueDate || null

    if (Array.isArray(tags)) {
      task.tags = tags.map(tag => String(tag).trim()).filter(Boolean)
    }

    if (Array.isArray(subtasks)) {
      task.subtasks = subtasks
        .filter(item => item?.title?.trim())
        .map(item => ({
          title: item.title.trim(),
          completed: Boolean(item.completed)
        }))
    }

    const updatedTask = await task.save()

    await createLog({
      user: req.user.id,
      task: updatedTask._id,
      action: 'UPDATE_TASK',
      message: `Updated task "${updatedTask.title}"`
    })

    res.json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    task.status =
      task.status === 'Completed' ? 'Pending' : 'Completed'

    const updatedTask = await task.save()

    await createLog({
      user: req.user.id,
      task: updatedTask._id,
      action: 'TOGGLE_TASK',
      message: `Changed status of "${updatedTask.title}" to ${updatedTask.status}`
    })

    res.json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/:id/subtasks', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Subtask title is required' })
    }

    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    task.subtasks.push({
      title: title.trim(),
      completed: false
    })

    const updatedTask = await task.save()
    const addedSubtask = updatedTask.subtasks[updatedTask.subtasks.length - 1]

    await createLog({
      user: req.user.id,
      task: updatedTask._id,
      action: 'ADD_SUBTASK',
      message: `Added subtask "${addedSubtask.title}" to "${updatedTask.title}"`
    })

    res.status(201).json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.patch('/:taskId/subtasks/:subtaskId/toggle', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.taskId,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    const subtask = task.subtasks.id(req.params.subtaskId)

    if (!subtask) {
      return res.status(404).json({ message: 'Subtask not found' })
    }

    subtask.completed = !subtask.completed

    const updatedTask = await task.save()

    await createLog({
      user: req.user.id,
      task: updatedTask._id,
      action: 'TOGGLE_SUBTASK',
      message: `Toggled subtask "${subtask.title}" in "${updatedTask.title}"`
    })

    res.json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.delete('/:taskId/subtasks/:subtaskId', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.taskId,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    const subtask = task.subtasks.id(req.params.subtaskId)

    if (!subtask) {
      return res.status(404).json({ message: 'Subtask not found' })
    }

    const subtaskTitle = subtask.title
    subtask.deleteOne()

    const updatedTask = await task.save()

    await createLog({
      user: req.user.id,
      task: updatedTask._id,
      action: 'DELETE_SUBTASK',
      message: `Deleted subtask "${subtaskTitle}" from "${updatedTask.title}"`
    })

    res.json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    const title = task.title
    const taskId = task._id

    await task.deleteOne()

    await createLog({
      user: req.user.id,
      task: taskId,
      action: 'DELETE_TASK',
      message: `Deleted task "${title}"`
    })

    res.json({ message: 'Task deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const total = await Task.countDocuments({ user: req.user.id })
    const pending = await Task.countDocuments({ user: req.user.id, status: 'Pending' })
    const inProgress = await Task.countDocuments({ user: req.user.id, status: 'In Progress' })
    const completed = await Task.countDocuments({ user: req.user.id, status: 'Completed' })

    res.json({ total, pending, inProgress, completed })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/logs/activity', authMiddleware, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)

    res.json(logs)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id
    })

    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    res.json(task)
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'Invalid task id' })
    }
    res.status(500).json({ message: error.message })
  }
})

export default router