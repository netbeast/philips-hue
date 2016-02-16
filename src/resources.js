var request = require('request')
var fs = require('fs-extra')

var loadBridge = require('./lights')

const ERR_UNAUTHORIZED_USER = 1

module.exports = function (callback) {
  loadBridge(function didLoadBridge (err, api) {
    if (err) return callback(err, null)

    var objects = []
    request.get('http://' + process.env.NETBEAST + '/api/resources?app=philips-hue',
    function (err, resp, body) {
      if (err) return callback(err, null)
      if (!body || body === '[]') return callback()

      body = JSON.parse(body)

      if (body.length > 0) {
        body.forEach(function (device) {
          if (objects.indexOf(device.hook) < 0) objects.push(device.hook)
        })
      }
    })

    api.lights(function (err, lights) {
      if (err) {
        if (err.type === ERR_UNAUTHORIZED_USER) {
          fs.removeSync('username.txt')
          return loadBridge(didLoadBridge)
        }
        return callback(err, null)
      }

      lights.lights.forEach(function (item) {
        var indx = objects.indexOf('/hueLights/' + item.id)
        if (indx >= 0) {
          objects.splice(indx, 1)
        } else {
          //  Registra una dos acciones (get y set) por cada bombilla
          request.post({url: 'http://' + process.env.NETBEAST + '/api/resources',
          json: {
            app: 'philips-hue',
            location: 'none',
            topic: 'lights',
            groupname: 'none',
            hook: '/hueLights/' + item.id
          }},
          callback)
        }
      })
      if (objects.length > 0) {
        objects.forEach(function (hooks) {
          request.del('http://' + process.env.NETBEAST + '/api/resources?hook=' + hooks,
          callback)
        })
      }
    })
    callback(null, api)
  })
}
