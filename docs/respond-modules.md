# Respond Framework -- Why You Want It + How It Works

The following is an explanation of the *big picture* problems solved by **Respond Framework** plus a description of key parts of our *implementation*.

![Respond Framework Homepage](https://raw.githubusercontent.com/faceyspacey/rudy/master/docs/respondhomepage.png)


## Big Picture (MODULARITY + LINEAR SIDE-EFFECTS MANAGEMENT)


### Modularity

The big picture is this: **names conflict in software.** As seemingly small as that sounds, it prevents the most important super power of well designed software: ***MODULARITY***. 

*Modularity* is what allows independent developer teams to go off and privately build part of a larger application with confidence that what they build will plug in nicely to the greater whole, free of conflicts.

*Modularity* is so important that the entire design of React, and all the painstaking work the React team has done on Hooks/Suspense/Etc has been towards this goal. More specifically, their work has been towards preserving the initial modularity their chosen primitive, *components*, brought to the table, while better tackling a larger set of capabilites. 

Not to different from us, those **capabilities** are:

- M: **accessible state stores** (i.e. `context` which circumvents prop drilling)
- V: an even more **"functional"** rendering system
- C: **async data fetching + side effects**

> In other words, the modern **MVC** of application development

**Redux lacks this modularity however. It's a major thorn in the side of large developer teams that want to move fast and achieve their greatest potential.** *When was the last time you saw a React component bound to a Redux store on NPM??? Never.*


### Linear Side-Effects Is Best

The flip side is that even though plain React is modular, its approach lacks linear side-effects management. *Why is this a major problem?*

**The achilles heel of the component-obsessed approach (yes, with Hooks/Suspense too) is that side-effects are better known prior to rendering, rather than randomly discovered during component tree traversal.** The resulting order can be random and impossible to coordinate predictably. You often are wondering/debugging "where is xyz happening?" SSR + code splitting becomes incredibly difficult. Worse, these are **surprises**. 

> ["No surprises == better sleep"](https://twitter.com/faceyspacey/status/1107057805507227649) -Anton Korzunov (maintainer of React-Hot-Loader, react-imported-component)


This has been the **guiding light** for *Redux-First-Router* and even more so for *Respond Framework*. 

What this looks like in *Respond Framework* is a pipeline of **customizeable consecutive + asynchronous middleware** that operate on a potentially nested map of routes. Here's a sample: 

```js
import { createApp } from 'respond-framework'

const routes = {
  HOME: {
    path: '/',
    beforeEnter: () => ...,
    thunk: ({ api }) => {
      return api.fetch('items') // automatically dispatches: { type: 'HOME_COMPLETE', payload: items }
    }
  },
  LOGIN: '/login',
  DASHBOARD: {
    path: '/dashboard/:userId',
    saga: function* () {}, // a saga middleware can also easily be added
    onEnter: () => ...,
    routes: { // nested routes now supported
      SETTINGS: {
        path: '/settings',
        load: load: () => import('modules/settings') // modules are automatically code-split
      }
    }
  }
}

const options = {
  reducer: reduxReducer,
  enhancer: reduxEnhancer, // standard syncronous Redux middleware API is in here
  beforeEnter: ({ getState, params, query, hash, basename, muchMore }) => { // better URL transformation
    if (params.userId && !getState().user) {
      return { type: 'LOGIN' } // redirects automatically applied
    }
  }
}

// default middleware (i.e. you can optionally provide a customized array)
const middlewares = [ // these async middlewares are guaranteed to each run sequentially
  codeSplit('load'),
  transformAction,    
  call('beforeLeave', { prev: true }),
  call('beforeEnter'), // any route with a function named by this key will be called
  enter,
  saga(), // saga middleware (note: we still need to make this, but it's not too hard)
  changePageTitle,
  call('onLeave', { prev: true }),
  call('onEnter'),
  call('thunk', { cache: true }),
  call('onComplete')
]

const { firstRoute, store } = createApp(routes, options, middlewares)

(async function() {
  await store.dispatch(firstRoute())

  ReactDOM.hydrate(
    <Provider store={store}>
      <App />
    </Provider>,
    document.getElementById('root')
  )
})()
```

> Respond Framework has a 2nd middleware API on top of the synchronous Redux middleware/enhancer API. Our API is asynchronous and operates similarly to [koa-compose](https://github.com/koajs/compose). What this means is that each middleware will pause execution of the route change and asyncronously complete before passing the request to the next middleware in the chain. Each middleware also has a 2nd chance to peform work as the chain "rewinds." This gives us great control over route transitions. For example, we can bail out at any time (before or after the `enter` event/middleware); we have even figured out how to do this based on history events that result in redirects from the browser back/next buttons.

In summary, side-effects are far more predictable grouped together as part of a sequential design. 

Our community has achieved great [success](https://twitter.com/jon_raRaRa/status/1108008311323021312) via this simple, boring, predictable and old fashioned paradigm. This is similar to the controllers you are very familiar with from Rails. In fact, from a marketing standpoint, *Respond Framework* will be positioning itself as the ***"Rails of React."***

**However, as described above, our achilles heal has been that Redux isn't modular.** ***UNTIL NOW!***

**Enter the best of both worlds...**



## Redux Built-in to React

Before we examine how we solved the problem of *"Redux Modules"*, we must become familiar with how Redux is now built-in to React. Let's check out *Respond's* slightly modified component API:

```js
const RespondComponent = (props, state, actions) => state.open && <Menu toggle={actions.toggle} /> 
```

> Yes, Respond components receive 3 args, you never need to bind `dispatch` or `mapStateToProps`, + perf is excellent

Of course you can still create components the old way, but any time you want access to the state or actions, you know they're right there as additional arguments. In other words, our new component API is an optional *extension* of current component functions and makes no breaking changes. It's implemented via a simple babel plugin that only operates on component functions that utilize a 2nd argument.

In addition, actions are automatially bound to `dispatch` already.

### What about `mapStateToProps`? 

We are using proxies to detect actual usage, and only re-rendering if the state that is used changes! **Yes, the next evolution of Redux.** That means no more `mapStateToProps` and far simpler `selectors`. 

We have been collaborating for a long time with the following developers through their respective repos to make it happen:

- https://github.com/theKashey/proxyequal
- https://github.com/dai-shi/react-hooks-easy-redux

A lot of work has been put into matching the original *react-redux* benchmarks, in collaboration with the lead maintainer of Redux itself: 

- https://github.com/dai-shi/react-hooks-easy-redux/issues/1

In essence, we have done our homework to make Respond Framework not just a beautiful straightforward *Railsesque* API, but also performant!


## "Redux Modules" (AKA *Redux Component Modules*)


Without further ado, here's what our modules look like:

```js
import { createModule } from 'respond-framework'

export default createModule({
  components: {
    RespondComponent: (props, state, actions) => {
      // using proxies, state.visible is namespaced to state.moduleName.visible under the hood
      return state.visible && <Dashboard close={actions.settings} />
    },
  },
  reducers: {
    visible: (state, actions, types) => {
      switch(action.type) {
        case types.DASHBOARD: // types injected via DI
          return true
        case types.SETTINGS:
          return false
        default:
          return state
      }
    },
    items: (state, actions, types) => {
      // TEAM REMITANO, notice our actions used by multiple reducers (aka less actions + "fat reducers")
      return types.DASHBOARD ? [] : state 
    },
  }, 
  selectors: { openItems },   // will address later
  routes: {
    DASHBOARD: {
      path: '/dash',
      saga: ...,
      load: () => import('modules/dashboard') // a nested module
    },
    SETTINGS: {
      path: '/settings',
    }
  }
})
```
> Yes, similar to what was passed to `createApp`. In fact, `createApp` is a specialized module. All is *Respond Modules!*


*elsewhere:*
```js
// component dynamically loaded (aka code split) and injected via DI
const { RespondComponent } = state.location.components.moduleName
<Route path='/dashboard' component={RespondComponent} fallback={Spinner} />

// we will describe how "moduleName" is assigned below (hint: think ES6 modules + aliasing by parent)
<button onClick={actions.moduleName.dashboard}>GO TO DASHBOARD</button>
```


> Code splitting never requires more work than nesting dynamic imports in your routes map

> Reducers (state), routes (actions + types) *and components* are injected via dependency injection, w/ dynamic loading happening under the hood

> It's *Respond's* job to insure dependencies (reducers, routes, and components) are where you need them

> **So all we must do is get Remitano's `routesMap` to look like this, and you get code splitting + SSR for free!**

> Plus this also makes it easy for your team to automatically follow best practices for a wide variety of tasks


## Respond Framework vs. New React vs. Traditional Redux/Sagas/etc

Much has been said comparing *Respond Framework* to the new hooks/suspense-based React system, even though Remitano has already committed to a global state store Redux-based system. The reason for this is to make your options clear, and provide the biggest picture possible.

It would be unwise for any serious 2019 application refactoring not to consider what the React team has put forth. More specifically, my intention is for the Remitano team to see how *Respond Framework* is far superior to both *New React* plus traditional Redux/Sagas-based systems, so you feel you are in the best of hands choosing this approach.

The React team has drawn some serious lines by all the work they have put into their *"component everything"* approach. Any serious React app refactoring in 2019 should take very seriously the new *status quo* approach in comparison to Redux. Essentially the React team--whose leader by the way is the creator of Redux--has made it their goal to rival Redux-based apps with React alone! They want React to be all you need.

Therefore, it's of the utmost importance that the power of the combination of modularity + async pipelines is truly grokked. It's a true game changer for an overly component-obsessed world. Welcome to the world of the new dominant primitive: **Respond Modules**.





## Some backstory on me and the creation of Respond Framework:

*Respond Framework* was 80% completed as of last spring 2018. 

> And by the way, at the time the routing aspect based on *Redux-First-Router* was called ***Rudy*** and the Redux/modules aspect called ***Remixx***. Now, it's under one roof as ***Respond Framework***.

So after spending almost a year since the launch of Redux-First-Router making *"Respond Framework,"* I made the executive decision to put all progress on hold, as the future was uncertain given all the yet-to-be-release hooks/suspense capabilities.

My reasoning in putting a pause on all this hard work is that I spent an entire year in 2014-2015 making an OOP framework on top of [Meteor](https://www.meteor.com), only for all my hardwork to go to waste once React (and to a lesser extent GraphQL/Apollo) completely changed the ecosystem, making Meteor essentially obsolete. This framework, by the way, was called [Ultimate MVC](https://github.com/ultimatejs/ultimate-mvc). 

While I grew a ton as a developer building both frameworks (and I always say: **"YOUR MOST IMPORTANT PROJECT IS YOURSELF"**), I couldn't afford a second time for all my time to amount to just personal growth as a developer. I had to be building something that had a high probability of becoming popular and becoming a major avenue to financially thrive.

**So after watching Hooks be released and much of Suspense, it's clear this competing solution doesn't solve the problems these tools solve!** Also, in that time, *Respond* contributors have solved some missing pieces (primarily the proxy-based Redux usage that doesn't require `mapStateToProps`). 

Most importantly, the refactoring/splitting/ssr needs of your system is proof tha that there is in fact a perfect place in the market for this approach/framework!




## What about Sagas, Immutable, Redux-Actions and our current Redux system?

Aside from lacking *modularity*, a secondary problem is there are so many ways to use Redux that it lacks coherent best practices. More specifically, Redux lacks an API that automatically and naturally leads you into the "pit of success" of best practices. There's endless choices:

- sagas vs observables
- redux-actions, immutable, and other decisions
- redux-first-router or React Router + React-Router-Redux etc
- every plugin like redux-persist must in the extreme be: immutable-redux-first-router-redux-persist

Endless developer time is lost plugging together *plugins of plugins of plugins*, and hoping they all play nice together.

It's been several years now of these shenanigans. Most of these tools have stabilized. It's time for a cohesive API that brings the best of all these worlds, while elimating the cruft. 

The community has essentially come to **consensus** about several of these tools (my guess is you've heard this from other thought leaders than just me):

- immutable isn't worth it, as the perf gains over native data structures is neglible, and conversions back and forth possibly undo any perf gains anyway; it's best to master + standardize usage of built-in data structures than to memorize yet another API surface
- redux-actions results in less flexible reducers; standard reducer functions let you listen to more actions more easily (aka "less actions, fat reducers" approach); the additional API surface isn't worth it
- routing coupled to your state store (rather than plugins to connect to React Router) eliminates a plethora of problems described in my initial Redux-First-Router aticles from 2 years ago
- the verdict about Sagas is that simpler thunks are all that's required 80-100% of the time, depending on your application's needs; therefore, only use Sagas when suited towards specific problems that they are a better primitive for (e.g: autocomplete, complex login flows, fast streaming information); and often Observables are in fact better primitives for these precise problems; and again many apps were using Sagas when they didn't need to

*Respond Framework* is designed so that you can use thunks, sagas, observables (and even Apollo/GraphQL) ***all together!*** You must just install the appropriate middleware. 

In other words, the weakness of *Redux-First-Router* is that the level of customization of route side effects was very minimal (pretty much limited to a thunk). Respond provides complete customizeability via its own asyncronous koa-based middleware API, which unlocks potential for route sagas, observables, graphql and more. That's not to say all these middlewares are built yet, but it's refreshingly easy to add them. 

That said, 80% to possibly 100% of Remitano's sagas are the kind of async data fetching work that better belongs in thunks (as per the above consensus/verdict).

If there's an area in your app where we truly need Sagas, I'll cook up the middleware. I'm confident there's plenty of work to do in moving sagas into route thunks. More importantly, it will greatly simplify the codebase. And if it makes sense as part of our **incremental adoption** strategy, I'll cook up the middleware *sooner*.


## "Less Actions, Fat Reducers" -- 2 actions per route transition, no more

This is akin to the mantra, "thin controllers, fat models" from the Rails MVC world. 

You will notice these reducers from above:

```js
reducers: {
  visible: (state, actions, types) => {
    switch(action.type) {
      case types.DASHBOARD:
        return true
      case types.SETTINGS:
        return false
      default:
        return state
    }
  },
  items: (state, actions, types) => {
    return types.DASHBOARD ? [] : state 
  },
}, 
```


See how 2 reducers listen to the same action type. The ideal here is that on route change, you have 2 actions:

- the route enter action, where location changes in state
- a possible follow-up action where any data is fetched and dispatched to the store in a `_COMPLETE` action

This is very much like a controller in Rails that must do all its work and render a single time when ready to send to the browser. In our case, we have 2 renderings (enter + complete). On the client this is paramount for perf (less work for React). 

> on the server, there is only one rendering (with both actions dispatched before the render); more info below...

However, in your app, a typical mistake is being made: actions are being used as setters, and a million actions are being dispatched during what is conceptually a single route change. Your devtools must be unusable (far too many actions to track). You might as well be using a mutable store instead of Redux. It's taking things back to the jQuery days, and missing great opportunities for predictability and increased perf.

Don't worry, you are not the only one. I spent 2017 as a code mentor working for many companies, and I've seen this everywhere. I've successfully taken companies out of this mess many times. 

Basically, if you aren't using Redux-First-Router (or working very hard to make React Router conform to a similar approach), you will end up here. It's hard to extend your app from this place, which is why we must go to the *root* and refactor this before you can move at the pace you dream of.




## How Could So Many Developers + Thought Leaders Get This All Wrong??

First of all, by now many have figured out similar practices. Most are busy just using them. But there's a vocal majority of people lacking in the appropriate experience.

The React/Redux community isn't too be blindly followed--because they are torn between taking Redux to its logical conclusion (which looks like the RFR approach) vs. trying to look like standard React. Teachers across the web are more concerned with teaching learners who just want to learn New React. Redux is being forgotten at an alarming pace.

If you follow mainstream approaches, you were using `componentDidMount` and `componentWillReceiveProps` to do data-fetching. And then on top of that you are dispatching multiple actions. Hooks, though simpler, is no different.

**This doesn't work for SSR because you are never sure when all the necessary actions have done their work, and you have all the data you need to render. You need to be sure you have all the data you need in as few a number of actions as possible. You need to at least be sure of the final action, after which the component tree is ready for rendering.** 

Many double render solutions were invented to combat this. So you had to either follow such a--usually convoluted--system, or you do something far simpler: follow a 1-2 dispatch approach like in RFR:

- 1) first action to trigger the route location change state
- 2) a possible second action when all the data fetching is complete

The `routesMap` makes this simple, and you can do all this based on `req.url` on the server, and then render a single time based on the state of the store. **It's the epitome of simple, logical and natural.** 


## SSR

Here's what SSR looks like:

*server/configureStore.js:*
```js
import { createApp } from 'respond-framework'
import reducer from './reducer'

export default async function configureStore(req) {
  const routes = {
    HOME: '/',
    ENTITY: { 
      path: '/entity/:slug',
      thunk: async ({ params, api }) => {
        const { slug } = params
        return await api.fetch(`/api/entity/${slug}`)
      }
    },
  }

  const options = {
    reducer,
    initialEntries: [req.url]
  }

  const { firstRoute, store } = createApp(routes, options) // default middleware used

  await store.dispatch(firstRoute())

  return store
}
```

*server/serverRender.js:*
```javascript
import ReactDOM from 'react-dom/server'
import { Provider } from 'respond-framework'
import configureStore from './configureStore'
import App from '../src/components/App'

export default async function serverRender(req, res) {
  const store = await configureStore(req)

  const appString = ReactDOM.renderToString(<Provider store={store}><App /></Provider>)
  const stateJson = JSON.stringify(store.getState())

  const scripts = store.getState().location.chunks.map(chunk => {
    return `<script src="/static/${chunk}.js" />`
  }).join(' ')

  return res.send(
    `<!doctype html>
      <html>
        <body>
          <div id="root">${appString}</div>
          <script>window.RESPOND_STATE = ${stateJson}</script>
          <script src="/static/bootstrap.js" />
          <script src="/static/vendors.js" />
          ${scripts}
        </body>
      </html>`
  )
}
```

*server/index.js:*
```js
import express from 'express'
import serverRender from './serverRender'

const app = express()
app.get('*', serverRender)
http.createServer(app).listen(3000)
```


For whatever reasons, not everyone has figured this out--there's just too much noise in the community across a million blog articles, and I've had real businesses to build. But this isn't rocket science. It just requires awareness of the following things:

- `context`
- `Provider`
- the pitfalls of globals
- `req`
- not using lifecycle methods or (hooks) for side-effects
- generally how Redux is supposed to be used
- and of the guiding light of `App = f(state)`

The problem is the majority of people publishing these articles (often just teachers) don't need SSR, and don't understand its unique problems. These articles are all by people focused on SPAs ("single page apps"). 

The sad thing is if they did understand what was required for SSR, **they would also build better more predictable (and testable) apps.**



## NEXT: Combination SSR + Splitting

The combination of SSR + Splitting presents an even greater problem. Whereas splitting in an SPA is not as challenging, once combined with SSR, you're typically in a world of hurt (especially if you aren't using a single pass global state store approach as prescribed by RFR).

In the RFR days, we still did splitting at the component level with [react-universal-component](https://github.com/faceyspacey/react-universal-component). In essence, we were split across 2 worlds (i.e. not an ideal place to be).

It's now even easier with *Respond* because we can determine all chunks/scripts to send in the initial page load directly from your `routesMap`! Before, chunks had to be flushed after component tree rendering. 

Getting components into the component tree is solved via *dependency injection*--which is just a fancy way of saying we store components in state, and display a *loading..* animation when a route path is matched, but the corresponding component doesn't exist yet in state:

```js
<Route path='/dashboard' component={moduleName.RespondComponent} /> 
```

Also note, the ideal way to use our `<Route />` component is more like this:

```js
<Route type={types.moduleName.DASHBOARD} component={moduleName.RespondComponent} /> 
```

> in other words, don't couple your app to paths you may wanna change, but rather to action types


Also, you're probably wondering where `MODULE_NAME` came from--we will be covering that below when I describe how *Respond Modules* work. Keep this in the back of your mind.

Lastly, to determine initial chunks/chunks to send from the server on initial render, they are all kept in our location reducer state at:

```js
store.getState().location.chunks
```

## My SSR/Splitting Experience

Nobody has more experience in this area than me. I wrote the book. I cracked the code. I brought combination SSR + Splitting mainstream, and did so for a Redux-centric world.

As for the React team, you can check for yourself, Dan Abramov, I quote:

> "has never talked from Node to a database and [doesn't] really know how to a write backend in it": 

https://overreacted.io/things-i-dont-know-as-of-2018/

endquote

**In other words, he's never done SSR.**


In essence, prominent thought leaders--and he's not the only one--lack experience when it comes to building full stack apps. They do great things, but their experience and focus is narrow. And based on their solutions and what they choose to focus on, they clearly aren't including these needs in what they're building. 

Here's another core React team member at Facebook who recently tweeted:

> After getting back into app dev, I feel like the React team has: **underestimated how much code in apps is related to data fetching/management, overestimated how complex data reqs for most apps are.** At least, I did! Now feeling like a read only react-fetch pkg _would_ cover 95%.

> To be clear I think that React is well on its way to great solutions for these using Suspense, etc. (Better than what you can do today in any framework, I hope.)
Just wish I had fully appreciated the problem a little sooner.

https://twitter.com/sophiebits/status/1097732632840826880


The React team doesn't know fetching in real/typical apps. They know Facebook which is far from typical and doesn't need SSR, and not to mention has hundreds of engineers able to solve the unique idiosyncracies of their app. *In other words, however they're using React likely looks way different than how the rest of us use it.*

What the React team comes up with seems to fit whatever those needs are *plus the needs of learners*. Every example they produce is simple. They have never publicly produced an example of a medium-to-large-sized app. My only conclusion can be that the React team is out of touch with the needs of small teams (1-10 developers) that are responsible for building and extending entire apps soup to nuts in a short amount of time. Aka startups like Remitano.

#opinions #faceyspacey #respond-framework #rant #2016-2019


## Back to your Redux usage

Using the *Respond* system relies first and foremost on re-imagining your sagas as a far smaller number of thunks. It relies on getting all the data you need in a single thunk attached to a route, with the result being ideally 2 actions dispatched (which as you can see, don't even require being *dispatched*, only returned). 

Designing your app this way flows downstream toward writing ***"fatter reducers"***. Essentially, your reducers must become smarter and each listen to a greater number of actions. Finally, you must remove lots of unnecessary state/reducers that are holding redundant information.

Right now an action is dispatched from the UI, which is listened to by a Saga, which then dispatches many setter actions. The initial saga often doesn't even do anything. It should at least be responsible for a route change. What really should have happened is a route change action was dispatched, and then the route's thunk dispatches all the data (and possibly other information needed) in a single follow-up dispatch.

Sagas often end up this kind of listener soup, and it's unnecessary (I call it "saga soup"). It makes apps very hard to reason about. 

Lastly, the pattern of using a global `_store` object doesn't work--because SSR requires a unique `store` instance per request. The store must be passed down **through context only** to insure this. In addition, such globals make testing a problem.

None of this is rocket science. After your developer team sees me do it for one area (HOMEPAGE + LOGIN), they will quickly grasp it.


## Near-Fully-Automatic Testing is the Holy Grail of Redux Apps


Here's how testing is supposed to look like:

```js
import { createApp } from 'respond-framework'

test('render something', async () => {
  const { firstRoute, store } = createApp(routes)

  await store.dispatch(firstRoute())
  renderAndSnapshotApp(store) // jest (or even puppeteer) snapshot tests created

  const actions = [action, action2, action3, actionEtc]

  await asyncForEach(actions, async (action) => {
    await store.dispatch(action)
    renderAndSnapshotApp(store) // jest (or even puppeteer) snapshot tests created
  })
})
```

You cannot do this with the global `_store` variable or any other global. The entire app has to be made to look like: `App = f(state)` to the outside world. 

It's *Respond Framework's* job to pair side-effects (such as data-fetching + code splitting) to the `f(state)` paradigm.

Because `await store.dispatch(action)` guarantees all work is done in this single action, `renderAndSnapshotApp` is guaranteed to have everything it needs.

> To be clear, this single dispatch may result in a 2nd "follow-up" action, i.e. a thunk, saga or observable attached to the route. It may even result in more than 2 actions, if the developer so chooses, but the important part is that **we are guaranteed to know when they all are completed.**

This is **the Respond way**. 


You can even make tests look this terse:

*__ tests __/foo.js:*

```js
import { createApp } from 'respond-framework'
import snapTests from '../__test-helpers__'
import { routes, actions } from '../__test-sequences__/foo'

describe('render something', async () => {
  await snapTests(routes, actions)
})
```


## Devtools

Because *New React* relies on essentially multiple stores spread throughout your component tree, it's not only impossible to drive a test generator as above, it's also impossible to get a birds-eye view of your app.

*Respond Modules's* secret sauce is that they use the same store, but inside a module feel like their own store. This is done by compile-time namespacing. That means you can see the state of all modules/namespaces from the standard Redux devtools! No new devtool solutions must be created (though in the future we plan to improve upon the Redux Devtools).

> FYI: the first feature we plan to add to the Redux Devtools is one that generates the above test using the current actions in the devtools! You can almost do something similar currently with its templates feature, but we plan to make it so automatic that it updates the test file in your filesystem. It's basically just a dump of the actions in the devtools, paired with a test runner like `snapTests`.



## NO ACTION CREATORS

If it's not been obvious, in *Respond* you don't create action creators. They are automatically created for you out of your routesMap!

Eg:

```js
const routes = {
  HOME: '/',
  POSTS: {
    path: '/posts',
    thunk: ({ api }) => api.fetchPosts()
  }
}
```

will result in the corresponding action creator automatically injected in to components (and already bound to `dispatch`):

```js
const RespondComponent = (props, state, actions) => <button onClick={actions.home}>HOME</button>
```

> These are some of the benefits of `dependency injection` rather than having to `import` action creators into all your files.


Then there is also: `actions.posts.complete()`and `actions.posts.error()` which are automatically generated.


When using Respond Modules, the actions appear namespaced like this: `actions.moduleName.morePossibleNesting.home()`.


## Selectors

Selectors in *Respond* are created at the time of store creation. They are also powered by advanced proxy-based usage tracking in order to perform optimized + automatic caching/memoization:

```js
createModule({
  selectors: {
    item: (state, props) => state.itemsCache[props.id]
  }
})
```

Since, they are not supplied as part of `mapStateToProps`, their usage is a bit different. Within a component, you will pass arguments to your selectors, such as a `props` arg:


```js
const RespondComponent = (props, state, actions) => state.item(props) && <Foo /> 
```

> Notice that the `state` argument is automatically passed. It's your job to pass the 2nd+ arguments


It's pretty straightforward. The cool/efficient part from a DX standpoint is that you can think of selectors similarly to reducer states--they both exist on the same object, except reducers are properties and selectors are methods. 

But yes, `mapStateToProps` is dead. In a world where memoization is automatic based on tracking object access, there is a new more natural interface: *simply calling selectors within component functions.*



## Characteristics of Respond Modules

We can take a page from the **ES6 Modules** playbook to see what characteristics we seek:


*MyComponentA.js*
```js
import { MyComponentB as Component } from './MyComponentB.js'
```


*MyComponentB.js*
```js
export const MyComponentB = (props, state, actions) => {}
```


The defining part you're looking at is `as Component`. In other words, the ability for parent modules to alias names from the child module is the crux of avoiding name collision in a module system. AKA ***namespacing***.

In *Respond*, these namespaces can only be known once all modules of the app are known. Until then (e.g. if a module is sitting on NPM), its namespace is essentially anonynmous. 

### Example:

*src/app.js:*
```js
import { createApp } from 'respond-framework'

export default createApp({
  routes: {
    MAIN_NAMESPACE_ALIAS: {
      path: '/prefix',
      load: () => import('./modules/home.js')
    }
  }
}, options, middleware)
```

*src/modules/home.js:*
```js
import { createModule } from 'respond-framework'

export default createModule({
  components: {
    Menu: (props, state, actions) => {
      const { visible } = state
      const { home, login } = actions

      return (
        <div>
          {visible && <ChildComponent go={home} redirect={login} />}
        </div>
      )
    }
  },
  reducers: {
    visible: (state = false, action, types) => {
      return action.type === types.HOME ? !state : state
    },
    user: (state = false, action, types) => {
      return action.type === types.LOGIN_COMPLETE ? true : state
    },
  },
  routes: {
    HOME: {
      path: '/home',
      thunk: ({ getState, actions }) => {
        if (!getState().user) return actions.login()
      }
    },
    LOGIN: '/login'
  }
})
```



So in this example, the **actions** under the hood are actually:

- `actions.mainNamespaceAlias.home()`
- `actions.mainNamespaceAlias.login()`
- `actions.mainNamespaceAlias.login.complete()`

The **state** is actually:

- `state.mainNamespaceAlias.visible`
- `state.mainNamespaceAlias.user`

The **types** passed to the reudcer are actually: 

- `types.MAIN_NAMESPACE_ALIAS.HOME`

And the **route callback** accesses:
- `state.mainNamespaceAlias.user`
- `actions.mainNamespaceAlias.login()`

And **paths** are optionally prefixed to:
- `/prefix/home`
- `/prefix/login`


> The take away is that the parent module determines the namespace used. 


## Route Nesting, Splitting, Callbacks in Modules

*Respond's* "modules" feature actually **collapses** several capabilities into *one* interface that looks like nested routes. Altogether, those capabilities are:

- namespacing
- code splitting
- path nesting (more on this below..)
- callback nesting (more on this below..)

So we have already described namespacing in depth. In summary, the route `type` of the parent becomes the namespace for child routes. That's the core feature of *Respond modules*. 

Next: code splitting is obvious enough: *modules occur at the boundaries where chunks are split*. In other words, code splitting + modules go hand in hand--the first step to namespacing a module is dynamically importing it with `import()`.

Path nesting + callback nesting we have not covered yet. No new APIs are necessary to know. It's just important to know the behavior of how paths and callbacks are treated when nested:

- Sometimes you may went to concatenate/append paths, other times not.
- Sometimes you may want a callback to run every time you *first* enter a group of routes, other times not.
- **When neither are put to use, you are only making use of namespacing.** 

Making these decisions is as simple as supplying key/vals for `path` or callbacks like `onEnter`.

Let's take a look:

### Stripe *Respond Module* on NPM (Example)

`$ yarn add respond-stripe-cart`

*src/app.js:*

```js
import { createApp, Route } from 'respond-framework'
import stripeModule from 'respond-stripe-cart'
import mixpanel from 'mixpanel'
import Spinner from './components/Spinner'

const { store, firstRoute } = createApp({
  reducer, // previously in Reduxlandia: createStore(reducer, initialState, enhancer)
  initialState
  enhancer,
  components: {
    App: (props, state, actions) => {
      const { ShoppingCart } = state.location.components.checkout

      return (
        <div>
          <Route path='/' component={ShoppingCart} fallback={Spinner} /> // automatically code-split

          <h3>Child slices of state are not available in the parent module:</h3>
          <span>{state.cartVisible}</span>

          <h3>But the actions are</h3>
          <button onClick={actions.checkout.openCart}>OPEN CART</button>
        </div>
      )
    }
  },
  routes: {
    HOME: {
      path: '/home'
    },
    CHECKOUT: {
      load: () => import('respond-stripe-cart'),
      onEnter: ({ location }) => mixpanel.track('cart_modal', location)
    }
  }
}, options, middlewares)
```

*respond-stripe-cart:*

```js
import { createModule } from 'respond-framework'
import ModalCart from '../widgets/ModalCart'

export default createModule({
  components: {
    ShoppingCart: (props, state, actions) => {
      const { cartVisible, cartItems } = state
      const { openCart, charge, back } = actions

      return (
        <div>
          {cartVisible &&
            <ModalCart
              open={openCart}
              close={back}
              items={cartItems}
              button={charge}
            />
          }
        </div>
      )
    }
  },
  reducers: {
    cartVisible: (state = false, action, types) => {
      return action.type === types.OPEN_CART ? !state : state
    },
    cartItems: (state = [], action, types) => {
      switch(action.type) {
        case 'OPEN_CART':
        case 'CONFIRMATION':
          return []
        case 'OPEN_CART_COMPLETE': 
          return action.payload
        default:
          return state
      }
    }
  },
  routes: {
    OPEN_CART: {
      path: '/cart',
      thunk: ({ stripe, payload }) => stripe.findCartItems(payload)
    },
    CHARGE: { // pathless route -- pathless routes are how we can use our routesMap for all actions!
      thunk: async ({ stripe, payload, actions }) => {
        const { amount } = payload
        await stripe.charge(amount)
        return actions.confirmation() // change routes (notice no dispatch necessary)
      }
    },
    CONFIRMATION: {
      path: '/thank-you',
    }
  }
})
```


Before examining the paths + callback behavior, let's examine what the final merged `routes` map looks like after dynamic imports are applied:


```js
const routes = {
  HOME: {
    path: '/home'
  },
  CHECKOUT: {
    onEnter: ({ location }) => mixpanel.track('cart_modal', location),
    routes: { 
      OPEN_CART: {
        path: '/cart',
        thunk: ({ stripe, payload }) => stripe.findCartItems(payload)
      },
      CHARGE: {
        thunk: async ({ stripe, payload, actions }) => {
          const { amount } = payload
          await stripe.charge(amount)
          return actions.confirmation()
        }
      },
      CONFIRMATION: {
        path: '/thank-you',
      }
    }
  }
}
```

The part relevant to paths and callbacks is:

```js
CHECKOUT: {
  load: () => import('respond-stripe-cart'),
  onEnter: ({ location }) => mixpanel.track('cart', location)
}
```

As we can see there is an `onEnter` callback for the entire group of nested routes (aka module). On enter of this module essentially, `onEnter` will be called. If you go from `/cart` to `/thank-you` however it won't be called again. If for some reason you landed directaly on `/thank-you`, it would be called. In this scenario, this is essentially a hook to customize the behavior of a black-boxed 3rd party module.

As for paths, the idea is that we are opting to have the paths `/cart` and `/thank-you` directly used in our app instead of, for example, `/checkout/cart` and `/checkout/thank-you` respectively.

To dispatch to the cart from the parent module, you would do `actions.checkout.openCart()`; and to access state from the parent module, you would access `state.checkout.cartVisible`.

In conclusion, we forwent the path prefixing capability of the module, but utilized namespacing + the behavior of multi-tiered callbacks.

**Additionally**, our module's components are automatically code split via our `<Route />` component:

```js
const { ShoppingCart } = state.location.components.checkout
<Route path='/' component={ShoppingCart} fallback={Spinner} />
```

This will show a spinner until `ShoppingCart` appears in our `location` reducer state:

```js
state.location.components = {
  checkout: {
    ShoppingCart: function() {}
  }
}
```

Similar to the strategies used with the arguments passed to reducers and components, *components themselves are made available via dependency injection*. In this case directly via state. 

If you are using *New React* with Suspense, you can display a spinner like this instead:

```js
const { ShoppingCart } = state.location.components.checkout

<Suspense fallback={Spinner}>
  <Route path='/' component={ShoppingCart} />
</Suspense>
```

Also note, that within the stripe checkout module, you could leave out the `CHECKOUT` namespacing:

```js
const { ShoppingCart } = state.location.components
<Route path='/' component={ShoppingCart} fallback={Spinner} />
```




## Module Parameterization:

Modules can be parameterized. For example, the parent module can choose paths used by the child module:

```js
import { createModule } from 'respond-framework'

export default createModule((options) => ({
  routes: {
    OPEN_CART: {
      // path: '/cart',
      path: options.openCartPath, // eg: the parent module could choose paths
      thunk: ({ stripe, payload }) => stripe.findCartItems(payload)
    },
    CHARGE: {},
    CONFIRMATION: {}
  }
}))
```

*parent module/app:*

```js
CHECKOUT: {
  load: () => import('respond-stripe-cart').then(module => module({ openCartPath: '/foo' })),
}
```

## Module Props

There's also a very powerful feature called `moduleProps` which is similar to component `props`, but instead are ***props for an entire module***. It allows the parent module to give the child access to parent `state`, `actions` and `types`:

```js
CHECKOUT: {
  load: () => import('respond-stripe-cart'),
  moduleProps: {
    state: {
      user: 'session'
    },
    actions: {
      close: 'home'
    },
    types: {
      CLOSE: 'HOME'
    }
  }
}
```

Now, for example, `state.user` is available as `state.session` throughout the module:

*in a route:*
```js
OPEN_CART: {
  path: '/cart',
  thunk: ({ stripe, payload, state }) => stripe.findCartItems(state.session, payload)
},
```

*in a component:*
```js
components: {
  ShoppingCart: (props, state, actions) => {
    const { session } = state

    return (
      <div>
        <h1>You ready for checkout, {session.firstName}</h1>
      </div>
    )
  }
},
```

> The idea is that `state.user` within the parent module contains the *user session object*; and rather than duplicate this data (in some way that likely causes lots of unnecessary additional renderings), we just unveil otherwise hidden pieces of pre-existing parent state. 

> This also prevents us from needing multiple stores, and as we know having a single store is great for devtools debugging + writing tests


## Big Picture Conclusion

Weirdly enough, as straightforward as it is, keying into a flat hash for namespacing is sophisticated enough to power deep trees of components with the correct state (as well as the actions and side-effects they are supposed to have access to). 

Our far flatter state + side-effects system is able to run side by side with a highly nested component tree structure. 

You have to keep in mind, our nested routes/modules will on average be only 1-3 levels deep, and probably max out at 5 levels for 99% of all apps. Whereas, component trees can easily go 100 levels deep. 

In one you can easily produce linear/horizontal orchestrations of side-effect calling. In the other you are pulling out your hair, asking: "where is XYZ happening!!?!?!?!???"

**Respond Framework** merges and reconciles the best of both worlds via a compile-time-generated namespacing system. Let's learn how that works in the implementation notes:




## Module System Implementation Notes

The *Respond* Babel + Webpack plugins are the secret sauce to unlocking our module system. Without static compile-time information + Webpack stats, it's impossible to create these mini application modules. 

> ASIDE: the **big idea** behind *Respond Modules* is that React's components are modular at a too small a micro level, whereas *Respond Modules* are modular at a higher/larger level. They unlock a sweet spot in terms of how broad the perspective is through which you see portions of your app. **In essence, *Respond Modules* are giant components.**

Let's take a look at the compilation-time steps necessary to create this *brave new world:*


### 1) Statically generate `ROUTES_MANIFEST`

In order for any one code split module to link to another module (via actions) we need the bare minimum amount of information to **generate ALL our action creators** (hereon known simply as *"actions"*). 

*Respond* can generate an action creator based *solely* on its route `type`.

Therefore, in order to create all actions an app has, all we have to do is get to the client a minimal `routesMap` containing only the `type` keys + nesting information (i.e. lots of empty objects) like this:

```js
window.ROUTES_MANIFEST = {
  HOME: {},
  CHECKOUT: {
    load: () => import('modules/checkout.js'),
    routes: {
      STEP1: {},
      STEP2: {},
      STEP3: {
        load: () => import('modules/stripe.js'),
        routes: {
          CHARGE: {},
          CONFIRMATION: {}
        }
      }
    },
  }
}
```

Based on that we can be on the homepage and dispatch you straight to the confirmation page if we really wanted, eg:

```js
const HomePage = (props, state, actions) => {
  return <button onClick={actions.checkout.step3.confirmation}>GO TO CONFIRMATION</button>
}
```

> the `load` method at all nesting levels will be called in parallel, so all callbacks and route information is available

However to merge all the routes from separate chunks, a Webpack plugin is needed:

### 2) Webpack Plugin

Every time **a single chunk** is built--within the Webpack chunk completion hook--we search for a call to `createModule` and extract its file into memory.

In the Webpack hook fired when **all chunks** are built, we transform the routes in these files, using Babel, into the merged `ROUTES_MANIFEST`. In order to accurately capture nesting, we use information from Webpack stats to correlate calls to `import('some-entry')` to the chunk file where the next set of nested routes are contained.

> NOTE: it's a requirement that route types/keys are static and not generated; this also forces conformity among *Respond* apps

During the merging, we strip away all callbacks, reducers, components, etc, so that the manifest is a very small # of KBs. Usually about 1kb gzipped in the end.



### 3) Babel Plugin + Namespacing Components

As described many times above, components need to be be passed state + actions namespaced to their module.

Components also need to conform to our store-centric interface.

To these ends, our babel plugin therefore produces the following extremely simple (and therefore reliable) transformation:

```js
//INPUT:
export const MyComponent = (props, state, actions) => {
  return <div>{state.title}</div>
}

// --> BABEL PLUGIN OUTPUT:

// rename the original component
const MyComponentOriginal = (props, state, actions) => {
  return <div>{state.title}</div>
}

// and then simply use it as a function in conjunction with our context-powered React Hook:
export const MyComponent = (props) => {
  const { state, actions } = useRespond('__respond_pending_chunk_id__')
  return MyComponentOriginal(props, state, actions)
}
```

> *Behold the simplicity required to pass the 2 additional arguments!*

Notice `'__respond_pending_chunk_id__'`. This is an identifier we can replace with something that informs `useRespond` of the namespace the component is part of. After each chunk is built, we replace it with the webpack chunk id like so:

```js
const { state, actions } = useRespond('chunk-id-generated-by-webpack')
```

The elegance of our solution is rooted in the fact that there is a *one-to-one relationship between Webpack chunks and Respond Modules*. Therefore, after each chunk is built, we can replace all occurrences of `__respond_pending_chunk_id__` with the given `chunk-id`, and from there have a stable unique identifier for each of our *Respond Modules*.

**Next:** thus far, our Webpack + Babel Plugin team has been doing double duty:

- **preparing the static routes manifest**
- **namespacing components**

The final step comes in Webpack's hook that is fired when all chunks are built. 

At this point, both the routes manifest is built, and components are namespaced to temporary chunk IDs. **As a result, we have all the information we need to know which temporary chunk ID is paired to which final namespace.** Therefore it's trivial to replace all occurrences of each chunk's ID with the actual namespace chosen by the parent module. After which the chunks are all written to the filesystem by Webpack.


### 4) Proxies to the Rescue

Last but not least, our components, routes, and reducers are passed proxies for `state`, `actions` and `types`. This is what facilitates the dependency injection and the `moduleProps` feature.

Basically, rather than copying and merging lots of objects (and triggering lots of unnecessary re-renderings along the way), the proxy allows us to add dynamic capabilities to objects when accessed. For example, we can decide that parent state such as `state.user` from the above example is mapped to `state.session`. 

In essence, we can add or remove keys from objects that we don't want visible to various modules. This is particularly useful for the mappings provided by `moduleProps` and providing namespaced slices in general.

----

Similar to our compile-time transformations, without Proxies we couldn't do what we're doing. Using Proxies wasn't popular until last year (because of browser support). For example, a year ago *MobX* went all in on Proxies, no longer supporting browsers that don't support proxies. We are officially in an era where many companies choose not to support old browsers (i.e. IE11). I recall Remitano also had made this decision with its focus on Chrome testing.

Therefore, because we are on the frontier of new/advanced technologies like custom compile-time transformations + proxies, we are also the first to achieve simplifications never before possible. In the hands of early adopters, combatants are sure to crush competitors. **Hopefully the interface presented in this article makes it very clear that much less code is needed than before with classic Redux.**



## Module System Implementation Summary

In conclusion, the real magic of the implementation is:

- **that we are able to defer resolution of namespaces until all modules are known in a real application**

- **that a single state store is used behind the scenes, while the slices being accessed are injected at compile time and carefully divvied out by proxies at runtime**

- **that all actions are supplied on app load (via a routes manifest) so it's possible to link anywhere in the app, even if it isn't loaded yet**


## Respond Middleware Implementation Notes

Our async middleware pipeline is the true backbone of *Respond Framework*.

Based on Koa Compose, our pipeline is what the Redux pipeline would look like if it was asynchronous and specialized toward routing. It's extremely powerful. 

We also have our own custom History API. We no longer depend on the `history` package on NPM. 

By coupling our own `History` package with our async pipeline, we are able to do some things never done before in the routing world:

- **we can keep a perfect record of the browser's hidden history entries!** *(world first)*
- we can make it so when the browser back/next button's are used, redirects, blocking, and the idiosyncracies of bailing out of route changes is completely normalized. In other words, it's completely transparent/invisible to your app whether back/next buttons were used or buttons within your app.

Here's a quick list of middleware capabilities that haven't gotten their due attention in this article:

- callback caching
- automatic dispatch of callback returns
- built-in anonymous thunk middleware
- built-in pathless route middleware
- scroll restoration middleware
- change page title middleware
- automatic creation of action creators out of routes
- return false to block route changes
- thorough URL marhasling (params, query, hash, basename, entry state)
- route level middleware customization
- chunk flushing for SSR/Splitting
- code splitting middleware
- global callbacks
- changeBasename action
- redirect action
- notFound action
- addRoutes action
- prefetching (both chunks + callbacks)
- ready state (i.e. all async work is done)
- automatic creation of complete/error action creators
- pref/from objects in state
- history entries, index, length
- direction moving along history entries track (backward, forward)
- additional state info: status, kind, components, chunks, universal, pop, and more
- **easy ability to customize the middleware pipeline array**
- **and lots more**


*Respond Framework's* routing capabilities are truly its crown jewel. Remitano already chose the RFR path, so less needs to be said about this. I'll be sharing more in the form of its actual documentation. The important thing for now is you're signed on to *Respond's* modular approach and conventions to structuring your app. 


## NEXT STEPS (Incremntal Adoption Strategy)

Basically, what needs to be done first is this:

- continue using RFR
- replace Immutable with native data structures
- replace redux-actions with standard reducers + manually created action creators/types
- **move sagas onto route thunks** *(this is the big one)*
- use store from `context` instead of the globally imported `_store` technique; similarly fix other globals


I still have some work to do to get this fully ready for you guys (should you choose to dive in with me). So the goal is: during the time you're doing the above fixes, I'll finalize the missing pieces in code and docs for Respond Framework. 

Lastly, I'll do a sample of the above for the HOME + LOGIN sections of your app (i.e. using Redux-First-Router as you're currently using it). And I'll provide a second *non-functioning* sample of what it would look like taken all the way with *Respond*. I'll get these done next week.

One more thing: by the end of this week, I'm going to provide you with a condensed article that reads more like a succinct walkthrough of capabilities. Consider what you're reading now more like a pitch. What I'd like to get you doesn't compare itself to other solutions, but just walks you through its defining features, similar to: https://reach.tech/router . I know reading the above is cumbersome for your developers, who just want to get the gist. 

Thank you for reading, and please see this all as part of my process; I will continue to refine until what gets to you is seamless for your team to interface with. Your team is more than welcome to ask me questions in chat. This might be a fun thing for them. I have endless documentation to now write, so I'll be posting more frequently now as it's produced. If you and your developers prefer to engage when it's all ready, that's fine too. But consider me part of your team--I have your slack open all day every day now.


## FINAL THOUGHT

I may have not emphasized it enough, but *Respond* is **AUTOMATICALLY CODE SPLIT!!**

So basically, given that *Respond modules* are included only through code splitting (dynamic imports), and given that a *Respond* app is exclusively built out of *Respond Modules*, **it means code splitting is a frictionless act**. Splitting out to a new chunk is as easy as grouping routes into another module. A module can contain just one route too. 

So with this structure, splitting will never be an afterthought, but just a mundane part of your routine **you get for free**.

*NextJS* is also automatically code-split. But the way you design your app is page-based like in the PHP days. So what *NextJS* does for pages + standard React apps, *Respond* does for routes + Redux apps. SSR in both is also automatic, though a little less automatic in *Respond*, and instead *flexible* while *simple*. In other words, *Respond* doesn't box you into a **"walled garden"** for how you must use Node + Webpack like *Next*. Instead, it's a ***pattern*** for low level Node + Webpack usage, with constraints/opinions only in terms of how you React.

