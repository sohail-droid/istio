# Istio, Gateway API and Ingress — Complete Guide (Explained with Examples)

**One single document to read, understand, practise and revise.**
Everything is explained with a real-life example first, then the technical part.

---

## How to use this document

| If you want to… | Go to |
|---|---|
| Understand *why* all these things came into existence | **Part 1 — The Logic** |
| Know what exactly is Ingress, Gateway API, Istio | **Part 2 — The Three Layers** |
| Answer "what is same, what is different?" | **Part 3 — Same vs Different** |
| Decide "should we use Istio or not?" | **Part 4 — Why Istio, Why Not** |
| Learn Istio topic by topic | **Part 5 — Istio Syllabus** |
| Do hands-on practice | **Part 6 — Practical Labs** |
| Fix something which is broken right now | **Part 7 — Troubleshooting** |
| Revise quickly before interview | **Part 8 — Cheat Sheet**, **Part 9 — Q&A** |

---

## Our running example — please remember this

Throughout this document we will use **one single application** so that you don't get
confused. Let us say we are building a food delivery app called **FoodKart** (like
Swiggy or Zomato).

Our application has these microservices:

```
   frontend            →  the website / mobile app backend
   restaurant-service  →  shows list of restaurants and menu
   order-service       →  creates the order
   payment-service     →  handles UPI / card payment          ⚠️ very sensitive
   delivery-service    →  assigns the delivery partner
   notification-service→  sends SMS and push notification
```

Whenever a new concept comes, we will apply it on FoodKart. That way it will stick in
your mind.

---

## Our running analogy — the apartment society

Most people understand networking better when we compare it with an apartment society
(a gated community). Please keep this picture in your mind:

| In the society | In Kubernetes |
|---|---|
| Individual flats | **Pods** (people keep shifting, flat numbers keep changing) |
| Flat directory board at entrance | **Service** (stable name, even if people change) |
| Main gate + one watchman | **Ingress + Ingress Controller** |
| A properly designed gate system with clear rules for builder / secretary / flat owner | **Gateway API** |
| A personal security guard attached to *every single person* inside the society | **Service Mesh (Istio)** |

Keep this in mind. Whole document will make sense.

---
---

# PART 1 — THE LOGIC (Why all this exists)

See, if you simply memorise the difference table, you will forget it in two days. But
if you understand *which problem came first and what was the solution*, then you can
derive the table yourself, anytime. So let us go step by step.

## 1.1 The problem chain

### Step 1: Pods keep dying

You deployed `payment-service` in Kubernetes. It has 3 pods with IPs
`10.4.1.5`, `10.4.1.6`, `10.4.1.7`.

Now `order-service` wants to call payment. So you hardcode the IP. Next day, one pod
crashed and restarted with a new IP `10.4.2.9`. Your order service is now calling a
dead IP. Order failed. Customer is angry.

**Problem:** Pod IPs are not permanent.

**Solution:** **Service** — a stable name (`payment-service`) and a stable virtual IP.
Kubernetes internally keeps track of which pods are alive.

> 🏠 **Analogy:** Instead of remembering "Ramesh lives in flat 402", you write on the
> directory board "Society Manager — Tower B". Whoever is the manager today, the board
> is same. You always go to the board.

---

### Step 2: Service is only for inside

Now our Service works nicely *inside* the cluster. But the customer is sitting outside,
on their mobile. How will they reach `frontend`?

First attempt — **NodePort**: Kubernetes opens a random high port like `31472` on every
node. So customer has to visit `http://13.234.55.12:31472`. Very ugly. Nobody will type
this. Also port range is limited (30000–32767).

Second attempt — **LoadBalancer**: Cloud provider gives you a real load balancer with a
proper IP. Good. But now the problem — **you need one load balancer per service**.
FoodKart has 6 services. If even 3 need external access, that is 3 cloud load balancers.
Each costs money every month. And that load balancer is dumb — it only understands
IP and port (Layer 4). It cannot understand "if URL is `/payment` send to payment
service".

**Problem:** Too costly, and no HTTP intelligence.

---

### Step 3: One smart entry point — Ingress

So the idea came — why not keep **one single load balancer** and put one smart proxy
behind it, which reads the HTTP request and decides where to send?

```
                              ┌──────────────────────────────┐
   customer  ──────────────▶  │  ONE Load Balancer + Proxy   │
   foodkart.com/menu          └──────────┬───────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             /menu → restaurant   /order → order      /pay → payment
```

This is **Ingress**. One IP, one certificate, many services behind it.

> 🏠 **Analogy:** Main gate of the society with one watchman. Visitor comes and says
> "I want Tower B, flat 402". Watchman directs them. You don't need a separate gate for
> every flat.

---

### Step 4: Ingress is too simple

Now business team comes and says: *"We have built a new version of restaurant-service.
Please send only 10% traffic to it. If it works fine, then we will send 100%."*

This is called **canary release**. Very normal requirement.

You open the Ingress YAML and... there is no field for it. Nothing. The Ingress
specification simply does not have traffic splitting.

So what did the vendors do? They added **annotations**:

```yaml
nginx.ingress.kubernetes.io/canary: "true"
nginx.ingress.kubernetes.io/canary-weight: "10"
```

It works. But now see the problem. Tomorrow your company decides to move from
NGINX to Traefik. All these annotations are useless — Traefik uses completely different
annotations. You have to rewrite every single YAML file. This is called
**annotation lock-in**, and this is the biggest pain of Ingress.

**Problem:** No portability. And also, everything is in one file — the person who
manages certificates and the developer who just wants `/menu` routing, both are editing
the *same* object. No separation.

---

### Step 5: Gateway API

Kubernetes SIG-Network people saw this pain for years. So they designed a new API from
scratch — **Gateway API**. Three main improvements:

1. All important features (weights, header matching, redirect) are **inside the spec
   itself**, not in annotations. So it is portable.
2. **Separate resources for separate people** — infra team, platform team, developer.
3. Proper support for gRPC, TCP, UDP as first-class.

> 🏠 **Analogy:** Now the society has a proper system. The **builder** decides which
> company's gate system to install. The **society secretary** decides gate timings and
> which towers can receive visitors. The **individual flat owner** decides who can come
> to their flat. Three different people, three different registers. Nobody is
> disturbing the other.

---

### Step 6: But everything so far is only the main gate

Now think carefully. This is the most important point in this entire document.

Ingress and Gateway API are both sitting at the **main gate**. Once the request enters
the cluster and reaches `order-service`, and then `order-service` calls
`payment-service` — **who is watching that call?**

**Nobody.**

That internal call is:
- ❌ Not encrypted (plain HTTP inside the cluster)
- ❌ Not authenticated (any pod can call payment-service; nobody is checking)
- ❌ Not measured (you have no idea what is the latency between order and payment)
- ❌ Not protected (if payment-service becomes slow, order-service will also hang)

> 🏠 **Analogy:** Your society has excellent main gate security. Watchman notes down
> every visitor. But once a person is *inside* the society, he can walk into any flat,
> any time. Nobody is checking. There is no CCTV inside. Nobody knows who went where.
>
> That is exactly your Kubernetes cluster today.

---

### Step 7: First attempt — do it in the application code

So developers said, fine, we will handle it in code. They used libraries:
Netflix Hystrix for circuit breaking, Ribbon for load balancing, and so on.

It worked. But new problem — FoodKart has services in **Java, Go, Python and Node.js**.
So now you need 4 different libraries. Each behaves slightly differently. And the day
you want to change the retry policy, you have to **modify code, rebuild, test and
redeploy all 6 services**. For a simple config change.

**Problem:** Polyglot pain and deployment pain.

---

### Step 8: Move it out of the application — Service Mesh

Then somebody had a brilliant idea:

> *"Why put this logic inside the application at all? Let us put one small proxy next
> to every pod. Application will simply call `payment-service` normally. The proxy will
> silently intercept it and do encryption, retry, metrics, everything."*

This proxy is called a **sidecar**. And the whole system — proxies + a brain that
configures them — is called a **Service Mesh**. Istio is the most popular one.

> 🏠 **Analogy:** Instead of teaching every resident how to check ID cards, the society
> gives **one personal security guard to every single person**. Wherever you go inside
> the society, your guard walks with you. He checks the other person's ID, he keeps a
> record of the meeting, and he makes sure the conversation is private.
>
> The residents don't have to learn anything. The guards handle everything.

---

### Step 9: But sidecars are heavy

One Envoy proxy per pod means roughly 50–100 MB RAM and some CPU **per pod**. If you
have 500 pods, that is a lot. Also, to add or upgrade a sidecar, you must **restart the
pod**.

**Solution:** Istio's **Ambient mode** — instead of one guard per person, keep **one
security post per floor** (`ztunnel`, one per node). It handles ID checking and
encryption for everyone on that floor. And if some particular department needs deeper
checking (Layer 7 rules), only then you put a special officer for that department
(`waypoint` proxy).

Much cheaper. No pod restart needed.

---

## 1.2 The complete chain — one picture

```
 PROBLEM                             SOLUTION                       NEW PROBLEM
 ──────────────────────────────────────────────────────────────────────────────
 Pod IPs keep changing           →   Service                    →   Only inside
                                                                    cluster

 Need outside access             →   NodePort / LoadBalancer    →   Costly, dumb L4

 Want one smart entry point      →   Ingress                    →   Spec too thin,
                                                                    annotation hell

 Need portability + team roles   →   Gateway API                →   Still only main
                                                                    gate

 Inside cluster: no encryption,  →   Code libraries             →   Polyglot pain,
 no identity, no metrics             (Hystrix, Ribbon)               redeploy pain

 Move it out of the app          →   SERVICE MESH (Istio)       →   Heavy, complex

 Sidecar too heavy               →   Ambient mode               →   Newer, L7 only
                                     (ztunnel + waypoint)            where waypoint
```

**Please read this table twice.** Every difference discussed later in this document is
simply a result of this chain.

---

## 1.3 The one line you must never forget

```
        NORTH-SOUTH                             EAST-WEST
   (traffic coming INTO cluster)      (traffic BETWEEN your services)
   ─────────────────────────────      ────────────────────────────────
   Ingress          ✅ Yes             Ingress          ❌ No
   Gateway API      ✅ Yes             Gateway API      ⚠️ Only via GAMMA
   Istio            ✅ Yes             Istio            ✅ Yes  ← THE POINT
```

> **Ingress controller is the watchman at the main gate.
> Service mesh is security inside every corridor of the building.**

🔹 **FoodKart example:**
- Customer's mobile → `frontend` = **north-south** (Ingress can handle)
- `order-service` → `payment-service` = **east-west** (only Istio can handle)

---

## 1.4 One very common confusion — please clear it now

Many people ask: *"Sir, should we use Gateway API or Istio?"*

This question itself is wrong. It is like asking *"should I use the recipe or the cook?"*

- **Gateway API is a specification.** It is just some YAML definitions sitting in the
  cluster. By itself it does absolutely nothing.
- **Istio is an implementation.** It is a real program that reads those YAML files and
  configures a real proxy.

```
   SPECIFICATION (what you write)      IMPLEMENTATION (what actually runs)
   ─────────────────────────────       ──────────────────────────────────────
   Ingress                        →    ingress-nginx, Traefik, HAProxy, ALB…
   Gateway API                    →    Istio, Envoy Gateway, Cilium, Contour,
                                       NGINX Gateway Fabric, Kong, GKE…
   Istio APIs (VirtualService…)   →    Only Istio
```

So the correct questions are:

1. **Which specification should we write?** → Gateway API, for any new work.
2. **Which implementation should run it?** → Istio, *if* we also want a mesh.
3. **Do we need east-west control at all?** → This is the real Istio decision.

> 🏠 **Analogy:** Gateway API is the *design standard* for the society gate, published
> by the government. Istio is one *company* that manufactures and installs gates
> according to that standard. Godrej, Tata, others also make gates to the same standard.
> You are not choosing between "the standard" and "Godrej" — you choose the standard,
> then choose the manufacturer.

---
---

# PART 2 — THE THREE LAYERS IN DETAIL

## 2.1 Ingress — the original one

**What it is:** `networking.k8s.io/v1`. Built into Kubernetes itself. Stable since 2020.
And very important — it is **frozen**. Kubernetes team has decided they will not add
any new feature to it. Whatever is there today, that is final.

### Let us see actual YAML for FoodKart

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: foodkart
  annotations:
    # See how many annotations are needed for simple things
    nginx.ingress.kubernetes.io/rewrite-target: /$1
    nginx.ingress.kubernetes.io/proxy-body-size: 20m
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"     # ← the whole problem
spec:
  ingressClassName: nginx
  tls:
    - hosts: [foodkart.com]
      secretName: foodkart-tls
  rules:
    - host: foodkart.com
      http:
        paths:
          - path: /menu
            pathType: Prefix
            backend:
              service: { name: restaurant-service, port: { number: 8080 } }
          - path: /order
            pathType: Prefix
            backend:
              service: { name: order-service, port: { number: 8080 } }
```

**What is good about it:** Everybody knows it. One single object. Every tutorial on
the internet uses it. Learning time — one hour. Honestly, for many companies this is
completely sufficient.

### The five real problems (with examples)

**Problem 1 — Annotation lock-in**

Your entire canary logic is written as `nginx.ingress.kubernetes.io/...`. Now suppose
your company decides to move to Traefik (maybe for cost, maybe for features). Traefik
does not understand even one of these annotations. You have to find every YAML file in
every repository and rewrite it.

🔹 **Example:** FoodKart has 6 services × 3 environments = 18 Ingress files. Each has
4–5 annotations. That is 80+ lines to rewrite and re-test. For a change that gives zero
business value.

---

**Problem 2 — No advanced matching**

Business team says: *"Our internal QA team should get the new version. Their app sends
a header `x-user-type: internal`. Please route based on that."*

In Ingress — **not possible.** There is no header matching in the spec. Full stop.

🔹 **Example:** You cannot do "if header `x-app-version` is `2.0`, send to new backend".
Very basic requirement, and Ingress simply cannot do it.

---

**Problem 3 — No native traffic splitting**

Already explained. Canary needs vendor annotations, or you install a separate tool like
Flagger or Argo Rollouts.

---

**Problem 4 — No separation between teams (this is the deepest problem)**

Look at that YAML above once more. In **one single file** you have:

- `tls.secretName` → this is a **security/platform team** concern
- `ingressClassName` → **platform team** concern
- `paths` and `backend` → **application developer** concern

All in one object. So if you give a developer permission to edit their routing, you are
also giving them permission to change the TLS certificate of the whole domain. There is
**no way to separate** it, because Kubernetes RBAC works at object level, not field
level.

🔹 **Example:** FoodKart's payment team wants to add a `/refund` path. To do that, they
need edit access on the Ingress object. But that same object controls `foodkart.com`
TLS certificate. Now your security auditor is unhappy. And rightly so.

---

**Problem 5 — HTTP-centric**

gRPC works but needs annotations. TCP and UDP need a completely separate ConfigMap in
ingress-nginx. Not clean at all.

🔹 **Example:** Your `notification-service` uses gRPC streaming. Getting it working
through Ingress is a full day of annotation hunting on GitHub issues.

### Verdict on Ingress

**Do not hate it.** If your requirement is "expose 3 services over HTTPS with host and
path routing" — Ingress is perfect. Simple, stable, everybody knows it. Do not
over-engineer.

---

## 2.2 Gateway API — the improved design

**What it is:** `gateway.networking.k8s.io`. These are **CRDs** — meaning they are NOT
built into Kubernetes. You have to install them separately with one `kubectl apply`.
It became **GA (version 1.0) in October 2023**. This is the official successor of
Ingress.

### The three design principles

1. **Role-oriented** — different resources for different job roles
2. **Portable** — features are in the spec, not in annotations
3. **Expressive** — header matching, weights, redirects all built in

### The resource model — who owns what

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │ WHO                    RESOURCE           WHAT THEY DECIDE           │
   ├──────────────────────────────────────────────────────────────────────┤
   │ Infra provider     │  GatewayClass    │  "Which company's gateway?   │
   │ (Istio / cloud)    │                  │   Istio? Envoy Gateway?"     │
   ├────────────────────┼──────────────────┼──────────────────────────────┤
   │ Platform team      │  Gateway         │  "Which ports? Which TLS     │
   │ (cluster admin)    │                  │   certificate? Which teams   │
   │                    │                  │   are allowed to attach?"    │
   ├────────────────────┼──────────────────┼──────────────────────────────┤
   │ Application        │  HTTPRoute       │  "Send /menu to my service,  │
   │ developer          │  GRPCRoute       │   split 90/10, add header"   │
   ├────────────────────┼──────────────────┼──────────────────────────────┤
   │ Namespace owner    │  ReferenceGrant  │  "Yes, that other namespace  │
   │                    │                  │   is allowed to point at me" │
   └──────────────────────────────────────────────────────────────────────┘
```

> 🏠 **Analogy:** In the society —
> - **GatewayClass** = the builder decides "we will install Godrej gate system"
> - **Gateway** = society secretary decides "gate opens 6 AM to 11 PM, and only
>   Tower A and Tower B can receive visitors"
> - **HTTPRoute** = flat owner decides "my guests should be sent to 4th floor lift"
> - **ReferenceGrant** = the neighbour says "yes, Tower A watchman can send people to me"
>
> Four different people, four different registers. Nobody can touch the other's register.

### Now let us write it for FoodKart

```yaml
# ══════════════════════════════════════════════════════════════════════
#  PLATFORM TEAM owns this file. Lives in 'infra' namespace.
#  Developers do NOT have edit access here.
# ══════════════════════════════════════════════════════════════════════
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: foodkart-edge
  namespace: infra
spec:
  gatewayClassName: istio           # ← Istio will implement this gateway
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.foodkart.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: foodkart-wildcard-tls
      allowedRoutes:
        namespaces:
          from: Selector            # ← THIS is the RBAC boundary, inside the API itself
          selector:
            matchLabels:
              gateway-access: "true"
```

```yaml
# ══════════════════════════════════════════════════════════════════════
#  RESTAURANT TEAM owns this file. Lives in THEIR OWN namespace.
#  They cannot touch the TLS certificate. They cannot change ports.
#  They can only decide their own routing. Perfect separation.
# ══════════════════════════════════════════════════════════════════════
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: restaurant
  namespace: restaurant
spec:
  parentRefs:
    - name: foodkart-edge
      namespace: infra
  hostnames: ["foodkart.com"]
  rules:
    # ── Rule 1: QA team gets new version. Simply not possible in Ingress. ──
    - matches:
        - path: { type: PathPrefix, value: /menu }
          headers:
            - { name: x-user-type, value: internal }
      backendRefs:
        - { name: restaurant-service-v2, port: 8080 }

    # ── Rule 2: Everybody else — 90/10 canary. Native. Portable. ──
    - matches:
        - path: { type: PathPrefix, value: /menu }
      backendRefs:
        - { name: restaurant-service-v1, port: 8080, weight: 90 }
        - { name: restaurant-service-v2, port: 8080, weight: 10 }
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add: [{ name: x-env, value: prod }]
```

**Notice one thing carefully:** Istio's name appears in exactly ONE place —
`gatewayClassName: istio`. Change it to `envoy-gateway` and the same file works. That
is what portability means.

### Point-by-point: what Gateway API fixed

| Ingress problem | Gateway API solution |
|---|---|
| Annotation lock-in | Weight, header match, redirect, rewrite, mirror — all in the spec |
| No team separation | Split into GatewayClass / Gateway / HTTPRoute, each with own RBAC |
| Cross-namespace not safe | `allowedRoutes` (gateway agrees) **+** `ReferenceGrant` (backend agrees) — both sides must agree |
| Protocol via annotation | Proper types: `HTTPRoute`, `GRPCRoute`, `TLSRoute`, `TCPRoute`, `UDPRoute` |
| Status field useless | Detailed `status.conditions` — you can actually see *why* route was rejected |
| Only main gate, forever | **GAMMA** — same HTTPRoute can configure inside-cluster traffic also |

### GAMMA — please know this, it is important

**GAMMA** = *Gateway API for Mesh Management and Administration*.

Normally an `HTTPRoute` attaches to a `Gateway` (main gate). In GAMMA, the HTTPRoute
attaches to a **Service** instead. And then it controls **service-to-service** traffic.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payment-canary
  namespace: foodkart
spec:
  parentRefs:
    - name: payment-service      # ← a SERVICE, not a Gateway. This is the trick.
      kind: Service
      group: ""
  rules:
    - backendRefs:
        - { name: payment-v1, port: 8080, weight: 90 }
        - { name: payment-v2, port: 8080, weight: 10 }
```

🔹 **What this means for FoodKart:** `payment-service` has no public URL. Customer never
calls it directly. Only `order-service` calls it. So no ingress controller in the world
can canary it. But with GAMMA + Istio, you can send 10% of *internal* order→payment
traffic to the new version.

**This is the bridge between the ingress world and the mesh world.** Mesh support
reached the Standard channel in Gateway API v1.1.

### Honest disadvantages of Gateway API

- More objects to understand (3 instead of 1)
- CRDs must be installed and version-managed by you
- Standard channel vs Experimental channel confusion
- Some old tools and dashboards still expect Ingress

---

## 2.3 Istio — the service mesh

**What it is:** A **control plane** (`istiod`) which configures a fleet of proxies, so
that **every single request** — coming in, going out, and going sideways — is
intercepted, encrypted, authenticated, retried, measured and controlled. And all this
**without touching your application code even once**.

Istio is a CNCF **graduated** project (since July 2023) — meaning it is mature and
production-proven.

### Picture the difference

```
   WITHOUT MESH (Ingress only)              WITH ISTIO
   ───────────────────────────              ──────────

   customer                                 customer
      │                                        │
      ▼                                        ▼
   ┌────────┐                              ┌────────────┐
   │ NGINX  │ ← only proxy in the picture  │  gateway   │ ← Envoy
   └───┬────┘                              └─────┬──────┘
       │                                         │ mTLS 🔒
       ▼                                         ▼
   ┌─────────┐                          ┌──────────────────┐
   │ order   │                          │ [proxy] │ order  │
   └────┬────┘                          └────┬─────────────┘
        │ ⚠️ plain HTTP                      │ mTLS 🔒 + retry
        │ ⚠️ no identity check               │ + metrics + authz
        │ ⚠️ nobody measuring                ▼
        ▼                                ┌──────────────────┐
   ┌─────────┐                           │ [proxy] │payment │
   │ payment │                           └──────────────────┘
   └─────────┘                                   ▲
                                                 │ xDS config
                                            ┌────┴─────┐
                                            │  istiod  │ ← the brain
                                            └──────────┘
```

### Architecture — explained simply

**The brain: `istiod`** (one single binary)

What does it do? Four jobs:

1. **Watches** the Kubernetes API — which Services exist, which pods are ready, what
   Istio/Gateway API YAML did you write.
2. **Translates** all that into **Envoy configuration** and pushes it to every proxy
   over gRPC. This protocol is called **xDS**.
3. **Acts as Certificate Authority (CA)** — issues an identity certificate to every
   workload and rotates it automatically.
4. **Injects the sidecar** — using a Kubernetes mutating admission webhook.

> 🏠 **Analogy:** `istiod` is the **security control room** of the society. It knows who
> lives where, it issues ID cards to everyone, it renews them, and it radios
> instructions to every guard.

**The muscle: the data plane** — two options available

| | **Sidecar mode** (classic) | **Ambient mode** (GA since Istio 1.24) |
|---|---|---|
| What runs | One Envoy container **inside every pod** | **ztunnel** — one per node (Layer 4) + optional **waypoint** Envoy per namespace (Layer 7) |
| How traffic is captured | iptables rules set by an init container | Node-level redirection, pod is untouched |
| To enable it | **Pod restart required** | No restart. Just label the namespace |
| Cost | ~50–100 MB RAM + CPU **per pod** | Much lower. You pay for L7 only where you add waypoint |
| Features | Full Layer 7 everywhere | L4 + mTLS everywhere; L7 only behind waypoint |
| Choose when | You need L7 policy on everything | Large clusters, cost pressure, cannot restart pods |

> 🏠 **Analogy:**
> **Sidecar** = personal bodyguard for every single person. Very thorough, but you need
> 500 bodyguards for 500 people, and each person must go home and come back to get one.
>
> **Ambient** = one security post per floor. Checks everyone's ID and keeps the
> conversation private, at much lower cost. If one particular department (say Finance)
> needs deeper checking — reading documents, checking purpose of visit — then you post
> one special officer there. That special officer is the **waypoint**.

### Istio's three families of API

```
  networking.istio.io  →  Gateway, VirtualService, DestinationRule,
                          ServiceEntry, WorkloadEntry, Sidecar, EnvoyFilter
                          (routing and traffic behaviour)

  security.istio.io    →  PeerAuthentication, RequestAuthentication,
                          AuthorizationPolicy
                          (who can talk to whom, and is it encrypted)

  telemetry.istio.io   →  Telemetry
                          (metrics, tracing, access logs)
```

**And very important:** Istio also implements **Kubernetes Ingress and Gateway API**.
For new setups, **Gateway API is now the recommended way** to configure Istio ingress.
The old `Gateway` + `VirtualService` combination is still fully supported and is still
more powerful in some places.

---
---

# PART 3 — WHAT IS SAME, WHAT IS DIFFERENT

This is the section people mostly want. But please read Part 1 first, otherwise this
will become memorisation.

## 3.1 What is SAME in all three

Many people think these are completely different worlds. Actually they share a lot.

| # | Same thing | Explanation |
|---|---|---|
| 1 | **All are Kubernetes-native and declarative** | You write YAML saying "this is what I want". A controller keeps making reality match it. No `reload` command anywhere. |
| 2 | **All are only APIs until a controller runs** | `Ingress`, `HTTPRoute`, `VirtualService` — all are just data sitting in etcd. Some program must watch and act on it. |
| 3 | **All need a proxy underneath** | NGINX, HAProxy, Envoy or eBPF. Your YAML is only a friendly front-end for proxy configuration. Nothing more. |
| 4 | **All send traffic to a Kubernetes `Service`** | The backend concept is exactly identical in all three. |
| 5 | **All terminate TLS using cluster `Secret`s** | Same certificates, same cert-manager workflow, no difference. |
| 6 | **All use a "class" to select implementation** | `ingressClassName` ↔ `gatewayClassName` ↔ Istio's gateway selector. Same idea. |
| 7 | **All do host + path routing** | The core routing feature is genuinely the same in all three. |
| 8 | **All follow watch → diff → configure → write status** | Standard Kubernetes controller pattern everywhere. |
| 9 | **All support canary in some form** | Ingress by annotation, Gateway API by `weight`, Istio by `weight`. Same idea, very different comfort level. |
| 10 | **All three overlap at the main gate** | Istio's ingress gateway **is** an ingress controller. For one hostname you will use **one** of them, not all three. |

### The honest summary

> If your requirement is only *"expose `foodkart.com/menu` on HTTPS and send it to
> restaurant-service"* — then **all three do exactly the same work**, and your customer
> cannot tell any difference. Everything below is about what happens **beyond** this
> point.

Please say this in an interview. It shows you have actually run these things, not just
read a blog.

---

## 3.2 What is DIFFERENT — the master table

| Dimension | Ingress | Gateway API | **Istio** |
|---|---|---|---|
| **What is it** | Built-in K8s API | K8s CRDs (a specification) | A full mesh platform (an implementation) |
| **Status** | Stable but **frozen** | GA v1.0, actively growing | CNCF graduated |
| **Traffic covered** | North-south only | North-south (+ east-west via GAMMA) | **North-south + east-west + egress** |
| **Where proxy sits** | Few pods at the edge | Few pods at the edge | **Every pod (sidecar) or every node (ztunnel)** |
| **Team separation** | ❌ one object for all | ✅ split by role | ✅ split, plus mesh-wide policy |
| **Portability** | ❌ annotation lock-in | ✅ fully portable | ⚠️ Istio CRDs are Istio-only (but it speaks Gateway API) |
| **Header / method routing** | annotation | ✅ native | ✅ native |
| **Weighted traffic split** | annotation | ✅ native | ✅ native, **anywhere in the mesh** |
| **Retry / timeout** | annotation | partial | ✅ full control per route |
| **Circuit breaking** | ❌ | ❌ | ✅ `DestinationRule` |
| **Fault injection (chaos)** | ❌ | ❌ | ✅ delay and abort by percentage |
| **Traffic mirroring** | ❌ | ✅ filter | ✅ with percentage control |
| **Workload identity** | ❌ (only IP-based) | ❌ | ✅ **SPIFFE certificate per workload** |
| **Encryption inside cluster** | ❌ | ❌ | ✅ **automatic mTLS, auto-rotating** |
| **Service-to-service authorization** | ❌ | ❌ | ✅ `AuthorizationPolicy` on identity + L7 |
| **JWT validation** | vendor plugin | ❌ | ✅ `RequestAuthentication` |
| **Metrics for every hop** | only at edge | only at edge | ✅ **every hop, zero code change** |
| **Distributed tracing** | one span at edge | one span at edge | ✅ full chain (app must forward headers) |
| **Outgoing (egress) control** | ❌ | ❌ | ✅ `ServiceEntry` + egress gateway |
| **Multi-cluster** | per cluster only | per cluster only | ✅ one single logical mesh, with failover |
| **VMs / non-Kubernetes** | ❌ | ❌ | ✅ `WorkloadEntry` |
| **Extensibility** | Lua / annotations | fixed set of filters | ✅ `WasmPlugin`, `EnvoyFilter` |
| **Operational effort** | 🟢 Low | 🟡 Low–Medium | 🔴 **High — it is a commitment** |
| **Extra latency** | one hop | one hop | +2 hops (sidecar), +1 (ambient L4) |
| **Learning time** | few hours | few days | **few weeks to months** |

---

## 3.3 Same requirement, written in three ways

**Business requirement: send 10% of `/menu` traffic to the new version.**

```yaml
# ══ 1. INGRESS — works, but you are married to ingress-nginx forever ══
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
```

```yaml
# ══ 2. GATEWAY API — portable. Works on Istio, Envoy Gateway, Cilium, Contour ══
rules:
  - backendRefs:
      - { name: restaurant-v1, port: 8080, weight: 90 }
      - { name: restaurant-v2, port: 8080, weight: 10 }
```

```yaml
# ══ 3. ISTIO NATIVE — most powerful. But Istio-only. ══
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: restaurant }
spec:
  hosts: [restaurant-service]
  http:
    - route:
        - { destination: { host: restaurant-service, subset: v1 }, weight: 90 }
        - { destination: { host: restaurant-service, subset: v2 }, weight: 10 }
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: "5xx,connect-failure,refused-stream"
      timeout: 10s
      mirror: { host: restaurant-service, subset: v2 }   # send a COPY to v2
      mirrorPercentage: { value: 5 }
```

---

## 3.4 ⭐ The most important block in this document

Now let us see the things which **Ingress and Gateway API simply cannot do**. Not
"difficult" — literally impossible, because they do not sit in that path.

### Requirement 1: "Encrypt all internal traffic" — auditor's demand

Your PCI-DSS auditor asks: *"Is the traffic between order-service and payment-service
encrypted?"* Today, honestly, the answer is **no**. It is plain HTTP inside the cluster.

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: foodkart
spec:
  mtls:
    mode: STRICT        # ← that's it. All traffic in this namespace is now mTLS.
```

**Six lines.** No certificate management, no code change, no application restart logic.
istiod issues and rotates certificates for every workload automatically.

---

### Requirement 2: "Only order-service may charge a card"

Right now, any pod in your cluster — including a compromised one, including a debug pod
somebody forgot to delete — can call `payment-service`. Nobody is checking.

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payment-callers
  namespace: foodkart
spec:
  selector:
    matchLabels: { app: payment-service }
  action: ALLOW
  rules:
    - from:
        - source:
            # This is a CRYPTOGRAPHIC identity, not an IP address.
            # Even if attacker gets the IP, they cannot fake this.
            principals: ["cluster.local/ns/foodkart/sa/order-service"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/v1/charge"]
      when:
        - key: request.auth.claims[scope]
          values: ["payment:write"]
```

**Read it in plain English:** *"Only the order-service (proved by certificate), only
using POST, only on `/v1/charge`, and only if the user's token has `payment:write`
scope — is allowed. Everything else, reject."*

NetworkPolicy cannot do this. It only sees IP and port. It cannot see HTTP method, it
cannot see path, it cannot see JWT claims.

---

### Requirement 3: "One bad pod should not spoil everything"

Diwali sale. Heavy traffic. One `payment-service` pod has a memory leak and is
returning errors. But Kubernetes Service is round-robin — so it keeps sending 1/3rd of
your orders to that broken pod. Your p99 latency is destroyed. Customers are failing at
checkout.

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payment-service
  namespace: foodkart
spec:
  host: payment-service
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http:
        http2MaxRequests: 1000
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5      # 5 errors...
      interval: 30s                # ...within 30 seconds
      baseEjectionTime: 180s       # ...then remove that pod for 3 minutes
      maxEjectionPercent: 50       # but never remove more than half
```

Now that sick pod is automatically taken out of rotation. It gets a chance to recover.
Your customers never see it.

> 🏠 **Analogy:** In the society, one lift is behaving strangely — sometimes stopping
> between floors. The security system notices it after 5 complaints and **automatically
> stops sending people to that lift for 3 minutes**, while the technician checks it. But
> it will never shut down more than half the lifts, otherwise nobody can go anywhere.

---

> ### ⭐ This section IS the answer to "why Istio"
>
> Notice — **not a single one of these three was about routing.** Routing, everybody can
> do. Istio is adopted for **identity, encryption, policy and per-hop visibility**.
> If somebody tells you Istio is a "better ingress controller", they have not understood
> it.

---
---

# PART 4 — SHOULD WE USE ISTIO OR NOT?

## 4.1 The 12 things only Istio gives you

Arranged in the order in which companies actually adopt it (from my observation of real
adoption patterns, not from marketing material).

| # | Capability | Which real problem it solves |
|---|---|---|
| 1 | **Automatic mTLS everywhere** | Auditor asks "is internal traffic encrypted?" Today answer is no. With Istio it becomes yes, in six lines, with automatic certificate rotation. |
| 2 | **Workload identity (SPIFFE)** | NetworkPolicy says "10.4.2.7 can talk to 10.4.9.3". Istio says "`order-service` can talk to `payment-service`". Survives pod restart, IP change, even works across clusters. |
| 3 | **Layer-7 authorization** | Deny-by-default between services, with rules on HTTP method, path and JWT claims. Firewall and NetworkPolicy cannot see any of this. |
| 4 | **Golden signals free of cost** | Latency, traffic, errors, saturation for **every** service-to-service pair — without writing a single line of instrumentation code. |
| 5 | **East-west canary** | Canary an internal service like `payment-service` which has no public URL. Impossible with any ingress controller. |
| 6 | **Circuit breaking** | One sick pod automatically removed from rotation instead of spoiling your p99. |
| 7 | **Retries and timeouts as policy** | Same behaviour across your Java, Go, Python and Node services — instead of 4 libraries with 4 different defaults. |
| 8 | **Fault injection** | Test "what happens if payment-service is 5 seconds slow?" in staging, without writing any chaos code. |
| 9 | **Traffic mirroring** | Send a *copy* of real production traffic to v2 and compare results. Zero risk to customers, because the copy's response is thrown away. |
| 10 | **Egress control and visibility** | Know exactly which external APIs your cluster is calling. Very common audit requirement. |
| 11 | **Multi-cluster as one mesh** | Mumbai region and Chennai region behave as one mesh, with automatic failover if one region has a problem. |
| 12 | **VM / legacy integration** | Your old Oracle-connected Java app running on a VM can join the same identity and policy system. |

### Compressed into one sentence

> **Istio is not a better ingress controller. Istio is the layer which makes every
> internal call encrypted, identified, visible and controllable — which is exactly what
> an ingress controller structurally cannot see.**

---

## 4.2 When you should NOT use Istio

This section is more important than the previous one. Anybody can list features.
Knowing when *not* to use something is what shows real experience.

| Your situation | Why Istio is wrong | Do this instead |
|---|---|---|
| Less than 10–15 services | Complexity is far more than benefit | Ingress or Gateway API |
| One team, one application | There is no trust boundary to enforce | Gateway API |
| No dedicated platform/DevOps capacity | Mesh needs an owner — upgrades, revisions, Envoy debugging | Keep it simple |
| Very latency-sensitive (trading, real-time video) | Each extra proxy hop costs 1–3 ms | Ambient L4, Cilium, or no mesh |
| You only want canary at the edge | Huge overkill | Gateway API + Argo Rollouts / Flagger |
| You only want mTLS, nothing else | Simpler options exist | **Linkerd**, or Cilium encryption |
| Team cannot debug Envoy | `503 UC` and `503 NR` will finish you | Linkerd (much simpler) |

> **Simple thumb rule:** Adopt a mesh when *per-hop identity, encryption and telemetry
> can no longer be solved by libraries*. Practically this happens somewhere between
> **15 and 30 services** — or on the day a compliance auditor asks about encryption in
> transit. Whichever comes first.

🔹 **FoodKart example:** If FoodKart is a startup with 4 services and 3 engineers —
**do not use Istio.** Use Gateway API. You will spend more time debugging Istio than
building features. But when FoodKart has 40 services, 6 teams, and is processing real
payments — then Istio's mTLS and authorization become genuinely valuable.

---

## 4.3 Istio vs other service meshes

| | **Istio** | **Linkerd** | **Cilium Mesh** | **Consul** |
|---|---|---|---|---|
| Proxy used | Envoy (sidecar) / ztunnel (ambient) | Own small Rust proxy | eBPF + Envoy for L7 | Envoy |
| Complexity | High | **Lowest** | Medium | Medium–High |
| Features | **Most complete** | Deliberately minimal | Strong L3/L4, lighter L7 | Strong for mixed environments |
| Sidecar-free option | ✅ ambient mode | ❌ (but very light sidecar) | ✅ native | ❌ |
| Resource usage | Medium–High | **Low** | **Low** | Medium |
| Multi-cluster | ✅ excellent | ✅ good | ✅ cluster mesh | ✅ excellent |
| VM / non-K8s support | ✅ good | limited | limited | ✅ **best** |
| Community / job market | **Largest** | Medium | Growing fast | Medium |
| Choose when | You need everything and have a platform team | You want mTLS + metrics with minimum headache | You already use Cilium as CNI | You have VMs, Nomad, HashiCorp stack |

*(Note: AWS App Mesh has an announced end-of-support date — please do not start new work
on it.)*

---

## 4.4 Decision flow — just follow the arrows

```
  Do you need traffic to come INTO the cluster?
        │
        ├── No ──▶ You may still need mesh for east-west. Go below.
        │
        ▼ Yes
  Is simple host/path routing enough — forever?
        │
        ├── Yes ──▶  ✅ USE INGRESS CONTROLLER. Stop here. Don't over-engineer.
        │
        ▼ No (need canary / header routing / team separation)
  ┌────────────────────────────────────────────────────────────┐
  │  ✅ USE GATEWAY API — now choose an implementation          │
  └────────────────────────────────────────────────────────────┘
        │
        ▼
  Do you ALSO need any of these?
     • Encryption between internal services (compliance)?
     • Deny-by-default service-to-service authorization?
     • Metrics/tracing for every hop without code change?
     • Circuit breaking, internal canary, multi-cluster?
        │
        ├── No ──▶  ✅ Gateway API + a light implementation
        │            (Envoy Gateway / NGINX Gateway Fabric / Cilium)
        │
        ▼ Yes
  Do you have a platform team who can own upgrades and Envoy debugging?
        │
        ├── No ──▶  ⚠️ Use Linkerd (simpler), or wait till you have the team
        │
        ▼ Yes
  ┌────────────────────────────────────────────────────────────┐
  │  ✅ USE ISTIO — set gatewayClassName: istio                 │
  │     One control plane for BOTH north-south and east-west   │
  │     Start with ambient if possible; sidecar if you need    │
  │     full L7 everywhere                                     │
  └────────────────────────────────────────────────────────────┘
```

---

## 4.5 The migration path which actually works

Please do not try to do everything in one weekend. It will fail, and then your
management will say "mesh is not for us" and the topic will be closed for two years.

```
  STEP 1  You are on Ingress today                    ← most clusters
             │  Same behaviour, better API. Very low risk.
             ▼
  STEP 2  Move to Gateway API (any implementation)    ← portable, team separation
             │  Now just change gatewayClassName: istio
             │  Ingress behaviour does not change at all.
             ▼
  STEP 3  Istio becomes your GatewayClass             ← north-south on Istio,
             │                                          mesh still OFF
             │  Now label ONE low-risk namespace. mTLS PERMISSIVE.
             ▼
  STEP 4  Enable mesh, ONE namespace at a time
             │  Watch the golden signals. Prove nothing broke.
             │  Only then take the next namespace.
             ▼
  STEP 5  PeerAuthentication STRICT
             │  then AuthorizationPolicy AUDIT
             │  then ALLOW policies
             │  then finally deny-all
```

**Each step gives value on its own, and each step can be rolled back on its own.**
Jumping directly to Step 5 on day one is exactly how mesh projects get abandoned.

---
---

# PART 5 — ISTIO SYLLABUS (topic by topic)

`[MUST]` = you cannot run Istio in production without this.
`[LATER]` = learn after you are comfortable.

## 5.1 Architecture and data plane `[MUST]`

**What to learn:**

- **istiod** — the single control plane binary. Config watching, xDS push, CA,
  sidecar injection webhook.

- **Envoy basics — only 4 concepts, please learn these properly:**

  | Envoy term | Meaning in simple words | FoodKart example |
  |---|---|---|
  | **Listener** | A port on which Envoy accepts connections | Port 8080 for incoming |
  | **Route** | "For this host and path, send to which cluster" | `/menu` → restaurant cluster |
  | **Cluster** | A logical destination (your Service + its policies) | `payment-service` with circuit breaker |
  | **Endpoint** | The actual pod IPs behind that cluster | 10.4.1.5, 10.4.1.6 |

  > **If you learn nothing else about Envoy, learn these four.** 90% of Istio debugging
  > is simply reading these four things with `istioctl proxy-config`.

- **xDS** — the gRPC protocol which pushes config from istiod to proxies.
  LDS (listeners), RDS (routes), CDS (clusters), EDS (endpoints).

- **Sidecar injection** — the `istio-injection=enabled` label, or `istio.io/rev`.
  Mutating webhook rewrites your pod spec at creation time. Also learn the difference
  between the `istio-init` iptables container and the **Istio CNI plugin** (CNI plugin
  avoids giving `NET_ADMIN` capability to your app pods — security teams like this).

- **Ambient mode** — `ztunnel` (per node, L4 + mTLS, uses HBONE tunnel) and `waypoint`
  (optional, per namespace or per service, for L7).

- **Mesh boundary** — `Sidecar` resource (to limit config), `ServiceEntry` (for
  external services), `WorkloadEntry` (for VMs).

---

## 5.2 Traffic management `[MUST]`

- **`Gateway`** — Gateway API version (use this for new work) vs Istio's own version.

- **`VirtualService`** — this is the **routing brain**. Learn all of these:
  - `match` — on uri, header, method, query params, sourceLabels
  - weighted `route`
  - `rewrite` and `redirect`
  - `mirror` + `mirrorPercentage`
  - `timeout`, `retries`, `fault`, `corsPolicy`, `delegate`

- **`DestinationRule`** — this is the **destination policy brain**.
  ⚠️ **Very important: you still need this even if you route with Gateway API.**
  - `subsets` — defines v1, v2 using pod labels. **VirtualService cannot use a subset
    unless DestinationRule defines it first.**
  - `loadBalancer` — ROUND_ROBIN, LEAST_REQUEST, consistent hash (for session affinity)
  - `connectionPool` — max connections, pending requests, requests per connection
  - `outlierDetection` — **this is circuit breaking**
  - `tls` — mTLS mode towards this particular destination

- **`ServiceEntry`** — to bring external services into the mesh.
  🔹 *FoodKart example:* You call Razorpay's API from `payment-service`. Without
  ServiceEntry, Istio treats it as unknown traffic — no metrics, no control. With
  ServiceEntry, you get metrics, timeout and retry on that external call also.

- **Locality-aware load balancing** — prefer pods in the same zone, failover to another
  zone only when needed. Saves cross-AZ data transfer cost also.

- **Ingress patterns** — TLS terminate vs passthrough, SNI routing, re-encryption.

> ⚠️ **Very common mistake:** The `Gateway` selects a gateway deployment. The
> `VirtualService` must (a) list that Gateway in `spec.gateways` AND (b) match the host.
> If either one is wrong, you get a **404 with no error message anywhere**. You will
> waste 2 hours. Please remember this.

---

## 5.3 Security `[MUST]`

- **Identity** — SPIFFE ID format:
  ```
  spiffe://cluster.local/ns/foodkart/sa/order-service
           └─ trust    └─ namespace  └─ service account
              domain
  ```
  This is issued as an X.509 certificate by istiod, rotated automatically (default
  around 24 hours).

  > 🏠 **Analogy:** This is like Aadhaar for your services. It is not "flat 402" (which
  > is an IP and can change) — it is the actual verified identity of the person.

- **`PeerAuthentication`** — controls mTLS:

  | Mode | Meaning | When to use |
  |---|---|---|
  | `PERMISSIVE` | Accept both plain and mTLS | **Migration period.** Always start here. |
  | `STRICT` | Only mTLS, reject plain | **Target state.** Go here after verifying. |
  | `DISABLE` | mTLS off | Rarely, for specific exceptions |

  Precedence: **workload > namespace > mesh-wide**. So a workload-level policy overrides
  the namespace one.

- **`RequestAuthentication`** — validates end-user JWT (issuer, JWKS URL).

  > ⚠️ **Very important trap:** This resource alone **does not reject** a request which
  > has NO token. It only validates a token if one is present. To actually *require* a
  > token, you must add an `AuthorizationPolicy` which requires `requestPrincipals`.
  > Many people get this wrong and think their API is protected when it is not.

- **`AuthorizationPolicy`** — actions: `ALLOW`, `DENY`, `AUDIT`, `CUSTOM`.
  - Evaluation order: **CUSTOM → DENY → ALLOW**
  - Deny-by-default pattern (please remember this exactly):
    ```yaml
    apiVersion: security.istio.io/v1
    kind: AuthorizationPolicy
    metadata: { name: deny-all, namespace: foodkart }
    spec: {}      # empty spec = select everything, allow nothing
    ```
    Then add explicit ALLOW policies one by one for each service.

- **Correct rollout order for zero-trust** (do not skip steps):
  ```
  PERMISSIVE → observe for a week → STRICT → AUDIT policies →
  ALLOW policies → finally deny-all
  ```

- **CA options** — istiod self-signed (fine for dev), plugged intermediate CA from your
  company PKI, or external CA via cert-manager `istio-csr` (for production).

---

## 5.4 Observability `[MUST]`

- **Standard metrics** every proxy emits automatically:
  `istio_requests_total`, `istio_request_duration_milliseconds`, `istio_request_bytes`
  — all with labels for source workload, destination workload, namespace, response code.

  🔹 *FoodKart example:* Without writing any code, you can immediately answer: "what is
  the p99 latency of order-service calling payment-service?" That metric exists because
  the proxy measured it.

- **The `Telemetry` API** (`telemetry.istio.io`) — this is the **modern** way to
  configure metrics, tracing and access logs. It replaced the old Mixer component and
  most `EnvoyFilter` telemetry tricks. Many old blogs still show the old way — ignore
  them.

- **Prometheus + Grafana** for dashboards. **Kiali** for the live service graph — this
  is the best demo to show your manager, because they can literally *see* the traffic
  flowing.

- **Distributed tracing** (Jaeger / Tempo / Zipkin / OpenTelemetry).

  > ⚠️ **Very important, everybody gets surprised by this once:** Istio creates the
  > spans, but **your application must forward the trace headers** (`traceparent`, or
  > `x-request-id` and `x-b3-*`) from the incoming request to the outgoing request. If
  > your app does not do this, you will get disconnected single-hop spans, not a
  > complete trace. **The mesh cannot fix this for you** — it does not know which
  > incoming request caused which outgoing request.

- **Access logs** — format, per-workload enable/disable, and sampling. Please think
  about cost. 100% tracing + 100% access logs on high traffic will cost you more than
  the mesh itself.

---

## 5.5 Operations `[MUST]`

- **Installation methods:**
  - `istioctl install` — fastest, good for learning
  - **Helm charts** (`base`, `istiod`, `gateway`, `cni`, `ztunnel`) — recommended for
    production and GitOps
  - The old in-cluster **operator controller has been removed** in current versions.
    Do not follow old blogs which tell you to use it.

- **Profiles:** `default`, `minimal`, `ambient`, `demo`, `empty`.
  > ⚠️ **`demo` profile is only for learning.** It enables 100% trace sampling and
  > verbose telemetry. Never use it in production.

- **Revisions and canary upgrade — this is THE most important operational skill:**

  ```
  1. Install second control plane with a new revision
  2. Move namespaces to it using the istio.io/rev label
  3. Restart the workloads
  4. Verify with istioctl proxy-status
  5. Only then remove the old revision
  ```
  Use **revision tags** (like `prod-stable`) so that your application namespaces never
  hard-code a version number.

  > ⚠️ **Never upgrade the control plane in-place in production.** This is the single
  > biggest cause of Istio outages.

- **Sizing and the `Sidecar` resource** — By default, **every proxy receives config for
  every service in the entire mesh**. If you have 300 services and 800 pods, that is a
  huge amount of config pushed everywhere. Scoping with a `Sidecar` resource
  (`egress.hosts`) is **the number one scaling lever** in Istio. Memory usage can drop
  dramatically.

  🔹 *FoodKart example:* `notification-service` only talks to an SMS gateway. It does
  not need config for the other 40 services. A `Sidecar` resource limiting it saves
  memory on every one of its pods.

- Certificate lifecycle and root certificate rotation.
- Resource requests/limits and Envoy `concurrency` tuning.

---

## 5.6 Troubleshooting `[MUST]`

Full playbook is in **Part 7**. But please memorise these four commands:

```bash
istioctl analyze                    # Is my configuration valid?
istioctl proxy-status               # Did the config actually reach the proxies?
istioctl proxy-config <type> <pod>  # What config does Envoy REALLY have?
istioctl x describe pod <pod>       # Explain in simple English what applies here
```

---

## 5.7 Advanced topics `[LATER]`

- **Multi-cluster** — primary-remote vs multi-primary, single vs multi network,
  east-west gateways, cross-cluster service discovery, failover priority.
- **Extensibility** — `WasmPlugin` (the supported way) vs `EnvoyFilter` (very powerful
  but very brittle — it targets Envoy internals and can break on *any* Istio upgrade;
  treat it as last resort only).
- **Mesh expansion** to VMs and bare-metal servers.
- **Performance** — measure the real latency cost with your own payload size. Do not
  trust numbers from blogs.
- **Istio CNI plugin** — removes the need for `NET_ADMIN` on application pods.
- **Gateway API Inference Extension** — newer work for routing AI/LLM workloads
  (model-aware and load-aware routing). Good to know it exists.

---
---

# PART 6 — PRACTICAL LABS

**Please actually type these.** Reading will give you 30% understanding. Typing and
breaking things will give you 90%. Total time roughly 6–8 hours.

## Lab 0 — Set up cluster and install Istio (20 min)

```bash
# ── 1. Create a local cluster with enough capacity ──
kind create cluster --name mesh --config - <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF

# ── 2. Download istioctl ──
curl -L https://istio.io/downloadIstio | sh -
cd istio-*/ && export PATH=$PWD/bin:$PATH
istioctl version

# ── 3. Check whether cluster is ready, then install ──
istioctl x precheck
istioctl install --set profile=demo -y

# ── 4. Install the addons (Prometheus, Grafana, Jaeger, Kiali) ──
kubectl apply -f samples/addons/
kubectl -n istio-system rollout status deploy/kiali

# ── 5. Verify ──
kubectl -n istio-system get pods
istioctl verify-install
```

✅ **Checkpoint:** `istiod` and `istio-ingressgateway` pods should be Running.

---

## Lab 1 — Put an application into the mesh (15 min)

We will use Istio's own sample app called Bookinfo (same idea as our FoodKart —
multiple microservices calling each other).

```bash
kubectl create namespace bookinfo
kubectl label namespace bookinfo istio-injection=enabled   # ← this one label is the magic
kubectl -n bookinfo apply -f samples/bookinfo/platform/kube/bookinfo.yaml

kubectl -n bookinfo get pods
```

👀 **Look carefully at the READY column.** It says **2/2**, not 1/1.

Why 2? Because the second container is the Envoy sidecar which Istio injected.

```bash
# Let us prove it
kubectl -n bookinfo get pod -l app=productpage \
  -o jsonpath='{.items[0].spec.containers[*].name}'
# Output: productpage istio-proxy
```

💡 **Understand what just happened:** You did **not** change the application code. You
did **not** change the Docker image. You did **not** change the Deployment YAML. A
mutating admission webhook silently added a container when the pod was being created.

🧪 **Try this:** Remove the label (`kubectl label ns bookinfo istio-injection-`), restart
the deployment, and see it go back to 1/1.

---

## Lab 2 — Feel the pain of Ingress yourself (20 min)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Now expose `productpage` using a normal `Ingress`. Then try to send 10% traffic to a
second version **without using any vendor annotation**.

**You will not be able to do it.** 

That failure is the entire reason Gateway API was created. Please sit with this failure
for two minutes. After this, everything in the next labs will feel obvious.

---

## Lab 3 — Gateway API with Istio (30 min)

```bash
# Gateway API CRDs are NOT part of Kubernetes. Install separately.
kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1 || \
  kubectl apply -k "github.com/kubernetes-sigs/gateway-api/config/crd/standard?ref=v1.2.0"
```

```yaml
# gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: bookinfo-gw
  namespace: bookinfo
spec:
  gatewayClassName: istio        # ← Istio will create the Envoy deployment automatically
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces: { from: Same }
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: bookinfo
  namespace: bookinfo
spec:
  parentRefs: [{ name: bookinfo-gw }]
  rules:
    - matches:
        - path: { type: PathPrefix, value: /productpage }
        - path: { type: PathPrefix, value: /static }
      backendRefs:
        - { name: productpage, port: 9080 }
```

```bash
kubectl apply -f gateway.yaml

kubectl -n bookinfo get gateway bookinfo-gw     # PROGRAMMED column should say True
kubectl -n bookinfo get deploy                  # 👀 see the auto-created gateway deployment

kubectl -n bookinfo port-forward svc/bookinfo-gw-istio 8080:80
# Now open http://localhost:8080/productpage in browser
```

💡 **Understand:** You wrote **standard Kubernetes YAML**. Istio's name appeared in
exactly one line — `gatewayClassName`. Change it to `envoy-gateway` and the same file
will work there. **That is portability.** This is what Ingress could never give you.

---

## Lab 4 — Canary: first by weight, then by header (30 min)

```yaml
# ⚠️ FIRST define subsets. VirtualService cannot use a subset which is not defined here.
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata: { name: reviews, namespace: bookinfo }
spec:
  host: reviews
  subsets:
    - { name: v1, labels: { version: v1 } }
    - { name: v2, labels: { version: v2 } }
    - { name: v3, labels: { version: v3 } }
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: reviews, namespace: bookinfo }
spec:
  hosts: [reviews]
  http:
    # ⚠️ ORDER MATTERS. First matching rule wins.
    # So always put the SPECIFIC rule first, general rule last.
    - match:
        - headers:
            end-user: { exact: jason }
      route: [{ destination: { host: reviews, subset: v2 } }]

    - route:
        - { destination: { host: reviews, subset: v1 }, weight: 90 }
        - { destination: { host: reviews, subset: v3 }, weight: 10 }
```

🧪 **Practice:**
1. Refresh the page 20 times → roughly 2 times out of 20 you will see red stars (v3).
   That is your 10% canary working.
2. Now login as user `jason` → you will get v2 **every single time**, deterministically.

💡 **Understand:** `reviews` is an **internal service**. It has no public URL. The
customer never calls it directly. **No ingress controller in the world can canary this.**
This is east-west routing — and this is exactly why mesh exists.

---

## Lab 5 — Turn on mTLS (30 min)

```bash
# See the certificates which Istio already issued, without you doing anything
istioctl proxy-config secret deploy/productpage -n bookinfo
```

```bash
# Now make it compulsory
kubectl apply -f - <<'EOF'
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata: { name: default, namespace: bookinfo }
spec:
  mtls: { mode: STRICT }
EOF
```

```bash
# 🧪 Now prove it. Create a pod OUTSIDE the mesh and try to call in.
kubectl create ns nomesh
kubectl -n nomesh run probe --image=curlimages/curl -it --rm -- \
  curl -sS -m 5 http://productpage.bookinfo:9080/productpage

# Result: connection reset.
# Why? Because that pod has no certificate, so it has no identity,
# so the receiving proxy refuses to talk to it.
```

💡 **Understand:** You did not create even one certificate. You did not configure a CA.
istiod issued a SPIFFE identity to every workload and is rotating it automatically in
the background.

---

## Lab 6 — Zero-trust authorization (30 min)

```yaml
# ── STEP 1: Block everything in the namespace ──
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: deny-all, namespace: bookinfo }
spec: {}
```

🧪 Apply only this and refresh the page → **everything gives 403**. Good. That is
deny-by-default.

```yaml
# ── STEP 2: Allow the gateway to reach productpage ──
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: productpage-viewer, namespace: bookinfo }
spec:
  selector: { matchLabels: { app: productpage } }
  action: ALLOW
  rules:
    - to: [{ operation: { methods: ["GET"] } }]
---
# ── STEP 3: Allow ONLY productpage's identity to call details ──
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata: { name: details-viewer, namespace: bookinfo }
spec:
  selector: { matchLabels: { app: details } }
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/bookinfo/sa/bookinfo-productpage"]
      to: [{ operation: { methods: ["GET"] } }]
```

🧪 **Practice:** Apply the policies **one at a time** and refresh after each. You will
literally see the page healing section by section. This is the best way to feel how
zero-trust works.

---

## Lab 7 — Resilience and chaos (30 min)

```yaml
# ── Fault injection: make 50% of ratings calls slow by 5 seconds ──
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata: { name: ratings, namespace: bookinfo }
spec:
  hosts: [ratings]
  http:
    - fault:
        delay:
          percentage: { value: 50 }
          fixedDelay: 5s
      route: [{ destination: { host: ratings, subset: v1 } }]
---
# ── Circuit breaker: remove a pod after just 1 error, for 3 minutes ──
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata: { name: ratings-cb, namespace: bookinfo }
spec:
  host: ratings
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 1 }
      http:
        http1MaxPendingRequests: 1
        maxRequestsPerConnection: 1
    outlierDetection:
      consecutive5xxErrors: 1
      interval: 1s
      baseEjectionTime: 3m
      maxEjectionPercent: 100
```

```bash
# Generate load and watch the circuit breaker trip
kubectl -n bookinfo run fortio --image=fortio/fortio -it --rm -- \
  load -c 3 -qps 0 -n 30 http://ratings:9080/ratings/0
```

👀 Look for **503** responses. These are requests **rejected by the circuit breaker**,
not by the application. The application never even saw them.

💡 **Understand:** You just added chaos testing and circuit breaking to an application
whose source code you do not have and cannot compile.

---

## Lab 8 — Observability (30 min)

```bash
# First generate some traffic, otherwise dashboards will be empty
for i in $(seq 1 200); do curl -s localhost:8080/productpage > /dev/null; done

istioctl dashboard kiali       # service graph — this is the "wow" moment
istioctl dashboard grafana     # golden signals per service
istioctl dashboard jaeger      # distributed traces
```

**In Kiali:** switch on *Traffic Animation* and the *Security* badge. You will literally
see moving dots for requests and a 🔒 padlock icon on every encrypted edge. Show this to
your manager — it explains the value of mesh better than any slide.

🧪 **Practice:** In Grafana, find the p99 latency of `reviews → ratings`.
Nobody instrumented that. It exists only because the proxy measured it.

---

## Lab 9 — Ambient mode (45 min)

```bash
# Remove sidecar installation and install ambient
istioctl uninstall --purge -y && kubectl delete ns istio-system
istioctl install --set profile=ambient -y

kubectl label namespace bookinfo istio-injection-              # remove sidecar label
kubectl label namespace bookinfo istio.io/dataplane-mode=ambient
kubectl -n bookinfo rollout restart deploy

kubectl -n bookinfo get pods
# 👀 READY is back to 1/1 — no sidecar! But mTLS is STILL working, via ztunnel.

kubectl -n istio-system get daemonset ztunnel
```

Now add L7 capability only where you need it:

```bash
istioctl waypoint apply -n bookinfo --enroll-namespace
kubectl -n bookinfo get pods -l gateway.networking.k8s.io/gateway-name
```

💡 **Understand the trade-off clearly:**
- **Without waypoint:** you get mTLS + L4 authorization + TCP metrics, at almost no cost
- **With waypoint:** you additionally get HTTP routing, header-based authorization,
  HTTP metrics

**You pay for L7 only where you actually use it.** That is the whole design idea of
ambient mode.

---

## Lab 10 — Canary upgrade of the control plane (30 min)

**This is the most valuable lab in the entire list.** Please do it twice.

```bash
# Install a SECOND control plane with a revision name
istioctl install --set profile=default --set revision=1-24-0 -y
kubectl -n istio-system get pods            # 👀 two control planes running together

# Move the namespace to the new revision
kubectl label ns bookinfo istio-injection- istio.io/rev=1-24-0 --overwrite
kubectl -n bookinfo rollout restart deploy  # workloads pick up the new revision

# Verify which istiod each proxy is connected to
istioctl proxy-status

# Only after verification, remove the old one
istioctl uninstall --revision=<old-revision> -y
```

💡 If your production Istio upgrade ever goes wrong, it will be because you did not do
this. Practise it until it feels boring.

---

## Lab 11 — Break it on purpose (45 min)

This is how you actually learn. Create each problem, then **diagnose it yourself
before** reading the fix.

| Break this | What you will see | Diagnose using |
|---|---|---|
| Rename the Service port from `http` to `myport` | L7 routing and metrics silently disappear | `istioctl proxy-config listener` |
| Use a `subset` without creating DestinationRule | 503 with flag `NR` | `istioctl proxy-config cluster`, `istioctl analyze` |
| Set STRICT mTLS, then add a pod without sidecar | Connection reset | `istioctl x describe pod` |
| Create two VirtualServices for the same host | Routing becomes unpredictable | `istioctl analyze` |
| Put a typo in AuthorizationPolicy principal | 403 RBAC denied | proxy access logs |
| Delete the Gateway which HTTPRoute points to | 404 at the edge | `kubectl get httproute -o yaml` → check status |

---
---

# PART 7 — TROUBLESHOOTING PLAYBOOK

## 7.1 The diagnostic ladder — always follow this order

Do not jump randomly. Go step by step, top to bottom.

```
  1. istioctl analyze -n <ns>           Is my CONFIGURATION valid?
              ↓ (if clean)
  2. istioctl proxy-status              Did it REACH the proxies? (SYNCED or STALE?)
              ↓ (if SYNCED)
  3. istioctl proxy-config <t> <pod>    What config does Envoy ACTUALLY have?
              ↓
  4. kubectl logs <pod> -c istio-proxy  What happened to the actual REQUEST?
              ↓
  5. Check the Envoy response flag      WHY did it fail? (table below)
```

> 💡 **In my experience, 80% of "Istio is not working" problems are caught at step 1 or
> step 2.** Please do not skip them and go directly to reading Envoy config.

---

## 7.2 Envoy response flags — how to decode a 503

When you see a 503, the access log contains a short flag. **This flag tells you the
exact reason.** Please learn at least the first five.

| Flag | Full form | What it actually means | Usual cause |
|---|---|---|---|
| `NR` | **No Route** | Envoy has no idea where to send this | VirtualService/HTTPRoute not matching; subset has no DestinationRule; host mismatch |
| `UF` | **Upstream Failure** | Could not connect to destination | mTLS mismatch, app not listening, wrong port |
| `UC` | **Upstream Connection termination** | Destination closed the connection | Idle timeout mismatch, or app crashed |
| `UO` | **Upstream Overflow** | **Circuit breaker rejected it** | `connectionPool` limits reached |
| `URX` | Retry limit exceeded | Retried, still failed every time | Upstream genuinely down |
| `DC` | Downstream Connection termination | Client gave up and disconnected | Your own client timeout is shorter than the mesh timeout |
| `403 RBAC` | — | Blocked by AuthorizationPolicy | Wrong principal, missing JWT, or deny-all still active |

🔹 **Example:** You see `503 UO` during peak hours only. Meaning: circuit breaker.
Your `connectionPool.http.http1MaxPendingRequests` is too low for peak traffic.
Increase it. If instead you had seen `503 NR`, the meaning would be completely
different — a routing configuration problem.

---

## 7.3 Symptom → Cause → Command

| What you see | Most likely cause | Run this |
|---|---|---|
| Pod shows `1/1` instead of `2/2` | Namespace not labelled, or pod created before the label | `kubectl get ns -L istio-injection -L istio.io/rev` |
| Immediate 503 with `NR` | Route not programmed at all | `istioctl proxy-config route <pod> -o json` |
| 503 `UF` right after enabling STRICT | Some caller has no sidecar | `istioctl x describe pod <pod>` |
| 503 `UO` only under load | Circuit breaker tripped | `istioctl proxy-config cluster <pod> -o json \| grep -A5 circuitBreakers` |
| 404 from the gateway | Gateway host ≠ VirtualService host, or `spec.gateways` missing | `istioctl proxy-config route deploy/<gateway>` |
| Metrics and L7 routing missing for one service | **Service port not named** `http`/`grpc`, or `appProtocol` not set | `kubectl get svc <svc> -o yaml` |
| Everything returns 403 after applying policy | deny-all applied, no matching ALLOW yet | `istioctl proxy-config log <pod> --level rbac:debug` |
| Config change has no effect | Proxy is STALE, config did not reach | `istioctl proxy-status` |
| Traces show only one hop | **Application is not forwarding trace headers** | Check application code — mesh cannot fix this |
| App crashes at startup calling a dependency | App started before sidecar was ready | Set `holdApplicationUntilProxyStarts: true` |
| istiod using huge memory, pushes are slow | Every proxy getting config for every service | Add a `Sidecar` resource with `egress.hosts` |
| Job / CronJob never completes | Sidecar keeps running forever, so Job never finishes | Use native sidecars (K8s 1.29+) or call `/quitquitquit` |

---

## 7.4 The classic mistakes — please read before your first production incident

**1. Port naming — the number one silent killer**

Your Kubernetes Service port **must** be named `http`, `http2`, `grpc`, `https`, `tcp`,
`mongo`, etc. (or you set `appProtocol`).

```yaml
ports:
  - name: web          # ❌ WRONG — Istio treats this as plain TCP
    port: 8080
  - name: http         # ✅ CORRECT
    port: 8080
```

If you name it wrongly, Istio treats it as opaque TCP. Result: **no L7 routing, no HTTP
metrics, no header-based rules** — and **no error message anywhere**. Everything just
silently does not work. Many engineers have lost full days on this.

**2. Subset without DestinationRule** → instant 503 `NR`. VirtualService *uses* subsets;
DestinationRule *defines* them. Always deploy both together, in the same file if
possible.

**3. Going to STRICT mTLS too early.** Anything without a sidecar breaks immediately —
a Job, a debug pod, Prometheus scraping directly. Always observe in PERMISSIVE first.

**4. `RequestAuthentication` alone protects nothing.** It only validates a token if
present. To *require* a token you need an AuthorizationPolicy. Please double-check this
in your own cluster today.

**5. `EnvoyFilter` is not a stable API.** It manipulates Envoy internals directly and
can break on any Istio upgrade. Use `Telemetry`, `WasmPlugin` or a proper field first.
EnvoyFilter only as last resort — and document it, so the person doing the next upgrade
knows.

**6. `demo` profile in production.** 100% trace sampling will make your observability
bill bigger than your compute bill.

**7. In-place control plane upgrade.** Always use revisions. Always.

---
---

# PART 8 — CHEAT SHEET

## 8.1 istioctl commands you will actually use

```bash
# ══ INSTALL / LIFECYCLE ══════════════════════════════════════════════
istioctl x precheck                        # is this cluster ready for Istio?
istioctl install --set profile=default -y
istioctl install --set revision=1-24-0 -y  # canary control plane
istioctl verify-install
istioctl uninstall --revision=<rev> -y

# ══ INSPECT ══════════════════════════════════════════════════════════
istioctl proxy-status                      # ⭐ START HERE. SYNCED or STALE?
istioctl proxy-config listener <pod> -n <ns>
istioctl proxy-config route    <pod> -n <ns>
istioctl proxy-config cluster  <pod> -n <ns>
istioctl proxy-config endpoint <pod> -n <ns>
istioctl proxy-config secret   <pod> -n <ns>   # the workload's certificates
istioctl x describe pod <pod>  -n <ns>         # ⭐ explains everything in English

# ══ DIAGNOSE ═════════════════════════════════════════════════════════
istioctl analyze -n <ns>
istioctl analyze --all-namespaces
istioctl proxy-config log <pod> --level http:debug,rbac:debug

# ══ DASHBOARDS ═══════════════════════════════════════════════════════
istioctl dashboard kiali | grafana | jaeger | envoy <pod>

# ══ AMBIENT MODE ═════════════════════════════════════════════════════
istioctl waypoint apply -n <ns> --enroll-namespace
istioctl waypoint list -n <ns>
istioctl ztunnel-config workload
```

## 8.2 API equivalence — same work, three syntaxes

| What you want | Ingress | Gateway API | Istio native |
|---|---|---|---|
| Expose a hostname | `rules[].host` | `Gateway.listeners[].hostname` | `Gateway.servers[].hosts` |
| Path routing | `rules[].http.paths` | `HTTPRoute.rules[].matches` | `VirtualService.http[].match` |
| Header routing | annotation | `matches[].headers` | `match[].headers` |
| TLS termination | `spec.tls` | `listeners[].tls.certificateRefs` | `Gateway.servers[].tls` |
| Weighted split | annotation | `backendRefs[].weight` | `route[].weight` |
| Redirect / rewrite | annotation | `filters` | `http[].redirect` / `.rewrite` |
| Timeout | annotation | `rules[].timeouts` | `http[].timeout` |
| Retries | annotation | ⚠️ limited | `http[].retries` |
| Mirroring | ❌ | `RequestMirror` filter | `http[].mirror` |
| Circuit breaking | ❌ | ❌ | `DestinationRule.outlierDetection` |
| Fault injection | ❌ | ❌ | `http[].fault` |
| Session affinity | annotation | ⚠️ experimental | `loadBalancer.consistentHash` |
| mTLS between services | ❌ | ❌ | `PeerAuthentication` |
| Service-to-service authz | ❌ | ❌ | `AuthorizationPolicy` |
| JWT validation | vendor | ❌ | `RequestAuthentication` |
| External service | ❌ | ❌ | `ServiceEntry` |
| East-west routing | ❌ | GAMMA | `VirtualService` |

## 8.3 Labels and annotations to remember

```bash
istio-injection=enabled                  # enable sidecar (on namespace)
istio.io/rev=<revision>                  # revision-based injection
istio.io/dataplane-mode=ambient          # enable ambient mode (on namespace)
sidecar.istio.io/inject="false"          # opt a specific pod OUT
proxy.istio.io/config                    # per-pod proxy config override
holdApplicationUntilProxyStarts: "true"  # fix app-starts-before-sidecar problem
traffic.sidecar.istio.io/excludeOutboundPorts
```

## 8.4 Checklist before you apply any routing change

Please go through these 7 points every time. It will save you hours.

1. Is the Service port **named** `http` / `grpc` / etc. (or `appProtocol` set)?
2. Does every `subset` you referenced have a matching **DestinationRule**?
3. Does the VirtualService list the correct **Gateway** in `spec.gateways`?
4. Do the **hosts match exactly** between Gateway and VirtualService?
5. Is the **more specific match rule written first**? (first match wins)
6. Is `istioctl analyze` clean?
7. Is `istioctl proxy-status` showing all **SYNCED**?

---
---

# PART 9 — QUESTIONS AND ANSWERS (for interviews and for clarity)

**Q1. What is the difference between Ingress and Gateway API?**

Ingress is a single frozen resource where anything beyond host and path routing has to
be done through vendor annotations — so there is no portability and no separation
between teams. Gateway API splits the same work into GatewayClass (infra provider),
Gateway (platform team) and HTTPRoute (application developer), so RBAC actually works.
It also puts weights, header matching and redirects inside the specification itself, so
manifests are portable across implementations. It is GA since October 2023 and is the
official successor to Ingress.

---

**Q2. Should we use Gateway API or Istio?**

This question itself is incorrect — they are not at the same level. Gateway API is a
*specification*; Istio is one of its *implementations*. You set
`gatewayClassName: istio` and Istio programs the gateway. The real question is whether
you need east-west (mesh) capability on top of ingress.

---

**Q3. What can Istio do which an ingress controller fundamentally cannot?**

Everything east-west. An ingress controller only sees traffic entering the cluster. Once
the request reaches service A, the call from A to B is completely invisible to it. Istio
places a proxy next to every workload, so that internal call gets mTLS, workload
identity, authorization, retries, circuit breaking and metrics — with zero code change.

---

**Q4. Then what is actually SAME between them?**

Both are declarative Kubernetes APIs, reconciled by a controller, which finally
configure a proxy. Both route by host and path to a Service. Both terminate TLS from
Secrets. Both select the implementation using a class field. For plain edge exposure
they are functionally identical — and in fact Istio's ingress gateway *is* an ingress
controller.

---

**Q5. Sidecar mode or ambient mode — which one?**

Sidecar puts an Envoy inside every pod: full Layer 7 features everywhere, but around
50–100 MB per pod and a pod restart needed to enable or upgrade. Ambient uses a
per-node ztunnel for L4 and mTLS with no pod changes at all, and an optional per-namespace
waypoint proxy when you need L7. Ambient is much cheaper and can be adopted without
restarting anything; you pay for L7 only where you deploy a waypoint. Ambient became GA
in Istio 1.24.

---

**Q6. How does Istio do mTLS without me configuring any certificate?**

istiod acts as a Certificate Authority. When a workload's proxy starts, it requests a
certificate, proving its identity using its Kubernetes ServiceAccount token. istiod
issues a short-lived X.509 certificate carrying a SPIFFE ID like
`spiffe://cluster.local/ns/foodkart/sa/order-service`, and rotates it automatically.
Your policies then refer to that identity instead of IP addresses.

---

**Q7. How do you upgrade Istio safely in production?**

Revision-based canary upgrade. Install a second control plane using
`--set revision=<new>`, move namespaces one by one using the `istio.io/rev` label,
restart the workloads, verify with `istioctl proxy-status`, and only then uninstall the
old revision. Use revision *tags* so that application namespaces point to a stable alias
instead of a hardcoded version. Never do in-place upgrade.

---

**Q8. What are the biggest operational risks with Istio?**

(1) In-place control plane upgrades. (2) Configuration blow-up — every proxy receiving
config for every service; fix it using the `Sidecar` resource. (3) Enabling STRICT mTLS
before everything has a sidecar. (4) `EnvoyFilter` breaking during upgrade.
(5) Unnamed Service ports silently disabling all Layer 7 behaviour.

---

**Q9. When would you advise a team NOT to adopt Istio?**

If they have less than about 15 services, a single team, no compliance requirement, or
no platform capacity to own it. A mesh is a platform commitment, not a library you
import. If they only want mTLS and metrics, Linkerd is much simpler. If they only want
better ingress, plain Gateway API is enough.

---

**Q10. What is GAMMA?**

GAMMA is the Gateway API working group's mesh initiative. An `HTTPRoute` whose
`parentRef` is a **Service** (instead of a Gateway) configures east-west traffic. It is
the standardised, portable way to express mesh routing, and it is where the ingress
world and the mesh world are converging. Mesh support reached the Standard channel in
Gateway API v1.1.

---

**Q11. Does Istio replace NetworkPolicy?**

No — they are complementary and work at different layers. NetworkPolicy is L3/L4,
enforced by the CNI in the kernel, based on IPs and labels. Istio AuthorizationPolicy is
L7, enforced by the proxy, based on cryptographic identity, HTTP method, path and JWT
claims. Best practice is to use **both**: NetworkPolicy as the coarse network floor, and
Istio for identity-aware and L7-aware rules.

---

**Q12. How much latency does Istio add?**

Roughly 1–3 ms per proxy hop with sidecars — so about 2–6 ms round trip for a
service-to-service call where both sides have sidecars. Ambient's L4 path is lighter.
But please always measure with your own payload sizes and traffic pattern rather than
quoting a number from a blog. That is the correct answer to give in an interview also.

---
---

# PART 10 — GLOSSARY, ROADMAP AND RESOURCES

## 10.1 Glossary

| Term | Simple meaning |
|---|---|
| **Data plane** | The proxies which actually carry your traffic (Envoy / ztunnel) |
| **Control plane** | `istiod` — the brain which calculates config and pushes it |
| **xDS** | The protocol istiod uses to push config: LDS, RDS, CDS, EDS |
| **Sidecar** | An Envoy container running next to your app container in the same pod |
| **ztunnel** | Ambient mode's per-node L4 proxy which provides mTLS |
| **Waypoint** | Ambient mode's optional per-namespace Envoy for L7 features |
| **HBONE** | The mTLS tunnel protocol used by ambient mode |
| **SPIFFE / SVID** | The universal workload identity standard / the certificate carrying it |
| **GAMMA** | Gateway API for Mesh Management and Administration |
| **North-south** | Traffic entering or leaving the cluster |
| **East-west** | Traffic between services inside the cluster |
| **Subset** | A named group of a service's pods (like `v1`), defined in DestinationRule |
| **Outlier detection** | Automatically removing unhealthy pods = circuit breaking |
| **Revision** | A versioned Istio control plane install, used for canary upgrades |
| **Golden signals** | Latency, traffic, errors, saturation — the four key metrics |

## 10.2 A realistic 4-week study plan

| Week | Topics | You are done when you can… |
|---|---|---|
| **1** | Concepts + Ingress + Gateway API. Labs 0–3 | Explain "spec vs implementation" and "north-south vs east-west" without looking |
| **2** | Traffic management. Labs 4 and 7 | Do a header-based canary and trip a circuit breaker from memory |
| **3** | Security + observability. Labs 5, 6, 8 | Roll out STRICT mTLS and deny-by-default authorization, and read the Kiali graph |
| **4** | Operations. Labs 9, 10, 11 | Do a revision-based canary upgrade, and debug a 503 NR using only `istioctl` |

**After that, for depth:** multi-cluster, WasmPlugin, `Sidecar` scoping at scale, and
performance benchmarking.

## 10.3 Where to read further

- Istio documentation — https://istio.io/latest/docs/
- Istio ambient mode — https://istio.io/latest/docs/ambient/
- Istio + Gateway API — https://istio.io/latest/docs/tasks/traffic-management/ingress/gateway-api/
- Gateway API — https://gateway-api.sigs.k8s.io/
- GAMMA (mesh) — https://gateway-api.sigs.k8s.io/mesh/
- List of Gateway API implementations — https://gateway-api.sigs.k8s.io/implementations/
- Envoy documentation (needed for real debugging) — https://www.envoyproxy.io/docs/envoy/latest/

---

## The five sentences to remember

If you forget everything else, please keep these five:

1. **Gateway API is a specification. Istio is an implementation of it.** They are not
   competitors.

2. **Ingress and Gateway API stop at the main gate.** Whatever happens inside the
   cluster is completely invisible to them — and that is exactly the mesh's territory.

3. **Annotation lock-in is the reason Gateway API was created.** Portability is the
   benefit you get.

4. **You adopt Istio for identity, encryption, policy and per-hop visibility** — not for
   routing. Routing everybody can do.

5. **A mesh is a platform commitment, not a library.** Migrate Ingress → Gateway API →
   Istio, one namespace at a time, otherwise it will not survive.
