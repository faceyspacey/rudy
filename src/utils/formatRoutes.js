// @flow
import { ADD_ROUTES, CHANGE_BASENAME, CLEAR_CACHE, CONFIRM, CALL_HISTORY } from '../types'
import type { RoutesMap, RoutesMapInput } from '../flow-types'

import {
  addRoutes,
  changeBasename,
  clearCache,
  confirm,
  callHistory
} from '../pathlessRoutes'

export default (
  input: RoutesMapInput,
  formatter: ?Function,
  isAddRoutes: boolean = false
): RoutesMap => {
  const routes = isAddRoutes ? input : {}

  if (!isAddRoutes) {
    routes.NOT_FOUND = input.NOT_FOUND || { path: '/not-found' }
    Object.assign(routes, input) // insure '/not-found' matches over '/:param?' -- yes, browsers respect order assigned for non-numeric keys

    routes[ADD_ROUTES] = input[ADD_ROUTES] || { thunk: addRoutes, dispatch: false }
    routes[CHANGE_BASENAME] = input[CHANGE_BASENAME] || { thunk: changeBasename, dispatch: false }
    routes[CLEAR_CACHE] = input[CLEAR_CACHE] || { thunk: clearCache }
    routes[CONFIRM] = input[CONFIRM] || { thunk: confirm, dispatch: false }
    routes[CALL_HISTORY] = input[CALL_HISTORY] || { thunk: callHistory, dispatch: false }
  }

  const types = Object.keys(routes)

  types.forEach(type => {
    const route = formatRoute(routes[type], type, routes, formatter, isAddRoutes)
    route.type = type
    // route._isAsync = !!route.thunk
    routes[type] = route
  })

  return routes
}

export const formatRoute = (r, type, routes, formatter, isAddRoutes) => {
  const route = typeof r === 'string' ? { path: r } : r

  if (formatter) {
    return formatter(route, type, routes, isAddRoutes)
  }

  if (typeof route === 'function') {
    return { thunk: route }
  }

  return route
}

