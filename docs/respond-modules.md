# Respond Framework -- Why You Want It + How It Works

The following is an explanation of the *big picture* problems solved by **Respond Framework** plus a description of key parts of our *implementation*.


## Big Picture (MODULARITY + LINEAR SIDE-EFFECTS MANAGEMENT)


### Modularity

The big picture is this: **names conflict in software.** As seemingly small as that sounds, it prevents the most important super power of well designed software: ***MODULARITY***. 

*Modularity* is what allows independent developer teams to go off and privately build part of a larger application with confidence that what they build will plug in nicely to the greater whole, free of conflicts.

*Modularity* is so important that the entire design of React, and all the painstaking work the React team has done on Hooks/Suspense/Etc has been towards this goal. More specifically, their work has been towards preserving the initial modularity their chosen primitive, *components*, brought to the table, while better tackling a larger set of capabilites. 

Not to different from us, those **capabilities** are:

- **async data fetching + side effects**
- **accessible state stores** (i.e. `context` which circumvents prop drilling)
- an even more **"functional"** rendering system

> In other words, the modern **MVC** of application development

**Redux lacks this modularity however, and it's a major thorn in the side of large developer teams that want to move fast and achieve their greatest potential.** *When was the last time you saw a React component bound to a redux store on NPM??? Never.*


### Linear Side-Effects Is Best

The flip side is that even though plain React is modular, its approach lacks linear side-effects management. *Why is this a major problem?*

**The achilles heel of the component-obsessed approach (yes, with Hooks/Suspense too) is that side-effects are better known prior to rendering, rather than randomly discovered during component tree traversal.** The resulting order can be random and impossible to coordinate predictably. You often are wondering/debugging "where is xyz happening?" Worse, these are **surprises**. 

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
      SETTINGS: '/settings',
      load: () => import('modules/settings') // modules are automatically code-split
    }
  }
}

const options = {
  reducer: reduxReducer,
  enhancer: reduxEnhancer, // standard syncronous Redux middleware API is in here
  beforeEnter: ({ getState, params, query, hash, basename, muchMore }) => { // best URL transformation
    if (params.userId && !getState().user) {
      return { type: 'LOGIN' } // redirects automatically applied
    }
  }
}

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

Before examine how we solved the problem of *"Redux Modules"*, we must become familiar with how Redux is now built-in to React. Let's check out *Respond's* slightly modified component API:

```js
const RespondComponent = (props, state, actions) => state.open && <Menu toggle={actions.toggle} /> 
```

> Yes, Respond components receive 3 args, you never need to bind `dispatch` or `mapStateToProps`, and perf is high

Of course you can still create components the old way, but any time you want access to the state or actions, you know they're right there as additional arguments. In other words, our new component API is an optional *extension* of current component functions and makes no breaking changes. 

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
<Route path='/dashboard' component='MODULE_NAME.RespondComponent' /> // notice the component is a string

// we will describe how "moduleName" is assigned below (hint: think ES6 modules + aliasing by parent)
<button onClick={actions.moduleName.dashboard}>GO TO DASHBOARD</button>
```


> Code splitting never requires more work than nesting dynamic imports in your routes map

> Reducers (state), routes (actions + types) *& components* are injected via dependency injection, w/ dynamic loading happening under the hood

> It's *Respond's* job to insure dependencies (reducers, routes, and components) are where you need them

> **So all we must do is get Remitano's `routesMap` to look like this, and you get code splitting + SSR for free!**

> Plus you also make it easy for your team to automatically follow best practices for a wide variety of tasks


## Respond Framework vs. New React vs. Traditional Redux/Sagas/etc

Much has been said comparing *Respond Framework* to the new hooks/suspense-based React system, even though Remitano has already committed to a global state store Redux-based system. The reason for this is to make your options clear.

It would be unwise for any serious 2019 application refactoring not to consider what the React team has put forth. More specifically, my intention is for the Remitano team to see how *Respond Framework* is far superior to both *New React* plus traditional Redux/Sagas-based systems, so you feel you are in the best of hands choosing this approach.

The React team has drawn some serious lines by all the work they have put into their *"component everything"* approach. Any serious React app refactoring in 2019 should take very seriously the new *status quo* approach in comparison to Redux. Essentially the React team--whose leader by the way is the creator of Redux--has made it their goal to rival Redux-based apps with React alone! They want React to be all you need.

Therefore, it's of the utmost importance that the power of the combination of modularity + async pipelines is truly grokked. It's a true game changer.

### Some backstory on me and the creation of Respond Framework:

Respond Framework was 80% completed as of last spring 2018. After spending almost a year since the launch of Redux-First-Router making *Respond Framework*, I made the executive decision to put all progress on hold, as the future was uncertain given all the yet-to-be-release hooks/suspense capabilities.

My reasoning in putting a pause on all this hard work is that I spent an entire year in 2014-2015 making an OOP framework on top of [Meteor](https://www.meteor.com), only for all my hardwork to go to waste once React (and to a lesser extent GraphQL/Apollo) completely changed the ecosystem, making Meteor essentially obsolete. This framework, by the way, was called [Ultimate MVC](https://github.com/ultimatejs/ultimate-mvc). 

While I grew a ton as a developer building both frameworks (and I always say: **"YOUR MOST IMPORTANT PROJECT IS YOURSELF"**), I couldn't afford a second time for all my time to amount to just personal growth as a developer. I had to be building something that had a high probability of becoming popular and becoming a major avenue to financially thrive.

**So after watching Hooks be released and much of Suspense, I've determined that we are by far the winning solution!** And more importantly that there is in fact a perfect place in the market for this approach/framework (as the refactoring + code-splitting/ssr needs of your system are proof of).

### What about Sagas, Immutable, Redux-Actions and our current Redux system?

As alluded to above, aside from lacking *modularity*, Redux systems lack coherent best practices. More specifically, Redux lacks an API that automatically and naturally leads you into the "pit of success" of best practices. There's endless choices:

- sagas vs observables
- redux-actions, immutable, and other decisions
- redux-first-router or React Router + React-Router-Redux etc
- every plugin like redux-persist must in the extreme be: immutable-redux-first-router-redux-persist

Endless developer time is lost plugging together *plugins of plugins of plugins*, and hoping they all play nice together.

It's been several years now of these shenanigans. Most of these tools have stabilized. It's time for a cohesive API that brings the best of all these worlds, while elimating the cruft. 

The community has essentially come to **consensus** about several of these tools (my guess is you've heard this from other thought leaders than just me):

- immutable isn't worth it, as the perf gains over native data structures is neglible, and conversions back and forth possibly undo any perf gains anyway
- redux-actions results in less flexible reducers; standard reducer functions let you listen to more actions more easily (aka "less actions, fat reducers" approach); the additional API surface isn't worth it
- routing coupled to your state store (rather than plugins to connect to React Router) eliminates a plethora of problems described in my initial Redux-First-Router aticles from 2 years ago
- the verdict about Sagas is that thunks are simpler 80-100% of the time, depending on your application's needs; therefore, only use Sagas when suited towards specific problems that they are a better primitive for (e.g: autocomplete, complex login flows, fast streaming information); and often Observables are in fact better primitives for these precise problems

*Respond Framework* is designed so that you can use thunks, sagas, observables (and even Apollo/GraphQL) ***all together!*** You must just install the appropriate middleware. In other words, the days of Redux-First-Router only supporting thunks is over. That's not to say all these middlewares are built yet, but it's refreshingly easy to add them. 

That said, 80% to possibly 100% of Remitano's sagas are the kind of async data fetching work that better belongs in thunks (as per the above consensus/verdict).

If there's an area in your app where we truly need Sagas, I'll cook up the middleware. If it makes sense as part of our **incremental adoption** strategy, I'll cook it up *sooner*. I'm confident there's plenty of work to do in moving sagas into route thunks. More importantly, it will greatly simplify the codebase.


### "Less Actions, Fat Reducers" -- 2 actions per route transition, no more

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

However, in your app, a typical mistake is being made: actions are being used as setters, and a million actions are being dispatched during what is conceptually a single route change. You might as well be using a mutable store instead of Redux. It's taking things back to the jQuery days, and missing great opportunities for predictability and increased perf.

Don't worry, you are not the only one. I spent 2017 as a code mentor working for many companies, and I've seen this everywhere. Basically, if you aren't using Redux-First-Router (or working very hard to make React Router conform to a similar approach), you will end up here. It's hard to extend your app from this place.

### How Could So Many Developers + Thought Leaders Get This All Wrong??

First of all, by now many have figured out similar practices. Most are busy just using them. But there's a vocal majority of people lacking in the appropriate experience.

The React/Redux community isn't too be trusted--because they are torn between taking Redux to its logical conclusion (which looks like the RFR approach) vs. trying to look like standard React. If you follow mainstream approaches, you were using `componentDidMount` and `componentWillReceiveProps` to do data-fetching. And then on top of that you are dispatching multiple actions. Hooks, though simpler, is no different.

**This doesn't work for SSR because you are never sure when all the necessary actions have done their work, and you have all the data you need to render. You need to be sure you have all the data you need in as few a number of actions as possible. You need to at least be sure of the final action, after which the component tree is ready for rendering.** 

Many double render solutions were invented to combat this. So you had to either follow such a system, or you do something far simpler--follow a 1-2 dispatch approach like in RFR:

- first action to trigger the route location change state
- a possible second action when all the data fetching is complete

The `routesMap` makes this simple, and you can do all this based on `req.url` on the server, and then render a single time based on the state of the store. **It's the epitome of simple, logical and natural.** 

Here's what SSR looks like:

*server/configureStore.js:*
```js
import { createApp } from 'respond-framework'
import reducer from './reducer'

export default async function configureStore(req) {
  const routesMap = {
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
import App from './components/App'

export default async function serverRender(req, res) {
  const store = await configureStore(req)

  const appString = ReactDOM.renderToString(<Provider store={store}><App /></Provider>)
  const stateJson = JSON.stringify(store.getState())

  return res.send(
    `<!doctype html>
      <html>
        <body>
          <div id="root">${appString}</div>
          <script>window.RESPOND_STATE = ${stateJson}</script>
          <script src="/static/main.js" />
        </body>
      </html>`
  )
}
```

*server/index.js.js:*
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



### NEXT: Combination SSR + Splitting

The combination of SSR + Splitting presents an even greater problem. Whereas splitting in an SPA is not as challenging, once combined with SSR, you're typically in a world of hurt (especially if you aren't using a single pass global state store approach as prescribed by RFR).

In the RFR days, we still did splitting at the component level with [react-universal-component](https://github.com/faceyspacey/react-universal-component). In essence, we were split across 2 worlds (i.e. not an ideal place to be).

*Respond* solves this with *dependency injection*--which is just a fancy way of saying we store components in state, and display a loading.. animation when a route path is matched, but the corresponding component doesn't exist yet in state:

```js
<Route path='/dashboard' component='MODULE_NAME.RespondComponent' /> 
```

Also note, the ideal way to use our `<Route />` component is more like this:

```js
<Route type='MODULE_NAME.DASHBOARD' component='MODULE_NAME.RespondComponent' /> 
```

> in other words, don't couple your app to paths you may wanna change, but rather to action types


Lastly, you're probably wondering where `MODULE_NAME` came from, which takes us to the next section...



## Respond Modules Implementation

Having come this far, it's now time to see how *"Respond Modules"* actually work. 


### My Experience

Nobody has more experience in this area than me. I wrote the book. I cracked the code. I try my best not to be arrogant, and just state the facts. This is fact. 

As for the React team, you can check for yourself, Dan Abramov, I quote, has "never talked from Node to a database and [doesn't] really know how to a write backend in it": 

https://overreacted.io/things-i-dont-know-as-of-2018/

endquote

In essence, the thought leaders--and he's not the only one--don't know enough when it comes to building full stack apps. And based on their solutions and what they choose to focus on, clearly aren't including these needs in what they're building. 

Here's another core React team member at Facebook who recently tweeted:

> After getting back into app dev, I feel like the React team has: **underestimated how much code in apps is related to data fetching/management, overestimated how complex data reqs for most apps are.** At least, I did! Now feeling like a read only react-fetch pkg _would_ cover 95%.

> To be clear I think that React is well on its way to great solutions for these using Suspense, etc. (Better than what you can do today in any framework, I hope.)
Just wish I had fully appreciated the problem a little sooner.

https://twitter.com/sophiebits/status/1097732632840826880


The React team doesn't know fetching in real/typical apps. They know Facebook which is far from typical and doesn't need SSR, and not to mention has hundreds of engineers able to solve the unique idiosyncracies of their app. In other words, however they're using React likely looks way different than the rest of us.

What the React team comes up with seems to fit whatever those needs are plus target the needs of learners. The React team is out of touch with the needs of small teams (1-10 developers) that are responsible for building and extending entire apps soup to nuts in a short amount of time. Aka startups like Remitano 

#opinions #faceyspacey #respond-framework #2016-2019


### Back to your Redux usage

Using the *Respond* system relies first and foremost on re-imagining your sagas as a far smaller number of thunks. It relies on getting all the data you need in a single thunk attached to a route, with the result being only 2 actions dispatched. Designing your app this way flows downstream toward writing ****"fatter reducers"***. Essentially, your reducers must become smarter and each listen to a greater number of actions. Finally, you must remove lots of unnecessary state/reducers that are holding redundant information.

Right now an action is dispatched from the UI, which is listened to by a Saga, which then dispatches setter actions. The initial saga didn't even do anything. It should at least be responsible for a route change. What really should have happened is a route change action was dispatched, and then the route's paired thunk does dispatches all the data (and possibly other information needed) in a single follow-up dispatch.

Sagas often end up this kind of listener soup, and it's unnecessary, and makes apps very hard to reason about. 

Lastly, the pattern of using a global `_store` object doesn't work--because SSR requires a unique `store` instance per request. The store must be passed down **through context only** to insure this. In addition, such globals make testing a problem.

### Simple Testing is the Holy Grail of Redux Apps


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





## The Next Level of The Stack

Now that we've made clear our best of both worlds approach (modularity + linear side-effects), let's get a stronger feeling for how **Respond Framework is a required evolution to the application development stack**.

Application development is like a *building*. Each floor/level contributes something necessary to rise higher and higher, with the foundation being the most important part of the stack. 

The foundation of a large building is made up of several floors on the bottom devoted to very important things like power, fuel, garbage collection, maintenance, mail room, etc. And that's not to mention, the metal must be firmly secured.

On top of a solid enough foundation, however, can be built many times more floors (where the builders attain the value they seek). The sky is the limit for these builders (Remitano). 

Modern application development stack with **Respond Framework** looks like this:

- your app
- your app
- your app
- your app
- your app
- your app
- your app
- your app
- controller/route/side-effects management (redux-first-router or Respond Framework)
- model/state management (redux or Respond Framework)
- view rendering library (react, or ***slightly*** modified namespaced Respond Components)
- javascript (+ browser/node APIs)
- C++ 
- assembly
- CPUs + memory

Each level of the stack has a unique capability it introduces, usually in the form of--if done correctly--a small number of ***primitives.*** The smaller the number, and the better suited for the given task, the more powerful the abstraction. 

> Everyone in the open source software industry is in search of the perfect primitive to simplify software development.

**1) The React level of the stack** offers the ***"component"*** primitive--and we have already covered it's weaknesses.

**2) The Redux level of the stack** offers its own primitive: the *reactive subscription-based state store* object. Its primary weakness however is that ***it's not modular.*** Here are the reasons why:

- "Redux Component Modules" do not exist on NPM that you can use in your project conflict-free
- it's impossible to guarantee that an NPM component using redux accessing `state.posts` does not already exist
- it's impossible to namespace state keys
- it's impossible to parameterize state keys so they can be defined in userland
- building parts of an app together across team members--if not using NPM--inherit all these problems, and **require far more coordination than is necessary**

In essence, if you're building a Redux app, don't expect it to be easy to have one team go off and build one part, and another team another part, and so on, and expect it to all glue together nicely *without lots of otherwise unecessary planning/coordination.* 

Conversely, if it was a breeze, tremendous developer productivity would be unlocked.

> A secondary problem with Redux is that there are so many ways to use Redux that it's very hard to fall into the "pit of success" like you can do with Rails, which makes more obvious a set of best practices. Currently Remitano suffers from many of these ***Redux pitfalls***, which we will be discussing later on (as right now, we are covering only *unavoidable weaknesses in current technologies*). One hint though is: *just take a look at the above routesMap with thunks/sagas/loadCodeSplitting/nestedRoutes/etc--this very much narrows the best practices to utilize.*

**3) The Redux-First-Router level of the stack** offers the ***"route"***--which is not too different from a *controller*--as its primitive. Routes facilitate the precise timing of the execution of effects. The weakness of Redux-First-Router is that the level of customization of route side effects was very minimal (pretty much limited to a thunk). *Respond* provides complete customizeability via its own asyncronous koa-based middleware API.


## Respond, An Opinionated System

**The Respond Framework** couples the job of the last 3 levels of the stack (particularly the last 2) into an **opinionated system** where:

- best practices are obvious
- horizontal/linear route execution between component tree re-renderings is extremely customizeable ***(and I mean extremely customizeable; this is the unsung hero of the Respond approach)***
- where "Redux Component Modules" don't just exist, but are *how you build individual parts of your app*
- test writing can be 99% completely automated via simple arrays of `actions`
- where routing is as important of a concern as state management + rendering (examples of advanced things Respond can do: maintain history entries array in state, effects caching, route middleware API)
- state store access is built-in to components
- **code-splitting + SSR is built-in + automatic**


The alternative--component tree design--results in arbitrarily placed, potentially conflicting "effects." Coordination and orchestration is completely lacking in this design, notwithstanding that reverse propagation boundary solutions like `<Suspense>` come to the rescue to some degree. 

> Coming from a Rails system, Remitano should feel right at home with stuffing all effects in routes, as they are akin to *"controllers"* in Rails.

However, as described above, what React's new system does very well is *MODULARITY*. But all is not right in *Reactlandia*. The work necessary to make these "modules" talk to each other is cumbersome, especially as needs evolve. In other words, the cost of modularity is communicating "lifted" state/information/coordination down your component tree, as has always been the problem with standalone React.

The new React system relies on essentially the *multi store* approach using context and things like `useReducer` to propagate small *mini* stores down the component tree when needed. 

The achilles heel of this aspect is that it's both *"mini"* and *"multi"*. 

Because it's *"multi,"* time travelling such systems becomes impossible in reality. Dreams of completely automated testing systems based on arrays of Redux actions go out the window because it's impossible to coordinate across more than one store. 

The fact that each contained microcosm of state is *"mini"* means you're always struggling to get the state you need where you need it as your app expands or as you refactor it (again the "lifting state/fx" slog). And that's not to mention that lifting and drilling results in perf losses, which are very noticeable in the form of jank within heavily animated apps.

Traditionally, single state store systems like Redux on the other hand don't have these problems, but fall short in modularity. When was the last time you saw a set of Redux components + reducers + actions on NPM to snatch up and grab?? *Never.* Those action types and reducer state keys are not guaranteed to be unique. In fact they are pretty much guaranteed to *conflict somewhere with the existing actions of your app.*

So whatever solution that comes to the rescue, it's going to revolve around namespacing those action types and reducer state keys. 




### Characteristics of Modules

We can take a page from the **ES6 Modules** playbook to see what characteristics we seek:


*MyComponentA.js*
```js
import { MyComponentB as Component } from './MyComponentB.js'
```


*MyComponentB.s*
```js
export const MyComponentB = (props, state, actions) => {}

export const YetAnotherComponentEtc = (props, state, actions) => {}
```


The defining part you're looking at is `as Component`. In other words, the ability for parent modules to alias names from the child module is the crux of avoiding name collision in a module system.

We need this capability everywhere we go in Respond:

- components
- reducers
- action types
- routes (which are the basis for action types)

That means components must access only a slice of state corresponding to their module. The actions made available must only be the ones created out of the routes within the module.

Reducers, as within `combineReducers` already do that, but must also be passed a 3rd argument containing `types`:

```js
const myReducer = (state, action, types) => ...
```

And of course those `types` most only be the `types` corresponding to the given module.

> aside: passing `types` as a 3rd argument to reducers will be covered in the implemtation section, but basically, this approach allows for the *dependency-injection-like* ability to manipulate exactly what `types` are accessible in the reducer, which in our case allows us to avoid collisions via namespacing. 

And last but not least, routes and their paths must not conflict. For example, when a 3rd party **Stripe** component has a route with the path `/cart`, the parent module that imports this must be able to choose what to prefix it with, or possibly even change the path altogether. The route types must also not conflict. Namespacing route action types comes to the rescue there.

### Example

`$ yarn add respond-stripe-cart`

```js
import { createModule } from 'respond-framework'

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
    CHARGE: { // pathless route
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

**Now how might we include this module in a parent application?**



```js
import createApp, { Route } from 'respond-framework'
import stripeModule from 'respond-stripe-cart'

const { store, firstRoute } createApp({
  reducer, // previously in Reduxlandia: createStore(reducer, initialState, enhancer)
  initialState
  enhancer,
  components: {
    App: (props, state, actions) => {
      return (
        <div>
          <Route path='/' component='CHECKOUT.ShoppingCart' /> // automatically code-split

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
      path: '/checkout',
      load: () => import('respond-stripe-cart'),
    }
  }
}, options, middlewares)
```
The result is **firstly** that our final route structure--after dynamics imports are applied--is nested and looks like this:

```js
const routes = {
  HOME: {
    path: '/home'
  },
  CHECKOUT: {
    path: '/checkout',
    routes: { // applied nested routes
      OPEN_CART: {
        path: '/cart', // reified path: /checkout/cart
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
        path: '/thank-you', // reified path: /checkout/thank-you
      }
    }
  }
}
```


**Secondly**, the result is that we have actions namespaced with `checkout.` and paths prefixed like `'/checkout/cart'`. In essence a module also became a nested route! We could have chosen to forego the path prefixing by not including it like this:

```js
CHECKOUT: {
  load: () => import('respond-stripe-cart'),
}
```

*In which case, we used the "route" solely for its namespacing capabilities (i.e. not path nesting, and not thunk nesting).* ***This is the essence of how Respond circumvents name collisions like ES6 Modules!***


**Next,** as far as state goes, only the child module has access to its self-contained state, eg: `cartVisible`. Behind the scenes, the state being accessed is `state.checkout.cartVisible`. 

The real magic is not just that it has its own state, but these aspects of the implementation:

- **that we are able to defer resolution of the name selected for a module's namespace--which within a module is unknown and impossible to avoid conflicting--until the module is included in a real application parent module (e.g. when resolves to `checkout` in the above example)**
- **that a single state store is used behind the secnes, allowing for easy testing + time traveling**
- **that descendant components within the same module also are informed of the state slice they have access to, which is due to our babel compilation time implementation that will be described in the next section**

Actions like `actions.checkout.openCart` (which of course correspond to he `OPEN_CART` route and action type) are however available throughout the whole app, in order to facilitate key capabilities like linking between modules!

> currently we're undecided as to whether only higher modules can access actions, or if *all* modules can. Possibly just higher, and lower modules must be passed such actions as props. 

**Lastly**, our module's components are automatically code split via our `<Route />` component:

```js
<Route path='/' component='CHECKOUT.ShoppingCart' />
```

The main thing to notice is that component's are passed as a string--this is because they don't exist yet, and because they will be coming from state using these keys. State will have this:

```js
state.location.components = {
  CHECKOUT: {
    ShoppingCart: function() {}
  }
}
```

Similar to the strategies used with the arguments passed to reducers and components, *components themselves are made available via dependency injection*. In this case directly via state. 

If it's not loaded, you can display a spinner using suspense:

```js
  <Suspense>
    <Route path='/' component='CHECKOUT.ShoppingCart' />
  </Suspense>
```

Also note, that within the stripe checkout module, you could leave out the `CHECKOUT` namepsacing:

```js
  <Suspense>
    <Route path='/' component='ShoppingCart' />
  </Suspense>
```


The following section covering the compile time babel implementation will describe how components can know what module they are part of, which accordingly allows for leaving out parent module namespacing.


### ONE LAST THING (Module Parameterization):

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


There's also a very powerful feature--similar to parameterization--for the parent module to give the child access to parent state. It's tentatively called `stateMappings`:

```js
CHECKOUT: {
  load: () => import('respond-stripe-cart'),
  stateMappings: {
    user: 'session'
  }
}
```

Now anywhere within the child module, `state.session`, is available, eg:

```js
OPEN_CART: {
  path: '/cart',
  thunk: ({ stripe, payload, state }) => stripe.findCartItems(state.session, payload)
},
```

or in a component:


```js
components: {
  ShoppingCart: (props, state, actions) => {
    const { cartVisible, cartItems, session } = state
    const { openCart, charge, back } = actions

    return (
      <div>
        <h1>You ready for checkout, {session.firstName}</h1>
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
```

> The idea is that the parent module has `state.user` with the user session object, and rather than duplicate this data (in some way that likely causes lots of unnecessary additional renderings), we just unveil otherwise hidden pieces of pre-existing parent state. How it's done will be described in the implementation section, but the hint is that proxies once again come to the rescue to de-couple and make this connection under the hood.


There may also be a need for `actionMappings`, but it's not clear yet. 

In short, both mappings are form of specialized props or parameters to give child modules special access to *how the parent module sees the store*. Notice the argument/prop isn't a `store` or state value itself. Rather, it's a mapping in string form. The reason should be clear by now: **the same store is used across all modules; we are just using guaranteed to be unique non-conflicting naming to key into it!** This is our secret sauce.  



### Big Picture Conclusion

Weirdly enough, as straightforward as it is, keying into a flat hash for namespacing is sophisticated enough to power deep trees of components with the correct state (as well as actions and side-effects they are supposed to have access to). 

Our far flatter state + side-effects system is able to run side by side with a highly nested component tree structure. 

You have to keep in mind, our nested routes/modules will on average be only 2-3 levels deep, and probably max out at 5 levels for 99% of all apps. Whereas, component trees can easily go 100 levels deep. 

In one you can easily produce linear/horizontal orchestrations of side-effect calling. In the other you are pulling out your hair, asking: "where is XYZ happening!!?!?!?!???"

**Respond Framework** merges and reconciles the best of both worlds via a compile-time-generated namespacing system.


## Implementation


### 1) Statically discover ALL routes + `generate ROUTES_MANIFEST`

In order for any one code split module to link to another module (via actions) we need the bare minimum amount of information to generate all our action creators (hereon known simply as *"actions"*). 

Pre-Respond Rudy had a `createScene` utility function which generates action creators based on your routesMap. 80% of the time it can generate an action creator based on just the `type` string. There are a few edge cases that require a few more pieces of info, but not code like thunk callbacks, and certainly not components and reducers.

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
  return <button onClick={actions.checkout.step3.confirmation} />
}
```

The expectation is that all intermediary routes/namespaces will be loaded.

> VERY IMPORTANT THING TO NOTE: routes, when acting as a parent route are doubling as both module namespacing *and nesting*. It's a "collapsing" of capabilities under a singular/simple API.

As far as implementation, our `codeSplit('load')` middleware will be sure to load *all intermediary* routes in parallel. 

### 1B) The Discovery

Essentially we need to track each `import()` from the top to the bottom. Each dynamically imported module becomes a significant "boundary" we use to assign namespacing. 

For example, the `modules/checkout` module will have many components imported into the primary component--they will also be assigned the `CHECKOUT` module. 

Most importantly, at the file location of each dynamic module, we extract the routes statically. The means routes can't be generated statically. They must exist in files like `modules/checkout.js` like this:

```js
routes: {
  STEP1: {},
  ETC: {}
}
```

2) Namespace Assignment to Files

As mentioned above, descendant components not directly within the module boundary file, need to be assigned the correct module. This is so they are assigned the correct slice of state (and actions) in one of our components, eg:

```js
const MyComponent = (props, state, actions) => {
  return state.isPaid ? <h1>paid</h1> : <h1>unpaid</h1>
}


//INPUT:
export const MyComponent = (props, state, actions) => {
  return <div>{state.title}</div>
}

// --> OUTPUT:

// rename the original component
const MyComponentOriginal = (props, state, actions) => {
  return <div>{state.title}</div>
}

// and then simply use it as a function within the template:
export const MyComponent = (props) => {
  const state = useReduxState();
  const dispatch = useReduxDispatch();
  return MyComponentOriginal(props, state, actions)
}


```

### 2) 

1) Generate ROUTES_MANIFEST
2) Hashing & Reifying namespace names
3) De-coupling via Proxies
4) Nesting vs Namespacing




## Edge Goals


- how to deal with dynamic segments in dynamic imports: 
```js
load: ({ params }) => import(`foo/${params.param}`)
```

- **what about loading `routes` that correspond to a single route?**

Firstly, it's important to note we support single reducers or components like this:

```js
export default createModule({
  reducers: (state, action, types) => ...,
  components: (props, state, actions) => <div />,
})
```

> we thought of providing a singular version, but rather than document additional keys and wonder what happens if u have both, we decided just type detection (`object` vs `function`) was the way to go. Who cares if the key name is unnecessarily plural some of the time.

So the question, since we have this expected behavior with these 2 important aspects--what about routes? Here are the benefits of a single route module: 

*app.js*
```js
export default createApp({
  routes: {
    FOO: {
      path: '/foo',
      load: () => import('./bar.js')
    }
  }
})
```

*modules/bar.js*
```js
export default createModule({
  routes: {
    path: '/bar/:param',
    thunk: () => ...
  }
})
```

In this example, the idea is that `createModule` doesn't look like this:


```js
export default createModule({
  routes: {
    BAR: { // THIS TYPE IS MISSING!
      path: '/bar',
      thunk: () => ...
    }
  }
})
```

Rather, it corresponds to a single route, which allows us to to split a single route and *avoid the sometimes unnecessary de-coupling of namespacing*. 

Notice how the namespace and type is `FOO`, not `FOO/BAR`. The action creator is `actions.foo()`, not `actions.foo.bar()`. 
