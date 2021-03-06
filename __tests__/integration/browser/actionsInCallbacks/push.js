import createTest, { resetBrowser } from '../../../../__helpers__/createTest'
import { push } from '../../../../src/actions'

beforeEach(resetBrowser)

createTest('push before enter', {
  FIRST: '/',
  SECOND: {
    path: '/second',
    beforeEnter: () => push('/redirected'),
    thunk: function() {}
  }
}, { testBrowser: true })

createTest('push after enter', {
  FIRST: '/',
  SECOND: {
    path: '/second',
    thunk: () => push('/redirected'),
    onComplete: function() {}
  }
}, { testBrowser: true })

createTest('push before enter on load', {
  FIRST: {
    path: '/',
    beforeEnter: () => push('/redirected'),
    thunk: function() {}
  }
}, { testBrowser: true })

createTest('push after enter on load', {
  FIRST: {
    path: '/',
    thunk: () => push('/redirected'),
    onComplete: function() {}
  }
}, { testBrowser: true })

createTest('push in pathlessRoute', {
  FIRST: '/',
  PATHLESS: {
    thunk: () => push('/redirected')
  }
}, { testBrowser: true }, [{ type: 'PATHLESS' }])
