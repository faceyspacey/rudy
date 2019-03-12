import createTest from '../../../__helpers__/createTest'
import { notFound, push } from '../../../src/actions'
import createScene from '../../../src/createScene'

createTest('dispatch(notFound())', {}, [
  notFound()
])

createTest('notFound on first load', {}, [
  '/non-existent'
])

createTest('dispatch(notFound(state))', {}, [
  notFound({ foo: 'bar' })
])


const { actions, routes } = createScene({
  FIRST: '/first',
  NOT_FOUND: {
    path: '/scene-level-not-found'
  },
  SECOND: {
    path: '/second/:param'
  }
}, { scene: 'scene', basename: '/base' })


createTest('dispatch(notFound(state, forcedType))', routes, [
  notFound({ foo: 'bar' }, 'scene/NOT_FOUND') // createScene passes an alternate NOT_FOUND type
])

createTest('dispatch(push("/non-existent")) keeps current scene', routes, [
  push('/non-existent')
])

createTest('actionToUrl(improperlyFormattedAction)', routes, { basenames: ['/base'] }, [
  actions.second({ params: { miss: 'bla' } })
])

createTest('actionToUrl(wrongBaseName)', routes, { basenames: ['/wrong-base'] }, [
  actions.second({ params: { param: 'bla' } })
])
