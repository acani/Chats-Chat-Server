var pg = require('pg'),
    webSocketServer = new (require('ws')).Server({port: (process.env.PORT || 5000)}),
    webSockets = {} // userID: webSocket

// CONNECT /:userID_sessionID
// wscat -c ws://localhost:5200/1.0123456789abcdef0123456789abcdef
webSocketServer.on('connection', function (webSocket) {
  var userID_sessionID = webSocket.upgradeReq.url.substring(1).split('.')
  var userID = userID_sessionID[0]
  sessionID = userID_sessionID[1]

  console.log()
  console.log('userID_sessionID:', userID_sessionID)
  console.log('userID:', userID)
  console.log('sessionID:', sessionID)
  console.log()

  // Validate userID & sessionID
  if (!(/^\d+$/.test(userID) && /^[0-9a-f]{32}$/.test(sessionID))) {
    webSocket.close()
    return console.error('Invalid access token.')
  }
  userID = Number(userID)
  console.log('Valid access token.')
  console.log()

  pg.connect(process.env.DATABASE_URL, function(error, client, done) {
    if (error) {
      webSocket.close()
      return console.error('pg.connect:', error)
    }

    client.query('SELECT * FROM sessions_get('+userID+')', function (error, result) {
      var row

      done() // releases client back to the pool

      if (error) {
        webSocket.close()
        return console.error('client.query:', error)
      }

      row = result.rows[0]
      if (!row) {
        webSocket.close()
        return console.error('No session ID found with user ID', userID + '.')
      }

      if (row.id != sessionID) {
        webSocket.close()
        return console.error('Incorrect session ID.\nExpected: ', row.id + '\nGot:      ', sessionID)
      }
      console.log('User', userID, 'authenticated.')

      webSocket.on('close', function () {
        delete webSockets[userID]
        console.log('User', userID, 'disconnected.')
      })

      webSockets[userID] = webSocket
      console.log('Connected user IDs:', Object.getOwnPropertyNames(webSockets))

      // Forward Message
      //
      // Receive               Example
      // [toUserID, text]      [2, "Hello, World!"]
      //
      // Send                  Example
      // [fromUserID, text]    [1, "Hello, World!"]
      webSocket.on('message', function (message) {
        console.log()
        console.log('Message from', userID + ':', message)

        var messageArray
        try {
          messageArray = JSON.parse(message)
        } catch (e) {
          return console.error(e)
        }

        var toUserID = messageArray[0]
        var toUserWebSocket = webSockets[toUserID]
        if (toUserWebSocket) {
          messageArray[0] = userID
          toUserWebSocket.send(JSON.stringify(messageArray))
          console.log('Message to', toUserID + ':', JSON.stringify(messageArray))
        }
      })
    })
  })
})
