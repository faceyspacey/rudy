import createTest from '../../__helpers__/createTest'

import {
  transformAction,
  call,
  enter
} from '../../src/middleware'

test('nothing', () => expect(true).toEqual(true))

// createTest('ready === true when route has no thunks', {
//   SECOND: {
//     path: '/second',
//     onEnter: async (req) => {
//       expect(req.getLocation().ready).toEqual(true)
//     },
//     onComplete: async (req) => {
//       expect(req.getLocation().ready).toEqual(true)
//     }
//   }
// })

// THIS ONE WORKS WITH THE CURRENTLY COMMENTED OUT CHANGES FROM HERE:
// https://github.com/faceyspacey/rudy/commit/8a31a2a0ffb39541cdf3ec01950685dde975b3ce

// createTest('ready === true when route thunk response is cached', {
//   SECOND: {
//     path: '/second',
//     beforeEnter: async (req) => {
//       req.cache.cacheAction('thunk', req.action)
//     },
//     onEnter: async (req) => {
//       expect(req.getLocation().ready).toEqual(true)
//     },
//     thunk: () => {
//       return { foo: 'SUCCESS' }
//     },
//     onComplete: async (req) => {
//       expect(req.getLocation().ready).toEqual(true)
//     }
//   }
// })

// createTest('ready === false when route has non-cached thunk', {
//   SECOND: {
//     path: '/second',
//     beforeEnter: async (req) => {
//       console.log(req.getLocation().ready, req.route._isAsync)
//       // expect(req.getLocation().ready).toEqual(false)
//     },
//     thunk: async (req) => {
//       console.log(req.getLocation().ready)
//       expect(req.getLocation().ready).toEqual(false)
//       return { foo: 'SUCCESS' }
//     },
//     onComplete: async (req) => {
//       expect(req.getLocation().ready).toEqual(true)
//     }
//   }
// })
