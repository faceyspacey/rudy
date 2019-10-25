// @flow
import { redirect } from '../../actions'
import type { RoutesMap, ReceivedAction } from '../../index'
import type { To } from './toUrlAndAction'

export type OnClick = false | ((SyntheticEvent) => ?boolean)
export default (
  action: ?ReceivedAction,
  routes: RoutesMap,
  shouldDispatch: boolean,
  dispatch: Function,
  onClick?: ?OnClick,
  target: ?string,
  isRedirect?: boolean,
  fullUrl: string,
  history: Object,
  e: SyntheticEvent
) => {
  const prevented = e.defaultPrevented
  const notModified = !isModified(e)
  let shouldGo = true

  if (onClick) {
    shouldGo = onClick(e) !== false // onClick can return false to prevent dispatch
  }

  if (!target && e && e.preventDefault && notModified) {
    e.preventDefault()
  }

  if (
    action &&
    shouldGo &&
    shouldDispatch &&
    !target &&
    !prevented &&
    notModified &&
    e.button === 0
  ) {
    action = isRedirect ? redirect(action) : action
    return dispatch(action)
  }

  if (!action && !target && fullUrl.indexOf('http') === 0) {
    if (history.index === 0) {
      history.saveHistory(history.location, true) // used to patch an edge case, see `history/utils/sessionStorage.js.getIndexAndEntries`
    }

    window.location.href = fullUrl
  }
}


const isModified = (e: Object) =>
  !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
