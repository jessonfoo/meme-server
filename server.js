const cluster = require('cluster')
const express = require('express')
const app = express()
const hb = require('handlebars')
const fs = require('fs')

const cpusLength = require('os').cpus().length

const source = hb.compile(fs.readFileSync('./index.html').toString())
const port = 80
const endpoints = {}
const stats = {
  requests: 0,
  cmds: {}
}

fs.readdir(`${__dirname}/assets/`, async (err, files) => {
  files.forEach(file => {
    file = file.replace('.js', '')
    try {
      endpoints[file] = require(`./assets/${file}`).run
      stats.cmds[file] = 0
    } catch (err) {
      console.warn(`There was an error with '${file}': ${err.message} | ${err.stack}`)
    }
  })
})

app.get('/api/*', async (req, res) => {
  process.send('request')

  let keys = require('./keys.json')
  delete require.cache[require.resolve('./keys.json')]

  if (!req.headers['api-key'] || !keys.includes(req.headers['api-key'])) { return res.status(401).send('<h1>401 - Unauthorized</h1><br>You are not authorized to access this endpoint, dummy.') }

  const endpoint = req.originalUrl.slice(req.originalUrl.lastIndexOf('/') + 1)
  if (!endpoints[endpoint]) { return res.status(404).send('<h1>404 - Not Found</h1><br>Endpoint not found.') }

  process.send({endpoint: endpoint});
  try {
    const data = await endpoints[endpoint](req.headers['data-src'])
    res.status(200).send(data)
  } catch (err) {
    console.warn(`There was an error: ${err.message} | ${err.stack}`)
    return res.status(400).send(`${err.message} | ${err.stack}`)
  }
})

app.get('/', (req, res) => {
  process.send({dataRequest: cluster.worker.id});
  process.once('message', (message) => {
    if(message.data) {
      res.status(200).send(source(message.data))
    }
  })
})

function launchServer () {
  app.listen(port)
  console.log(`Server started on port: ${port} pid: ${process.pid}`)
}

if (cluster.isMaster) {
  const workerNumber = cpusLength - 1
  let memoryUsageCounter = 0
  console.log(`Starting ${workerNumber} workers`)
  for (let i = 0; i < workerNumber; i++) {
    cluster.fork()
  }
 async function masterHandleMessage(message) {
  if(message === 'request')
  {
    stats.requests++
  }
  else if(message.endpoint) {
    stats.cmds[message.endpoint]++
  }
  else if(message.dataRequest)
  {
    let data = {
      'uptime': formatTime(process.uptime()),
      'ram': (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
      'requests': stats.requests,
      'usage': Object.keys(stats.cmds).sort((a, b) => stats.cmds[b] - stats.cmds[a]).map(c => `${c} - ${stats.cmds[c]} hits`).join('<br>')
    }
    cluster.workers[message.dataRequest].send({data: data})
  }
 }
 for(const id in cluster.workers) {
   cluster.workers[id].on('message', masterHandleMessage)
 }

} else {
  //worker
  launchServer()
}

cluster.on('online', (worker) => {
  console.log(`Worker ${worker.id} started`)
});

function formatTime (time) {
  let days = Math.floor(time % 31536000 / 86400)
  let hours = Math.floor(time % 31536000 % 86400 / 3600)
  let minutes = Math.floor(time % 31536000 % 86400 % 3600 / 60)
  let seconds = Math.round(time % 31536000 % 86400 % 3600 % 60)
  days = days > 9 ? days : '0' + days
  hours = hours > 9 ? hours : '0' + hours
  minutes = minutes > 9 ? minutes : '0' + minutes
  seconds = seconds > 9 ? seconds : '0' + seconds
  return `${days > 0 ? `${days}:` : ``}${(hours || days) > 0 ? `${hours}:` : ``}${minutes}:${seconds}`
}
