# Respond Modules

The following is an explanation of the *big picture* goals of Respond Modules plus the best description of the *implementation* we can offer at this time.


## Big Picture (MODULARITY)

The big picture is this: **names conflict in software.** As seemingly small as that sounds, it prevents the most important super power of well designed software: ***MODULARITY***.

*Modularity* is so important that the entire design of React, and all the painstaking work the React team has done on Hooks/Suspense/Etc--though not obvious--has been towards this goal. Rather, towards preserving the initial modularity *components* brought to the table, while better tackling a larger set of capabilites. 

Not to different from us, those **capabilities** are:

- **async data fetching + side effects** (of which the sub-list is never ending)
- **accessible state stores** (i.e. context circumventing prop drilling + better render perf)
- a more **"functional"** feeling system

The achilles heel of the component approach (yes, old and new) is that side-effects better belong grouped together as part of a sequential design rather than as part of a tree. 

In Respond this primitive is a `route` that facilitates the precise timing of the execution of effects. 

The alternative--react component tree design--results in arbitrarily placed, potentially conflicting "effects." Coordination and orchestration is completely lacking in this design, notwithstanding that reverse propagation boundary solutions like `<Suspense>` come to the rescue to some degree. 

However, what React's new system brings to the table in spades is *MODULARITY*--the ability for disparate development groups to write code that is guaranteed to work correctly when included in a larger app. It may be quite cumbersome to bring the likely many disparate "component modules" together in a cohesive app--i.e. to talk to each other--but at least initially, each "component module" can do what it does best quite easily. In other words, the cost of modularity is communicating "lifted" state/information/coordination down your component tree, as has always been the problem with standalone React.

The new React system relies on essentially the *multi store* approach using context and things like `userReducer` to propagate small *mini* stores down the component tree when needed. 

The achilles heel of this aspect is that it's both *"mini"* and *"multi"*. 

Because it's *"multi,"* time travelling such systems becomes impossible in reality. Dreams of completely automated testing systems based on arrays of Redux actions go out the window because it's impossible to coordinate across more than one store. 

The fact that each contained microcosm of state is *"mini"* means you're always struggling to get the state you need where you need it as your app expands or as you refactor it (again the "lifting state/fx" slog).

Traditionally single state store systems like Redux on the other hand don't have these problems, but fall behind in modularity. When was the last time you saw a set of Redux components + reducers + actions on NPM to snatch up and grab?? *Never.* Those action types and reducer state keys are not guaranteed to be unique. In fact they are pretty much guaranteed to *conflict somewhere with the existing actions of your app.*

So whatever solution that comes to the rescue it's going to revolve around namespacing those action types and reducer state keys. 

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

Reducers, as within `combineReducers` already do that, but must also be passed a 3rd argument containing `types`. And of course those `types` most only be the `types` corresponding to the given module.

> aside: passing `types` as a 3rd argument to reducers will be covered in the implemtation section, but basically, this approach allows for *dependency-injection-like* ability to manipulate exactly what `types` are accessible in the reducer, which in our case allows to avoid collisions via namespacing. 

And last but not least, routes and their paths must not conflict. For example, a 3rd party **Stripe** component may have a route with the path `/payment`--the parent module that includes this must be able to choose what to prefix it with, or possibly even change the path altogether. The route types must also not conflict. Namespacing route action types comes to the rescue there.

Let's end the big picture section with an example:

*`yarn add stripe-cart`*

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
import stripeModule from 'stripe-cart'

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
      load: () => import('stripe-cart'),
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


**Secondly**, the result is that we have actions namespaced with `checkout.` and paths prefixed like `'/checkout/cart'`. In essence a module also became a nested route! We could have choose to forego the path prefixing, just by not including it like this:

```js
CHECKOUT: {
  load: () => import('stripe-cart'),
}
```

*In which case, we used the "route" solely for its namespacing capabilities (i.e. not path nesting, and not thunk nesting).* ***This is the essence of how Respond circumvents name collisions like ES6 Modules!***


**Next,** as far as state goes, only the child module has access to its self-contained state, eg: `cartVisible`. Behind the scenes, the state being accessed is `state.checkout.cartVisible`. 

The real magic is not just that it has its own state, but these aspects of the implementation:

- **we are able to defer the name selected for the module's namespace, `checkout`, until the module is included in a real application parent module**
- **the a single state store is used behind the secnes, allowing for easy testing + time traveling**
- **descendant components within the same module also are informed of the state slice they have access to, which is due to our babel compilation time implementation that will be described in the next section**

Actions like `actions.checkout.openCart` (which of course correspond to he `OPEN_CART` route and action type) are however available throughout the whole app, in order to facilitate key capabilities like linking between modules!

> currently we're undecided as to whether only higher modules can access actions, or if *all* modules can. Possibly just higher, and lower modules must be passed such actions as props. 

**Lastly**, our module's components are automatically code split via our `<Route />` component:

```js
<Route path='/' component='CHECKOUT.ShoppingCart' />
```

The main thing to notice is that component's are passed as a string--this is because they don't exist yet, and because they will becoming from state using these keys. State will have this:

```js
state.location.components = {
  CHECKOUT: {
    ShoppingCart: function() {}
  }
}
```

Similar to action types being injected into reducers, and the correct action creators being passed as the 3rd argument to reducers, and the state passed being the correct namespaced slice to begin with, *components themselves are made available via dependency injection*. In this case directly via state. If it's not loaded, you can display a spinner using suspense:

```js
  <Suspense>
    <Route path='/' component='CHECKOUT.ShoppingCart' />
  </Suspense>
```

Also note, that within the stripe checkout module, you could leaveout the `CHECKOUT` namepsacing:

```js
  <Suspense>
    <Route path='/' component='ShoppingCart' />
  </Suspense>
```


The following section covering the compile time babel implementation will cover how components can know what module they are part of, which accordingly allows for leaving out parent module namespacing.



## Implementation

coming soon...




## Questions


- how to deal with dynamic segments in dynamic imports: 
```js
load: ({ params }) => import(`foo/${params.param}`)
```

- what about loading `routes` that correspond to a single route?

- what about parameterized modules!, eg:

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
