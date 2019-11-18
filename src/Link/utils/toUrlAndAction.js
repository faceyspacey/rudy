// @flow
import resolvePathname from 'resolve-pathname'
import { actionToUrl, toAction } from '../../utils'
import type { RoutesMap, Options } from '../../flow-types'

export type To = string | Array<string> | Object

export default (
  to?: ?To,
  routes: RoutesMap,
  basename: ?string = '',
  currentPathname: string,
  options: Options
): string => {
  const { basenames } = options
  let url = ''
  let action

  if (!to) {
    url = '#'
  }
  if (to && typeof to === 'string') {
    url = to
  }
  else if (Array.isArray(to)) {
    if (to[0].charAt(0) === '/') {
      basename = to.shift()
    }

    url = `/${to.join('/')}`
  }
  else if (typeof to === 'object') {
    action = to

    try {
      url = actionToUrl(action, { routes, options }).url
      basename = typeof action.basename !== 'undefined'
        ? action.basename
        : basename || ''
    }
    catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[rudy/Link] could not create path from action:', action)
      }

      url = '#'
    }
  }

  const bn = basenames && findBasename(url, basenames)

  if (bn) {
    basename = bn
    url = stripBasename(url, bn)
  }

  if (url.charAt(0) === '#') {
    url = `${currentPathname}${url}`
  }
  else if (url.charAt(0) !== '/') {
    url = resolvePathname(url, currentPathname)
  }

  const isExternal = url.indexOf('http') === 0

  if (!action && !isExternal) {
    const api = { routes, options }
    action = toAction(api, url)
  }

  if (basename) {
    action = { ...action, basename }
  }

  const fullUrl = isExternal ? url : basename + url
  return { fullUrl, action }
}

// TO DO put in utils folder and re-use across project
const findBasename = (path, bns = []) =>
  bns.find(bn => path.indexOf(bn) === 0)

const stripBasename = (path, bn) =>
  path.indexOf(bn) === 0 ? path.substr(bn.length) : path
