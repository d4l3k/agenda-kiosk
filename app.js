const numDays = 5

Array.prototype.unique =
    function () {
      return this.filter(function (value, index, self) {
        return self.indexOf(value) === index
      })
    }

class MainApp extends Polymer.Element {
  static get is () {
    return 'main-app'
  }

  static get properties () {
    return {
      signedIn: {value: false},
      night: {computed: 'computeNight(currentTime)', reflectToAttribute: true}
    }
  }

  static get observers () {
    return ['listUpcomingEvents(signedIn, today)']
  }

  connectedCallback () {
    super.connectedCallback()

    window.app = this

    this.tick()
    setInterval(() => this.tick(), 5 * 60 * 1000)

    setInterval(() => {
      this.currentTime = moment().format('HH:mm:ss')
    }, 200)
  }

  computeNight () {
    const hour = moment().hour()
    return hour <= 5 || hour >= 18
  }

  completed (task) {
    return task.status === 'completed'
  }

  tick () {
    this.today = moment().startOf('day')
  }

  time (time) {
    if (!time) {
      return
    }

    return moment(time).format('HH:mm')
  }

  tod (date) {
    const time = moment(date)
    const start = time.clone().startOf('day')
    return time.unix() - start.unix()
  }

  nowStyle () {
    const start = this.start()
    const end = this.end()
    const top = (this.tod() - start) / (end - start) * 100
    return `top: ${top}%`
  }

  start () {
    if (!this.events) {
      return 1
    }
    const start = this.events.map(a => this.tod(a.start.dateTime)).reduce((a, b) => {
      return a < b && a ? a : b
    })

    return Math.min(this.tod(), start)
  }

  end () {
    if (!this.events) {
      return 1
    }
    const end = this.events.map(a => this.tod(a.end.dateTime))
        .reduce((a, b) => { return a > b && a ? a : b })
    return Math.max(this.tod(), end)
  }

  eventStyle (event) {
    const start = this.start()
    const end = this.end()
    const time = this.tod(event.start.dateTime)
    const timeEnd = this.tod(event.end.dateTime)
    const pos = (timeEnd - time) / (end - start) * 100
    return 'flex-basis: ' + pos.toFixed(2) + '%'
  }

  endSpacerStyle (day, events) {
    if (!events) {
      return
    }

    let eventBefore
    events.forEach((event) => {
      if (moment(event.end.dateTime).startOf('day').isSame(day)) {
        eventBefore = event
      }
    })

    const start = this.start()
    const end = this.end()
    const before = eventBefore ? this.tod(eventBefore.end.dateTime) : end
    const basis = (end - before) / (end - start) * 100
    return 'flex-basis: ' + basis.toFixed(1) + '%'
  }

  isToday (day) {
    return this.days && this.days[0] === day
  }

  eventBefore (event) {
    const index = this.events.indexOf(event)
    if (index > 0) {
      const nevent = this.events[index - 1]
      const estart = moment(event.start.dateTime).startOf('day')
      const nestart = moment(nevent.start.dateTime).startOf('day')
      if (estart.isSame(nestart)) {
        return nevent
      }
    }
  }

  spacerStyle (event, events) {
    if (!events) {
      return
    }

    const start = this.start()
    const end = this.end()
    const time = this.tod(event.start.dateTime)
    const eventBefore = this.eventBefore(event)
    const before = eventBefore ? this.tod(eventBefore.end.dateTime) : start
    const basis = (time - before) / (end - start) * 100
    return 'flex-basis: ' + basis.toFixed(1) + '%'
  }

  initClient () {
    gapi.client
        .init({
          apiKey: API_KEY,
          clientId: CLIENT_ID,
          discoveryDocs: DISCOVERY_DOCS,
          scope: SCOPES
        })
        .then(() => {
          // Listen for sign-in state changes.
          gapi.auth2.getAuthInstance().isSignedIn.listen(
              this.updateSigninStatus.bind(this))

          // Handle the initial sign-in state.
          this.updateSigninStatus(
              gapi.auth2.getAuthInstance().isSignedIn.get())
        })
  }

  updateSigninStatus (signedIn) {
    this.signedIn = signedIn
  }

  handleAuthClick (event) {
    gapi.auth2.getAuthInstance().signIn()
  }

  handleSignoutClick (event) {
    gapi.auth2.getAuthInstance().signOut()
  }

  getWeather (date, weather) {
    if (!weather || !weather.list) {
      return
    }

    const target = moment(date).unix()

    let closest
    weather.list.forEach(point => {
      const pointStart = point.dt
      const pointEnd = moment.unix(point.dt).add(3, 'hour').unix()
      if (point.dt <= target && target <= pointEnd) {
        closest = point
      }
    })

    if (!closest) {
      return
    }

    return closest.main.temp.toFixed(1) + '°C - ' +
        closest.weather.map(a => a.description).join('')
  }

  getWeatherDay (date, weather, oneLine) {
    if (!weather || !weather.list) {
      return
    }

    let max = -100
    let min = 100
    let found = false
    let descriptions = []

    weather.list.forEach(point => {
      if (moment.unix(point.dt).startOf('day').isSame(date)) {
        found = true
        if (point.main.temp_max > max) {
          max = point.main.temp_max
        }
        if (point.main.temp_min < min) {
          min = point.main.temp_min
        }
        descriptions =
            descriptions.concat(point.weather.map(a => a.description))
      }
    })

    if (!found) {
      return
    }

    const delim = oneLine ? ', ' : '\n'

    return min.toFixed(1) + '°C - ' + max.toFixed(1) + '°C' + delim +
        descriptions.unique().join(delim)
  }

  dayEvents (date, events) {
    if (!events) {
      return
    }

    return events.filter((event) => {
      return moment(event.start.dateTime).startOf('day').isSame(date)
    })
  }

  updateWeather () {
    const url =
        'https://api.openweathermap.org/data/2.5/forecast?q=Vancouver,ca&appid=31646850814d65066e507a61f50c92c6&units=metric'
    fetch(url)
        .then(a => { return a.json() })
        .then(weather => { this.weather = weather })
  }

  dayTasks (date, tasks) {
    if (!tasks) {
      return
    }

    const utcDay = date.clone().utc().startOf('day')

    return tasks.filter((task) => {
      const taskDue = moment(task.due).utc().startOf('day')
      return taskDue.isSame(utcDay)
    })
  }

  listTasks () {
    const start = moment().startOf('day').add(-1, 'days')
    const end = start.clone().add(numDays+1, 'days')

    gapi.client.tasks.tasklists.list().then(resp => {
      console.log(resp)
      const lists = resp.result.items.map(list => {
        return gapi.client.tasks.tasks.list({
          tasklist: list.id,
          dueMin: start.toISOString(),
          dueMax: end.toISOString()
        }).then(a => {
          return a.result.items || []
        })
      })

      return Promise.all(lists)
    }).then((lists) => {
      const tasks = []
      console.log(lists)
      lists.forEach(list => {
        list.forEach(task => {
          tasks.push(task)
        })
      })
      console.log(tasks)
      this.tasks = tasks
    })
  }

  dayPackages (date, packages) {
    if (!packages) {
      return
    }

    return packages.filter((a) => {
      return moment(a.date).startOf('day').isSame(date)
    })
  }

  loadAmazonTracking (date, url) {
    return fetch('https://cors-anywhere.herokuapp.com/' + url)
        .then(a => a.text())
        .then(body => {
          const matches = body.match(/(Arriving|Delivered) ([a-z A-Z0-9]*)/)
          if (!matches) {
            return
          }
          const human = matches[0]
          const past = human.includes('Delivered')
          const time = matches[2].replace(/by/g, 'at')
          return {
            date: date.get(time, {past}).raw, human
          }
        })
  }

  getPart (payload) {
    if (payload.mimeType === 'text/plain') {
      return payload
    }
    for (const p of payload.parts) {
      const ret = this.getPart(p)
      if (ret) {
        return ret
      }
    }
  }

  listPackages () {
    const seenURLs = {}

    gapi.client.gmail.users.messages
        .list({maxResults: 10, userId: 'me', q: 'track package shipped'})
        .then(resp => {
          const messages = resp.result.messages
          const packages = messages.map(message => {
            return gapi.client.gmail.users.messages
                .get({
                  userId: 'me',
                  id: message.id
                })
                .then(message => {
                  const subject = message.result.payload.headers
                                      .filter(a => a.name === 'Subject')[0]
                                      .value
                  let part = this.getPart(message.result.payload)
                  if (!part) {
                    console.log('missing part', message)
                    return
                  }
                  const body =
                      atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
                  const matches =
                      body.match(/Track your package at (https:\S*)/)
                  if (!matches) {
                    console.log('failed to find match in', subject)
                    return
                  }
                  const url = matches[1]
                  if (seenURLs[url]) {
                    return
                  }
                  seenURLs[url] = true

                  const date = new Sugar.Date(message.headers.date)
                  return this.loadAmazonTracking(date, url).then(a => {
                    if (!a) {
                      return
                    }
                    const itemMatch = subject.match(/"(.*)"/) ||
                        subject.match(/order of (.*) has shipped/)
                    return {
                      ...a, subject, item: itemMatch && itemMatch[1]
                    }
                  })
                })
          })
          Promise.all(packages).then(packages => {
            packages = packages.filter(a => a)
            console.log('packages', packages)
            this.packages = packages
          })
        })
  }

  listUpcomingEvents (signedIn) {
    if (!signedIn) {
      return
    }

    this.updateWeather()
    this.listTasks()
    this.listPackages()

    const start = moment().startOf('day')
    const end = start.clone().add(numDays, 'days')
    const days = []
    this.month = start.format('MMMM Y')
    for (let i = 0; i < numDays; i++) {
      const now = start.clone().add(i, 'days')
      days.push({
        dayOfWeek: now.format('ddd'),
        day: now.format('D'),
        date: now
      })
    }
    this.days = days
    gapi.client.calendar.calendarList.list().then(calendars => {
      const promises = calendars.result.items.filter(a => a.selected).map(calendar => {
        return gapi.client.calendar.events
          .list({
            'calendarId': calendar.id,
            'timeMin': start.toISOString(),
            'timeMax': end.toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 100,
            'orderBy': 'startTime'
          })
          .then((response) => response.result.items)
      })
      return Promise.all(promises)
    }).then(calendars => {
      const events = []
      calendars.forEach(calendar => {
        calendar.forEach(event => {
          events.push(event)
        })
      })
      this.events = events
    })
  }
}
customElements.define(MainApp.is, MainApp)
