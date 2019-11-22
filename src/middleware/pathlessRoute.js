import { call } from './index'

export default (...names) => (api) => {
  names[0] = names[0] || 'thunk'
  names[1] = names[1] || 'beforeEnter'
  names[2] = names[2] || 'onComplete'

  const callbacks = [names[1], names[0], names[2]]

  const middlewares = callbacks.map(name => {
    return call(name, { skipOpts: true })
  })

  middlewares.splice(1, 0, api => (req, next) => {
    if (req.route.dispatch !== false) {
      req.action = req.commitDispatch(req.action)
    }

    return next()
  })

  const pipeline = api.options.compose(middlewares, api)

  // Registering is currently only used when core features (like the
  // `addRoutes` action creator) depend on the middleware being available.
  // See `utils/formatRoutes.js` for how `has` is used to throw
  // errors when not available.
  api.register('pathlessRoute')

  return (req, next) => {
    const { route } = req
    const isPathless = route && !route.path

    if (isPathless && hasCallback(route, names)) {
      return pipeline(req).then(res => res || req.action)
    }

    return next()
  }
}

const hasCallback = (route, names) =>
  names.find(name => typeof route[name] === 'function')

