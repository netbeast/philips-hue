var loadResources = require('./resources')
var converter = require('../util/color-converter')

var	express = require('express')
var router = express.Router()
var mqtt = require('mqtt')

var bulbvalues = {power: 'on', brightness: 'bri', saturation: 'sat', hue: 'hue'}

loadResources(function (err, api) {
  if (err) return console.log(err)

  router.get('/hueLights/:id', function (req, res, next) {
    api.lightStatus(req.params.id, function (err, data) {
      if (err) return res.status(404).send('Device not found')

      if (!Object.keys(req.query).length) return res.json(_parsePhilips(data.state))
      var response = {}
      Object.keys(req.query).forEach(function (key) {
        if (key === 'color') {
          response['color'] = { hex: converter.hsl2Hex(data.state.hue, data.state.sat, data.state.bri),
                             rgb: converter.hsl2Rgb(data.state.hue, data.state.sat, data.state.bri) }
        }
        if (bulbvalues[key]) response[key] = _parseKeyGet(key, data.state[bulbvalues[key]])
      })
      if (Object.keys(response).length) return res.json(response)
      return res.status(202).send('Values not available on this philips-hue bulb')
    })
  })

  router.get('/discover', function (req, res, next) {
    loadResources(function (err, api) {
      if (err) return res.status(500).send(err)
      api.lights(function (err, lights) {
        if (err) return res.status(500).send(err)
        return res.json(lights.lights)
      })
    })
  })

  router.post('/hueLights/:id', function (req, res, next) {
    api.lightStatus(req.params.id, function (err, data) {
      if (err) return res.status(404).send('Device not found')
      if (!Object.keys(req.body).length) return res.status(400).send('Incorrect set format')

      var response = {}
      Object.keys(req.body).forEach(function (key) {
        if (!bulbvalues[key] && key !== 'color') {
          delete req.body[key]
        } else if (key !== 'color') {
          req.body[bulbvalues[key]] = _parseKeyPost(key, req.body[key])
          response[key] = req.body[key]
          delete req.body[key]
        } else {
          if (req.body.hue) delete req.body.hue
          if (req.body.sat) delete req.body.sat
          if (req.body.bri) delete req.body.bri
          if (req.body.saturation) delete req.body.saturation
          if (req.body.brightness) delete req.body.brightness
          if (typeof (req.body.color) === 'string') {
            var hsl = converter.hex2Hsl(req.body.color)
            req.body['hue'] = response.hue = hsl[0].hue
            req.body['sat'] = response.saturation = hsl[0].saturation
            req.body['bri'] = response.brightness = hsl[0].brightness
            delete req.body.color
          } else if (typeof (req.body.color) === 'object') {
            if (req.body.color.r || req.body.color.g || req.body.color.b) {
              var hsl = converter.rgb2Hsl(req.body.color.r, req.body.color.g, req.body.color.b)
              req.body['hue'] = response.hue = hsl[0].hue
              req.body['sat'] = response.saturation = hsl[0].saturation
              req.body['bri'] = response.brightness = hsl[0].brightness
              delete req.body.color
            } else {
              return res.status(400).send('Incorrect color format')
            }
          } else return res.status(400).send('Incorrect color format')
        }
      })
      api.setLightState(req.params.id, req.body)
      .then(function (result) {
        var client = mqtt.connect()
        client.publish('lights', JSON.stringify(response))
        res.send(response)
      })
      .fail(function (err) {
        if (err) res.status(400).send('A problem setting one value occurred')
      })
    })
  })
})

function _parseKeyGet (key, value) {
  switch (key) {
    case 'hue':
      value = Math.round(value / 65535 * 360)
      if (value > 360) value = 360
      break
    case 'saturation':
    case 'brightness':
      value = Math.round(value / 255 * 100)
      if (value > 100) value = 100
      break
  }
  if (value < 0) value = 0
  return value
}

function _parseKeyPost (key, value) {
  switch (key) {
    case 'hue':
      value = Math.round(value * 65535 / 360)
      if (value > 65535) value = 65535
      break
    case 'saturation':
    case 'brightness':
      value = Math.round(value * 255 / 100)
      if (value > 255) value = 255
      break
  }
  if (value < 0) value = 0
  return value
}

function _parsePhilips (data) {
  return {
    power: data.on,
    hue: Math.round(data.hue / 65535 * 360),
    saturation: Math.round(data.sat / 255 * 100),
    brightness: Math.round(data.bri / 255 * 100)
  }
}

module.exports = router
