const chalk = require('chalk')
const util = require('./util')
const events = require('deltachat-node/events')

class ChatMessage {
  constructor (msgId, dc) {
    this._msgId = msgId
    this._dc = dc
  }

  toString () {
    const msg = this._dc.getMessage(this._msgId)
    if (msg !== null) {
      // TODO now since we are completely dynamic when rendering messages
      // we can put all sorts of state here to show that a message was
      // delivered etc
      const fromId = msg.getFromId()
      const text = msg.getText().replace(/\n/gi, '')
      const timestamp = msg.getTimestamp()
      return `${chalk.yellow(timestamp)}:[${fromId}] > ${text}`
    }
  }
}

class AbstractPage {
  constructor (name) {
    this._name = name
    this._lines = []
    this._allLines = []
    this._scrollback = 0
  }

  render (state, width, height) {
    const all = this._allLines = this._lines.reduce((accum, line) => {
      if (typeof line !== 'string') line = line.toString()
      accum.push.apply(accum, util.wrapAnsi(line, width))
      return accum
    }, [])

    const scrollback = Math.min(this._scrollback, all.length - height)

    if (all.length < height) {
      return all.concat(Array(height - all.length).fill(''))
    }

    return all.slice(
      all.length - height - scrollback,
      all.length - scrollback
    )
  }

  name () {
    return this._name
  }

  pageUp (height) {
    const rest = this._allLines.length - height
    if (rest > 0) {
      this._scrollback = Math.min(this._scrollback + 1, rest)
    }
  }

  pageDown () {
    this._scrollback = Math.max(0, this._scrollback - 1)
  }

  append (obj) {
    if (typeof obj === 'string') {
      obj.split('\n').forEach(line => this._lines.push(line))
    } else {
      this._lines.push(obj)
    }
  }
}

class DebugPage extends AbstractPage {
  constructor () {
    super('debug')
  }

  appendMessage (event, data1, data2) {
    // TODO we might want to tweak the verbosity here since
    // there are rather many info events
    const eventStr = chalk.yellow(events[event] || '<unknown-event>')
    this.append(`${eventStr} (${chalk.green(event)}) ${data1} ${data2}`)
  }
}

class StatusPage extends AbstractPage {
  constructor () {
    super('status')
  }
}

class ChatPage extends AbstractPage {
  constructor (chatId, dc) {
    super('')
    this.chatId = chatId
    this._dc = dc
  }

  name () {
    return `#${this._dc.getChat(this.chatId).getName()}`
  }

  appendMessage (msgId) {
    this.append(new ChatMessage(msgId, this._dc))
  }
}

class State {
  constructor (rc, dc) {
    this._rc = rc
    this._dc = dc
    this._page = 0
    this._pages = []

    if (this._rc.debug) {
      this.debug = new DebugPage()
      this._pages.push(this.debug)
    }

    this.status = new StatusPage()
    this._pages.push(this.status)
  }

  loadChats () {
    this._allChats().forEach(chatId => {
      const msgIds = this._dc.getChatMessages(chatId, 0, 0)
      msgIds.forEach(msgId => this.appendToChat(chatId, msgId))
    })
  }

  appendToChat (chatId, msgId) {
    this._getChatPage(chatId).appendMessage(msgId)
  }

  onEnter (line) {
    const page = this.currentPage()
    if (typeof page.chatId === 'number') {
      // TODO this seems to take some time, measure this and log
      // to debug window
      this._dc.sendTextMessage(page.chatId, line)
    }
  }

  appendToStatusPage (line) {
    this.status.append(line)
  }

  logEvent (event, data1, data2) {
    if (this._rc.debug) {
      this.debug.appendMessage(event, data1, data2)
    }
  }

  currentPage () {
    return this._pages[this._page]
  }

  nextPage () {
    this._page = ((this._page + 1) % this._pages.length)
  }

  prevPage () {
    const newPage = this._page - 1
    this._page = newPage < 0 ? this._pages.length - 1 : newPage
  }

  _getChatPage (chatId) {
    let page = this._pages.find(p => p.chatId === chatId)
    if (!page) {
      page = new ChatPage(chatId, this._dc)
      this._pages.push(page)
    }
    return page
  }

  _allChats () {
    const result = []
    const list = this._dc.getChatList(0, '', 0)
    const count = list.getCount()
    for (let i = 0; i < count; i++) {
      result.push(list.getChatId(i))
    }
    return result
  }
}

module.exports = State
